import { describe, test, expect, spyOn } from "bun:test";
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, symlinkSync, rmSync } from "fs";
import { join } from "path";
import { RUN, SITE } from "./helpers";
import { readPid, isAlive, claimPidFile, releasePidFile, exitOnSignal, stopServer } from "../server/pid";
import { configLines, printConfig } from "../server/config";
import { LocalStorage, S3Storage, storageAt, seedLocalSite } from "../server/storage";
import { loadSecret, signJwt, verifyJwt, ensureAdmin } from "../server/auth";
import { handleError } from "../server/routes/error";
import { fromSite, viewLine, logView } from "../server/log";
import { scaffoldNotice } from "../server/scaffold";
import { dateHtml, canonicalPath, outsideCode } from "../server/utils";
import { kept, siteChanged } from "../server/kept";
import type { Storage } from "../server/storage";

const scratch = (name: string) => join(RUN, `units-${name}`);

describe("pid", () => {
  test("readPid: the number in the file, or 0", () => {
    const file = scratch("read.pid");
    expect(readPid(file)).toBe(0);
    writeFileSync(file, "123\n");
    expect(readPid(file)).toBe(123);
    writeFileSync(file, "garbage");
    expect(readPid(file)).toBe(0);
  });

  test("isAlive: this process yes; root's launchd yes (EPERM); a finished one no", async () => {
    expect(isAlive(process.pid)).toBe(true);
    expect(isAlive(1)).toBe(true);
    const done = Bun.spawn(["true"]);
    await done.exited;
    expect(isAlive(done.pid)).toBe(false);
  });

  test("claimPidFile: off when no file is configured", () => {
    expect(() => claimPidFile("")).not.toThrow();
  });

  test("claimPidFile: refuses a file a live duckdown holds", () => {
    const file = scratch("held.pid");
    writeFileSync(file, `${process.ppid}\n`);
    expect(() => claimPidFile(file, process.pid, () => true)).toThrow(`already running as pid ${process.ppid}`);
    expect(readPid(file)).toBe(process.ppid);
  });

  test("claimPidFile: takes over a live pid that isn't a duckdown", async () => {
    // The container case: the file outlives a hard kill on a volume and the
    // pid it names now belongs to something else. A spawned sleep is alive and
    // `ps` plainly says "sleep", which is the point — this must not depend on
    // what the command line of whatever launched the test happens to contain.
    const other = Bun.spawn(["sleep", "30"]);
    const file = scratch("recycled.pid");
    writeFileSync(file, `${other.pid}\n`);
    try {
      expect(() => claimPidFile(file)).not.toThrow();
      expect(readPid(file)).toBe(process.pid);
    } finally {
      other.kill("SIGKILL");
      await other.exited;
    }
  });

  test("claimPidFile: takes over a stale file, and releasePidFile removes it", async () => {
    const file = scratch("stale.pid");
    const done = Bun.spawn(["true"]);
    await done.exited;
    writeFileSync(file, `${done.pid}\n`);
    claimPidFile(file);
    expect(readPid(file)).toBe(process.pid);
    releasePidFile();
    expect(existsSync(file)).toBe(false);
  });

  test("releasePidFile leaves a file some other process has since written", () => {
    const file = scratch("taken.pid");
    claimPidFile(file);
    writeFileSync(file, "999999\n");
    releasePidFile();
    expect(readPid(file)).toBe(999999);
  });

  test("exitOnSignal exits 128 + the signal number", () => {
    const exit = spyOn(process, "exit").mockImplementation((() => {}) as never);
    try {
      exitOnSignal("SIGINT");
      exitOnSignal("SIGTERM");
      expect(exit.mock.calls).toEqual([[130], [143]]);
    } finally {
      exit.mockRestore();
    }
  });
});

