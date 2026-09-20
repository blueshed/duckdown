import { describe, test, expect, spyOn } from "bun:test";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { RUN, SITE } from "./helpers";
import { readPid, isAlive, claimPidFile, releasePidFile, exitOnSignal, stopServer } from "../server/pid";
import { configLines, printConfig } from "../server/config";
import { LocalStorage, S3Storage, storageAt, seedLocalSite } from "../server/storage";
import { loadSecret, signJwt, verifyJwt, ensureAdmin } from "../server/auth";
import { handleError } from "../server/routes/error";

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

  test("claimPidFile: takes over a live pid that isn't a duckdown", () => {
    // The container case: the file outlives a hard kill on a volume and the
    // pid it names now belongs to something else. Here that's this test
    // runner — alive, and `ps` says it's `bun test`, not a server.
    const file = scratch("recycled.pid");
    writeFileSync(file, `${process.ppid}\n`);
    expect(() => claimPidFile(file)).not.toThrow();
    expect(readPid(file)).toBe(process.pid);
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
  const local = { s3: false, bucket: "", prefix: "", endpoint: "", path: "/srv/site", debug: false, pidFile: "/run/d.pid", pid: 7 };

  test("describes local storage, production, and the pid file", () => {
    expect(configLines(local)).toEqual(["duckie", "  storage: /srv/site", "  mode: production", "  pid: 7 (/run/d.pid)"]);
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
    expect(listing.files[0]).toMatchObject({ path: "/a/b.md", file: true, size: 5, type: "text/markdown" });
    expect(listing.folders).toEqual([{ name: "c", path: "/a/c", file: false }]);
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
