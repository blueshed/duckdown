// duckdown bucket pull|push, between a bucket (Bun's S3Client against
// fake-s3) and a scratch folder on disk.
import { describe, test, expect, afterAll, spyOn } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { RUN } from "./helpers";
import { fakeS3 } from "./fake-s3";
import { LocalStorage, S3Storage } from "../server/storage";
import { History } from "../server/history";
import { bucketCommand, pull, push, stays } from "../server/bucket";
import { cli, USAGE } from "../server/cli";

const s3 = fakeS3();
afterAll(() => s3.server.stop(true));
const credentials = { accessKeyId: "test", secretAccessKey: "test" };

// A bucket of its own for each test: a prefix nothing else uses.
const bucket = (prefix = `bucket-${crypto.randomUUID()}/`) => ({
  prefix,
  store: new S3Storage("site", prefix, s3.endpoint, "us-east-1", credentials),
  at: (sub: string) => new S3Storage("site", prefix + sub, s3.endpoint, "us-east-1", credentials),
});
const folder = (files: Record<string, string> = {}) => {
  const root = mkdtempSync(join(RUN, "bucket-"));
  for (const [key, body] of Object.entries(files)) {
    mkdirSync(join(root, key, ".."), { recursive: true });
    writeFileSync(join(root, key), body);
  }
  return { root, store: new LocalStorage(root) };
};
const fill = async (store: S3Storage, files: Record<string, string>) => {
  for (const [key, body] of Object.entries(files)) await store.write(key, body);
};
const text = async (store: S3Storage, key: string) => new TextDecoder().decode(await store.readBytes(key));
const quietly = () => {
  const said: string[] = [];
  return { said, say: (line: string) => void said.push(line) };
};

// What a served site's bucket holds: its content, and its running state.
const LIVE = {
  "pages/index.md": "home",
  "pages/news/today.md": "written at /edit",
  "static/images/.widths.json": "{}",
  "static/.DS_Store": "junk",
  "users.json": "{\"vashti\": \"hash\"}",
  ".history/pages/index.md/2026-09-27T10-00-00-000Z": "older home",
  "reports/2026-09/27.md": "counts",
};

describe("duckdown bucket pull", () => {
  test("brings home what differs, . names too, and leaves the running state in the bucket", async () => {
    const b = bucket();
    await fill(b.store, LIVE);
    const here = folder({ "pages/index.md": "home", "pages/gone.md": "deleted at /edit", ".DS_Store": "mine" });
    const { said, say } = quietly();
    expect(await pull(b.store, here.store, say)).toBe(2);
    expect(readFileSync(join(here.root, "pages/news/today.md"), "utf8")).toBe("written at /edit");
    expect(existsSync(join(here.root, "static/images/.widths.json"))).toBe(true);
    for (const kept of ["users.json", ".history", "reports", "static/.DS_Store"]) expect(existsSync(join(here.root, kept))).toBe(false);
    expect(said).toEqual([
      "  pages/news/today.md",
      "  static/images/.widths.json",
      "2 of 3 files changed from the bucket.",
      "Here but not in the bucket (remove them if they were deleted at /edit):",
      "  pages/gone.md",
    ]);
    // Again, nothing has changed: nothing written, and a folder that matches says nothing more.
    const again = quietly();
    expect(await pull(b.store, here.store, again.say)).toBe(0);
    expect(again.said[0]).toBe("0 of 3 files changed from the bucket.");
  });

  test("into a folder that isn't there yet, and never from a bucket with no site", async () => {
    const b = bucket();
    await fill(b.store, { "pages/index.md": "home" });
    const root = join(mkdtempSync(join(RUN, "bucket-")), "site");
    const { said, say } = quietly();
    expect(await pull(b.store, new LocalStorage(root), say)).toBe(1);
    expect(said).toEqual(["  pages/index.md", "1 of 1 files changed from the bucket."]);
    const empty = bucket();
    await fill(empty.store, { "users.json": "{}" });
    const here = folder();
    await expect(pull(empty.store, here.store, () => {})).rejects.toThrow("the bucket has no pages/index.md (1 files): nothing was written");
    expect(await here.store.keys()).toEqual([]);
  });
});