describe("kept", () => {
  const pages = {} as Storage;   // what's built from it isn't read here

  test("builds once per key, again after siteChanged, and every time in development", async () => {
    let builds = 0;
    let drops = 0;
    const count = kept(async (_, key) => `${key}:${++builds}`, () => drops++);
    expect(await count(pages, "a", false)).toBe("a:1");
    expect(await count(pages, "a", false)).toBe("a:1");
    expect(await count(pages, "b", false)).toBe("b:2");
    siteChanged();
    expect(drops).toBe(1);
    expect(await count(pages, "a", false)).toBe("a:3");
    expect(await count(pages, "a", true)).toBe("a:4");
    expect(await count(pages, "a", true)).toBe("a:5");
    expect(await count(pages, "a", false)).toBe("a:3");   // development didn't touch what's kept
  });

  test("doesn't keep a failure, nor let a late one drop a newer build", async () => {
    let fail: (e: Error) => void = () => {};
    let builds = 0;
    const flaky = kept(async () => {
      if (++builds === 1) return new Promise<string>((_, reject) => { fail = reject; });
      return `ok ${builds}`;
    });
    const first = flaky(pages, "", false);
    siteChanged();                                        // the pages changed while it was building
    expect(await flaky(pages, "", false)).toBe("ok 2");
    fail(new Error("disk"));
    await expect(first).rejects.toThrow("disk");
    expect(await flaky(pages, "", false)).toBe("ok 2");   // still the newer one
    let tries = 0;
    const broken = kept(async () => { throw new Error(`down ${++tries}`); });
    await expect(broken(pages, "", false)).rejects.toThrow("down 1");
    await expect(broken(pages, "", false)).rejects.toThrow("down 2");   // built again, not kept
  });
});

describe("stop", () => {
  // A stand-in process whose command line names main.ts, so it passes for a
  // duckdown server; `code` runs in it, and it says "ready" once it has.
  async function standIn(code = "") {
    const proc = Bun.spawn(["bun", "-e", `${code}; console.log("ready"); setInterval(() => {}, 1000)`, "main.ts"], { stdout: "pipe" });
    const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();
    await reader.read();
    reader.releaseLock();
    return proc;
  }

  function said(method: "log" | "error", run: () => Promise<number>) {
    const spy = spyOn(console, method).mockImplementation(() => {});
    return run().then((code) => {
      const message = String(spy.mock.calls[0]?.[0]);
      spy.mockRestore();
      return { code, message };
    });
  }

  test("nothing to stop: no pid file configured, or none written", async () => {
    expect(await said("log", () => stopServer(""))).toEqual({
      code: 0, message: "No pid file is configured (DUCKDOWN_PID is empty), so there's nothing to stop.",
    });
    const file = scratch("absent.pid");
    expect(await said("log", () => stopServer(file))).toEqual({ code: 0, message: `Nothing to stop: no server pid in ${file}.` });
  });

  test("a stale pid file is removed, and nothing is signalled", async () => {
    const file = scratch("stop-stale.pid");
    const done = Bun.spawn(["true"]);
    await done.exited;
    writeFileSync(file, `${done.pid}\n`);
    expect(await said("log", () => stopServer(file))).toEqual({
      code: 0, message: `pid ${done.pid} wasn't running; removed the stale ${file}.`,
    });
    expect(existsSync(file)).toBe(false);
  });

  test("a pid that now belongs to something else is left alone", async () => {
    const other = Bun.spawn(["sleep", "30"]);
    const file = scratch("stop-other.pid");
    writeFileSync(file, `${other.pid}\n`);
    try {
      const { code, message } = await said("error", () => stopServer(file));
      expect(code).toBe(1);
      expect(message).toContain("isn't a duckdown server, so it was left alone");
      expect(isAlive(other.pid)).toBe(true);
      expect(existsSync(file)).toBe(true);
    } finally {
      other.kill("SIGKILL");
    }
  });

  test("stops a server, tidying a pid file it left behind", async () => {
    const server = await standIn(); // dies on SIGTERM without touching the file
    const file = scratch("stop-untidy.pid");
    writeFileSync(file, `${server.pid}\n`);
    expect(await said("log", () => stopServer(file))).toEqual({ code: 0, message: `Stopped duckie (pid ${server.pid}).` });
    expect(await server.exited).toBe(143);
    expect(existsSync(file)).toBe(false);
  });

  test("says so when a server won't stop", async () => {
    const stubborn = await standIn("process.on('SIGTERM', () => {})");
    const file = scratch("stop-stubborn.pid");
    writeFileSync(file, `${stubborn.pid}\n`);
    try {
      const { code, message } = await said("error", () => stopServer(file, 200));
      expect(code).toBe(1);
      expect(message).toBe(`pid ${stubborn.pid} didn't stop within 0.2s; it's still running.`);
      expect(isAlive(stubborn.pid)).toBe(true);
    } finally {
      stubborn.kill("SIGKILL");
    }
  });

  test("bun run stop's entry only acts when run", async () => {
    await import("../server/stop"); // imported, not run: stops nothing
  });
});

describe("config", () => {
  const local = { s3: false, bucket: "", prefix: "", endpoint: "", remote: "", path: "/srv/site", debug: false, pidFile: "/run/d.pid", pid: 7 };

  test("describes local storage, production, and the pid file", () => {
    expect(configLines(local)).toEqual(["duckie", "  storage: /srv/site", "  mode: production", "  pid: 7 (/run/d.pid)"]);
  });

  test("says where the site is published from here, when it is (n114)", () => {
    expect(configLines({ ...local, remote: "git" })).toContain("  remote: git (Publish in the editor pushes the site)");
  });

  test("describes S3 storage and its endpoint, in development, without a pid file", () => {
    const s3 = { ...local, s3: true, bucket: "b", prefix: "site/", endpoint: "http://minio:9000", debug: true, pidFile: "" };
    expect(configLines(s3)).toEqual(["duckie", "  storage: s3://b/site/", "  endpoint: http://minio:9000", "  mode: development"]);
    expect(configLines({ ...s3, endpoint: "" })).not.toContain("  endpoint: ");
  });

  test("printConfig prints this process's lines", () => {
    const log = spyOn(console, "log").mockImplementation(() => {});
    try {
      printConfig();
      expect(log.mock.calls.map((c) => c[0])).toEqual(configLines());
    } finally {
      log.mockRestore();
    }
  });
});