describe("duckdown bucket push", () => {
  const keep = (b: ReturnType<typeof bucket>) => (section: string) => new History(b.at(`.history/${section}`));

  test("fills an empty bucket without being told", async () => {
    const b = bucket();
    const here = folder({ "pages/index.md": "home", "users.json": "{}", "static/site.css": "css" });
    const { said, say } = quietly();
    expect(await push(b.store, here.store, false, say, keep(b))).toBe(2);
    expect(await b.store.keys()).toEqual(["pages/index.md", "static/site.css"]);
    expect(said.at(-1)).toBe("2 of 2 files sent to the bucket; nothing in it was deleted.");
  });

  test("refuses a bucket with a site unless told; told, keeps what it replaces and deletes nothing", async () => {
    const b = bucket();
    await fill(b.store, LIVE);
    const here = folder({ "pages/index.md": "home", "pages/news/today.md": "an older draft", "robots.txt": "User-agent: *", "users.json": "{}" });
    await expect(push(b.store, here.store, false, () => {}, keep(b))).rejects.toThrow("the bucket has a site already");
    expect(await text(b.store, "pages/news/today.md")).toBe("written at /edit");

    const { said, say } = quietly();
    expect(await push(b.store, here.store, true, say, keep(b))).toBe(2);
    expect(said).toEqual(["  pages/news/today.md", "  robots.txt", "2 of 3 files sent to the bucket; nothing in it was deleted."]);
    expect(await text(b.store, "pages/news/today.md")).toBe("an older draft");
    // What it replaced is an earlier version, where the editor's Restore looks.
    const history = new History(b.at(".history/pages/"));
    const [version] = await history.versions("news/today.md");
    expect(new TextDecoder().decode((await history.read("news/today.md", version!.id))!)).toBe("written at /edit");
    // The rest is as it was: the password hashes, the reports, what only the bucket had.
    expect(await text(b.store, "users.json")).toBe("{\"vashti\": \"hash\"}");
    expect(await b.store.exists("reports/2026-09/27.md")).toBe(true);
    expect(await b.store.exists("static/images/.widths.json")).toBe(true);
  });

  test("never from a folder with no site", async () => {
    const b = bucket();
    await expect(push(b.store, folder({ "users.json": "{}" }).store, true, () => {}, keep(b))).rejects.toThrow("the folder has no pages/index.md: nothing was sent");
  });
});

describe("duckdown bucket, from the command line", () => {
  const env = (prefix: string, o: Record<string, string> = {}) => ({
    DUCKDOWN_BUCKET: "site", DUCKDOWN_PREFIX: prefix, DUCKDOWN_ENDPOINT: s3.endpoint, ...o,
  });

  test("pulls into DUCKDOWN_SEED, or the folder named, and pushes back with --force", async () => {
    const b = bucket();
    await fill(b.store, { "pages/index.md": "home" });
    const here = folder();
    const { said, say } = quietly();
    expect(await bucketCommand(["pull"], { env: env(b.prefix, { DUCKDOWN_SEED: "./site", DUCKDOWN_PATH: "./elsewhere" }), say, cwd: here.root, credentials })).toBe(0);
    expect(said[0]).toBe(`s3://site/${b.prefix} into ./site:`);
    expect(readFileSync(join(here.root, "site/pages/index.md"), "utf8")).toBe("home");

    writeFileSync(join(here.root, "site/pages/index.md"), "home, changed");
    await expect(bucketCommand(["push", "site"], { env: env(b.prefix), say, cwd: here.root, credentials })).rejects.toThrow("push --force");
    expect(await bucketCommand(["push", "site", "--force"], { env: env(b.prefix, { DUCKDOWN_REGION: "us-east-1" }), say, cwd: here.root, credentials })).toBe(0);
    expect(await text(b.store, "pages/index.md")).toBe("home, changed");
    expect((await new History(b.at(".history/pages/")).versions("index.md")).length).toBe(1);
    // With no DUCKDOWN_SEED, the folder it edits.
    const other = folder();
    expect(await bucketCommand(["pull"], { env: env(b.prefix, { DUCKDOWN_PATH: "mine" }), say: () => {}, cwd: other.root, credentials })).toBe(0);
    expect(existsSync(join(other.root, "mine/pages/index.md"))).toBe(true);
  });

  test("says why it can't start", async () => {
    const at = (args: string[], e: Record<string, string | undefined>) => bucketCommand(args, { env: e, say: () => {}, cwd: RUN, credentials });
    await expect(at([], {})).rejects.toThrow("say which: duckdown bucket pull [folder], or push [folder] [--force]");
    await expect(at(["pull"], { DUCKDOWN_BUCKET: "site" })).rejects.toThrow("which folder?");
    await expect(at(["pull", "site"], {})).rejects.toThrow("no DUCKDOWN_BUCKET here: run it with the site's environment, as `railway run --service <name> bunx duckdown bucket pull`");
  });

  test("is a duckdown command, and duckdown says what its commands are", async () => {
    const errors = spyOn(console, "error").mockImplementation(() => {});
    const logs = spyOn(console, "log").mockImplementation(() => {});
    try {
      expect(await cli(["bucket", "sideways"])).toBe(1);
      expect(String(errors.mock.calls[0]![0])).toContain("duckdown bucket: say which");
      for (const ask of ["help", "--help", "-h"]) expect(await cli([ask])).toBe(0);
      expect(logs.mock.calls.map((c) => c[0])).toEqual([USAGE, USAGE, USAGE]);
      expect(USAGE).toContain("duckdown bucket pull [folder]");
    } finally {
      errors.mockRestore();
      logs.mockRestore();
    }
  });

  test("what stays in the bucket", () => {
    expect(["users.json", ".history/pages/a/1", "reports/x.md"].every(stays)).toBe(true);
    expect(["pages/users.json", "static/reports.css"].some(stays)).toBe(false);
  });
});