describe("storage", () => {
  test("storageAt picks S3 or the local folder", () => {
    expect(storageAt("pages/", true)).toBeInstanceOf(S3Storage);
    expect(storageAt("pages/", false)).toBeInstanceOf(LocalStorage);
  });

  test("LocalStorage: list, write, read, exists, remove", async () => {
    const root = scratch("local");
    const store = new LocalStorage(root);
    expect(await store.list("")).toEqual({ files: [], folders: [] }); // root not made yet
    await store.write("a/b.md", "hello");
    await store.write("a/.hidden", "x");
    await store.write("a/c/d.md", "deeper");
    const listing = await store.list("a");
    expect(listing.files.map((f) => f.name)).toEqual(["b.md"]);
    expect(listing.files[0]).toMatchObject({ path: "a/b.md", file: true, size: 5, type: "text/markdown" });
    expect(listing.folders).toEqual([{ name: "c", path: "a/c", file: false }]);
    expect(await store.read("a/b.md")).toBe("hello");
    expect(new TextDecoder().decode(await store.readBytes("a/b.md"))).toBe("hello");
    expect(await store.exists("a/b.md")).toBe(true);
    expect(await store.exists("a")).toBe(false); // a folder isn't a file
    expect(await store.exists("")).toBe(false);
    await store.remove("a/b.md");
    expect(await store.exists("a/b.md")).toBe(false);
    expect(store.mime("x.unknown")).toBe("application/octet-stream");
  });

  test("LocalStorage refuses paths outside its root, including prefix-sharing siblings", async () => {
    const store = new LocalStorage(scratch("pages"));
    await expect(store.read("../../etc/passwd")).rejects.toThrow("Path traversal denied");
    await expect(store.read("../units-pages-old/x.md")).rejects.toThrow("Path traversal denied");
  });

  // A write is judged, then made: a folder that appears at its name in
  // between fails the rename, and the file written beside it goes too — a .
  // name, listed nowhere, that keys() and so `bucket push` would carry.
  test("LocalStorage leaves nothing beside a write that fails", async () => {
    const root = scratch("late-folder");
    const store = new LocalStorage(root);
    await store.write("kept.md", "x");
    const writing = store.write("late.md", "x");   // judged, and under way
    mkdirSync(join(root, "late.md"));               // a folder there before it lands
    await expect(writing).rejects.toThrow();
    expect(readdirSync(root).sort()).toEqual(["kept.md", "late.md"]);
  });

  // The disk's half of the contract's links (n172): each one it doesn't
  // follow is said, once, where a page used to vanish without a word; and
  // none is a way out of the root, to read, write or remove through.
  test("LocalStorage says once which links it doesn't follow, and goes out of its root through none", async () => {
    const root = scratch("linked");
    const away = scratch("linked-away");
    mkdirSync(join(away, "folder"), { recursive: true });
    writeFileSync(join(away, "away.md"), "not the site's");
    const store = new LocalStorage(root);
    await store.write("page.md", "mine");
    symlinkSync(join(away, "away.md"), join(root, "out.md"));
    symlinkSync(join(away, "folder"), join(root, "out"));
    symlinkSync(root, join(root, "round"));                          // a walk into it would never end
    symlinkSync(join(root, "gone.md"), join(root, "nothing.md"));
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await store.list("")).toMatchObject({ files: [{ name: "page.md" }], folders: [] });
      await store.list("");
      expect(await store.keys()).toEqual(["page.md"]);
      const why = "duckdown lists only a link to a file in the site, so this one is left out";
      expect(warn.mock.calls.map((c) => c[0]).sort()).toEqual([
        `${join(root, "nothing.md")} is a link to nothing: ${why}`,
        `${join(root, "out")} is a link out of the site: ${why}`,
        `${join(root, "out.md")} is a link out of the site: ${why}`,
        `${join(root, "round")} is a link to a folder: ${why}`,
      ]);
    } finally {
      warn.mockRestore();
    }
    await expect(store.readBytes("out.md")).rejects.toThrow("Path traversal denied");
    await expect(store.write("out/x.md", "x")).rejects.toThrow("Path traversal denied");
    await expect(store.remove("out.md")).rejects.toThrow("Path traversal denied");
    expect(await store.list("out")).toEqual({ files: [], folders: [] });   // as a bucket, which holds nothing there
    expect(existsSync(join(away, "folder", "x.md"))).toBe(false);
  });

  // After review: the contract's sections (storage-contract.test.ts), and what
  // only the disk can show — what is said, once, and that nothing is written
  // through a section that is a link out.
  test("LocalStorage says once which section is a link and which link leads to what is read by name, and writes through neither", async () => {
    const site = scratch("sectioned");
    const away = scratch("sectioned-away");
    mkdirSync(join(site, "pages"), { recursive: true });
    mkdirSync(join(site, "static"), { recursive: true });
    mkdirSync(away, { recursive: true });
    writeFileSync(join(site, "users.json"), "{}");
    symlinkSync("../users.json", join(site, "pages", "hashes.md"));
    symlinkSync(away, join(site, "static", "images"));
    const pages = new LocalStorage(join(site, "pages"), site);
    const images = new LocalStorage(join(site, "static", "images"), site);
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      await pages.list("");
      await pages.list("");
      expect(await images.exists("x.png")).toBe(false);
      expect(await images.list("")).toEqual({ files: [], folders: [] });
      await expect(images.write("x.png", "x")).rejects.toThrow("Path traversal denied");
      expect(await images.keys()).toEqual([]);
      expect(warn.mock.calls.map((c) => c[0])).toEqual([
        `${join(site, "pages", "hashes.md")} is a link to users.json, which is read only by its own name: duckdown lists only a link to a file in the site, so this one is left out`,
        `${join(site, "static", "images")} is a link, and a section of the site is read only from its own folder there: nothing in it is read, listed or written`,
      ]);
    } finally {
      warn.mockRestore();
    }
    expect(existsSync(join(away, "x.png"))).toBe(false);
    // A storage made inside the site's folder, as bucket.ts and remote.ts make
    // theirs, is judged against the site too: a link from its pages to the
    // site's static/ is in the site, not out of pages/. (A . name, so nothing
    // else here lists it.)
    const linked = join(SITE, "pages", ".linked-theme.css");
    symlinkSync("../static/theme.css", linked);
    try {
      expect(await new LocalStorage(join(SITE, "pages")).exists(".linked-theme.css")).toBe(true);
    } finally {
      rmSync(linked);
    }
  });

  // The check and the read are one: the file is opened, then judged by where
  // the one opened really is. A link swapped between a check and a read was
  // read where it led by then (the review's race.ts: SECRET 2,431 times in
  // 2.8 seconds).
  test("LocalStorage reads only what it judged, however fast a link is swapped under it", async () => {
    const pages = scratch("race-pages");
    mkdirSync(pages, { recursive: true });
    writeFileSync(join(pages, "real.md"), "inside");
    const secret = scratch("race-secret.txt");
    writeFileSync(secret, "SECRET");
    symlinkSync(join(pages, "real.md"), join(pages, "x.md"));
    const store = new LocalStorage(pages);
    const swap = `const { symlinkSync, renameSync } = require("fs");
      const end = Date.now() + 1200;
      for (let i = 0; Date.now() < end; i++) {
        const tmp = ${JSON.stringify(pages)} + "/.swap" + i;
        symlinkSync(i % 2 ? ${JSON.stringify(secret)} : ${JSON.stringify(join(pages, "real.md"))}, tmp);
        renameSync(tmp, ${JSON.stringify(join(pages, "x.md"))});
      }`;
    const swapper = Bun.spawn(["bun", "-e", swap]);
    const seen = new Map<string, number>();
    const end = Date.now() + 1000;
    while (Date.now() < end) {
      const got = await store.read("x.md").catch((e: Error) => e.message.split(":")[0]!);
      seen.set(got, (seen.get(got) ?? 0) + 1);
    }
    await swapper.exited;
    expect(seen.get("SECRET")).toBeUndefined();
    expect(seen.get("inside")).toBeGreaterThan(0);
  });

  // A named pipe is opened only once something writes to it, so a read that
  // opened one waited — and a link out to one froze the whole server, event
  // loop and all, until it was killed (review's fifo.ts). A read is judged,
  // and must be of a file, before anything is opened. The reads run in a
  // child, killed if it waits, so a pipe opened here fails the test rather
  // than freezing the suite; listing and exists() open nothing.
  test("LocalStorage refuses a named pipe, in the site or through a link, without waiting on it", async () => {
    const root = scratch("piped");
    mkdirSync(join(root, "sub"), { recursive: true });
    const pipe = scratch("piped-away.fifo");
    Bun.spawnSync(["mkfifo", pipe]);
    Bun.spawnSync(["mkfifo", join(root, "in.md")]);
    symlinkSync(pipe, join(root, "out.css"));
    symlinkSync(join(root, "in.md"), join(root, "linked.md"));
    const read = `const { LocalStorage } = await import(${JSON.stringify(join(import.meta.dir, "..", "server", "storage.ts"))});
      const store = new LocalStorage(${JSON.stringify(root)});
      for (const key of ["in.md", "linked.md", "out.css"]) console.log(key, "-", await store.read(key).then(() => "read", (e) => e.message));`;
    const child = Bun.spawn(["bun", "-e", read], { stdout: "pipe", stderr: "ignore" });
    const waited = setTimeout(() => child.kill(), 3000);
    const said = (await new Response(child.stdout).text()).trim().split("\n");
    await child.exited;
    clearTimeout(waited);
    expect(said).toEqual(["in.md - in.md is not a file", "linked.md - linked.md is not a file", "out.css - Path traversal denied"]);
    const store = new LocalStorage(root);
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(store.read("sub")).rejects.toThrow("sub is not a file");
      expect(await store.exists("in.md")).toBe(false);
      expect(await store.list("")).toEqual({ files: [], folders: [{ name: "sub", path: "sub", file: false }] });
      expect(warn.mock.calls.map((c) => c[0]).sort()).toEqual([
        `${join(root, "linked.md")} is a link to what is not a file: duckdown lists only a link to a file in the site, so this one is left out`,
        `${join(root, "out.css")} is a link out of the site: duckdown lists only a link to a file in the site, so this one is left out`,
      ]);
    } finally {
      warn.mockRestore();
    }
  }, 10000);

  test("seedLocalSite copies the seed once, and only for a local site with a seed", () => {
    const seed = scratch("seed");
    mkdirSync(join(seed, "pages"), { recursive: true });
    writeFileSync(join(seed, "pages", "index.md"), "title: seed\n\n");
    const target = scratch("seeded");
    const log = spyOn(console, "log").mockImplementation(() => {});
    try {
      seedLocalSite(seed, target, true); // S3: nothing to copy into
      seedLocalSite("", target, false); // no seed
      expect(existsSync(target)).toBe(false);
      seedLocalSite(seed, target, false);
      expect(readFileSync(join(target, "pages", "index.md"), "utf8")).toBe("title: seed\n\n");
      writeFileSync(join(target, "pages", "index.md"), "edited");
      seedLocalSite(seed, target, false); // already there: left alone
      expect(readFileSync(join(target, "pages", "index.md"), "utf8")).toBe("edited");
      expect(log).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
    }
  });
});

describe("auth", () => {
  test("loadSecret: the configured secret, a dev default with a warning, or a refusal", () => {
    expect(loadSecret("s3cret", false)).toBe("s3cret");
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(loadSecret("", true)).toBe("duckie-dev-secret");
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
    expect(() => loadSecret("", false)).toThrow("COOKIE_SECRET must be set");
    // In duckdown's own checkout there is nothing to scaffold, so the message stays plain.
    expect(() => loadSecret("", false)).not.toThrow("bun run setup");
  });

  test("verifyJwt accepts our tokens and nothing else", async () => {
    const now = Math.floor(Date.now() / 1000);
    const good = await signJwt({ sub: "admin", exp: now + 60 });
    expect((await verifyJwt(good))?.sub).toBe("admin");
    expect(await verifyJwt("only.two")).toBeNull();
    expect(await verifyJwt(good.slice(0, -2) + "AA")).toBeNull(); // signature altered
    expect(await verifyJwt(await signJwt({ sub: "admin", exp: now - 1 }))).toBeNull(); // expired
    expect(await verifyJwt("a.b.c!")).toBeNull(); // not base64
  });

  test("ensureAdmin writes the environment's admin, and only when it changes", async () => {
    const usersFile = join(SITE, "users.json");
    const read = () => JSON.parse(readFileSync(usersFile, "utf8")) as Record<string, string>;
    const log = spyOn(console, "log").mockImplementation(() => {});
    try {
      expect(await ensureAdmin(undefined, "robot")).toBe(false); // nothing set: a local run
      expect(read().robot).toBeUndefined();

      expect(await ensureAdmin("first-one", "robot")).toBe(true);
      expect(await Bun.password.verify("first-one", read().robot!)).toBe(true);
      expect(read().admin).toBeDefined(); // the site's own users are left alone

      expect(await ensureAdmin("first-one", "robot")).toBe(false); // same password, no write
      expect(await ensureAdmin("second-one", "robot")).toBe(true); // changed: rewritten
      expect(await Bun.password.verify("second-one", read().robot!)).toBe(true);
    } finally {
      log.mockRestore();
      const users = JSON.parse(readFileSync(usersFile, "utf8"));
      delete users.robot;
      writeFileSync(usersFile, JSON.stringify(users, null, 2) + "\n");
    }
  });
});

describe("error handler", () => {
  test("logs the error and answers 500 with a line to show", async () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = handleError(new Error("boom"));
      expect(res.status).toBe(500);
      expect(await res.text()).toBe("Server error"); // DEBUG is off in tests
      expect(error).toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });
});

describe("view log", () => {
  const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });

  test("fromSite: another site's host, never your own and never the full URL", () => {
    expect(fromSite("https://news.ycombinator.com/item?id=1", "www.blueshed.co.uk")).toBe("news.ycombinator.com");
    // A search referrer carries what was typed; only the host is kept.
    expect(fromSite("https://www.google.com/search?q=someone+private", "www.blueshed.co.uk")).toBe("www.google.com");
    expect(fromSite("https://www.blueshed.co.uk/journey/", "www.blueshed.co.uk")).toBe(""); // following a link through the site
    expect(fromSite("", "www.blueshed.co.uk")).toBe("");
    expect(fromSite("not a url", "www.blueshed.co.uk")).toBe("");
  });

  test("viewLine says what was read, and nothing about who read it", () => {
    expect(viewLine("/journey/", 200, 12.4, "", "Mozilla/5.0")).toBe("view /journey/ 200 12ms");
    expect(viewLine("/", 200, 3, "lobste.rs", "Mozilla/5.0")).toBe("view / 200 3ms from=lobste.rs");
    expect(viewLine("/gone", 404, 1, "", "Googlebot/2.1")).toBe("view /gone 404 1ms crawler");
  });

  test("logView is off unless asked for, and carries no identifier when on", () => {
    const log = spyOn(console, "log").mockImplementation(() => {});
    try {
      logView(req("https://www.blueshed.co.uk/journey/"), 200, performance.now(), false);
      expect(log).not.toHaveBeenCalled();

      logView(req("http://internal:8080/journey/", {
        "x-forwarded-host": "www.blueshed.co.uk",
        referer: "https://www.blueshed.co.uk/index.html",
        "user-agent": "Mozilla/5.0 (Macintosh)",
        cookie: "duckie_token=secret",
      }), 200, performance.now(), true);
      const line = String(log.mock.calls[0]?.[0]);
      expect(line).toStartWith("view /journey/ 200 ");
      expect(line).not.toContain("from="); // same site: following a link
      expect(line).not.toContain("secret");
      expect(line).not.toContain("Macintosh");

      logView(req("https://www.blueshed.co.uk/"), 200, performance.now(), true); // no host header at all
      expect(String(log.mock.calls[1]?.[0])).toStartWith("view / 200 ");
    } finally {
      log.mockRestore();
    }
  });
});

describe("scaffold notice", () => {
  const make = (files: Record<string, string>) => {
    const root = scratch(`scaffold-${Math.random().toString(36).slice(2)}`);
    mkdirSync(root, { recursive: true });
    for (const [path, body] of Object.entries(files)) {
      const full = join(root, path);
      mkdirSync(join(full, ".."), { recursive: true });
      writeFileSync(full, body);
    }
    return root;
  };
  const scaffolded = { "package.json": '{"name":"my-site"}', "create/setup.ts": "" };

  test("says so when bun create copied the repo and never ran setup", () => {
    const notice = scaffoldNotice(make(scaffolded));
    expect(notice).toContain("bun run setup");
    expect(notice).toContain("hasn't been set up yet");
  });

  test("silent in duckdown's own checkout, where bun-create is still in the manifest", () => {
    expect(scaffoldNotice(make({ ...scaffolded, "package.json": '{"bun-create":{"postinstall":"x"}}' }))).toBe("");
  });

  test("silent once there is a site, or no scaffolder, or no manifest to read", () => {
    const done = make(scaffolded);
    mkdirSync(join(done, "site"));
    expect(scaffoldNotice(done)).toBe("");                                  // already set up
    expect(scaffoldNotice(make({ "package.json": "{}" }))).toBe("");        // setup already removed itself
    expect(scaffoldNotice(make({ "create/setup.ts": "" }))).toBe("");       // not a bun project at all
    expect(scaffoldNotice(make({ ...scaffolded, "package.json": "{ not json" }))).toBe("");
  });
});

describe("utils", () => {
  test("a date reads as a reader expects it, on the day it says", () => {
    // Formatted in UTC, so a server west of it doesn't print the day before
    // the one in datetime= — the failure this test exists for.
    expect(dateHtml("2026-09-21")).toBe('<time datetime="2026-09-21">21 September 2026</time>');
    expect(dateHtml("")).toBe("");
    expect(dateHtml("one day")).toBe('<time datetime="one day">one day</time>'); // as written, not "Invalid Date"
  });

  test("one address per page: the shortest one", () => {
    expect(canonicalPath("index.md")).toBe("/");
    expect(canonicalPath("blog/index.md")).toBe("/blog/");
    expect(canonicalPath("blog/a-post.md")).toBe("/blog/a-post.html");
  });

  test("a pass over the html leaves code alone", () => {
    const html = "<p>{{pages}}</p><code>{{pages}}</code><p>{{pages}}</p>";
    expect(outsideCode(html, (part) => part.replaceAll("{{pages}}", "LIST")))
      .toBe("<p>LIST</p><code>{{pages}}</code><p>LIST</p>");
  });
});

describe("decoding a URL path", () => {
  test("decodePath undoes escapes and answers null for a malformed one", async () => {
    const { decodePath, BadRequest } = await import("../server/utils");
    expect(decodePath("/About%20us.md")).toBe("/About us.md");
    expect(decodePath("/%E0%A4%A")).toBeNull();
    const res = handleError(new BadRequest("Bad Request"));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Bad Request");
  });
});

describe("the default site folder", () => {
  test("is the seed, or ./site in a site that depends on duckdown", async () => {
    const { defaultSitePath } = await import("../server/config");
    expect(defaultSitePath((p) => p === "./tests/example")).toBe("./tests/example"); // duckdown's own checkout
    expect(defaultSitePath((p) => p === "./site")).toBe("./site");                   // a site with duckdown installed
    expect(defaultSitePath(() => true)).toBe("./tests/example");
    expect(defaultSitePath(() => false)).toBe("./tests/example");                    // nothing: say so later, with the folder's name
  });
});

describe("sitemap", () => {
  test("escapes addresses and gives lastmod only to a date", async () => {
    const { sitemapXml } = await import("../server/sitemap");
    const xml = sitemapXml([
      { url: "/a & b/c d.html", date: "2026-09-21" },
      { url: "/soon.html", date: "sometime soon" },
    ], "https://example.com");
    expect(xml).toContain("<loc>https://example.com/a%20&amp;%20b/c%20d.html</loc><lastmod>2026-09-21</lastmod>");
    expect(xml).toContain("<loc>https://example.com/soon.html</loc></url>");
    expect(xml).toStartWith('<?xml version="1.0"');
  });
});
