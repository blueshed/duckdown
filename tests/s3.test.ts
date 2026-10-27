import { describe, test, expect, afterAll, spyOn } from "bun:test";
import { join } from "path";
import net from "net";
import { S3Storage, seedBucketSite, again } from "../server/storage";
import { fakeS3 } from "./fake-s3";

const s3 = fakeS3();
afterAll(() => s3.server.stop(true));

describe("S3Storage", () => {
  const store = new S3Storage("bucket", "site/pages/", s3.endpoint, "us-east-1", {
    accessKeyId: "test",
    secretAccessKey: "test",
  });

  test("writes and reads objects under its prefix", async () => {
    await store.write("index.md", "title: Home\n\n");
    await store.write("/about.md", "# About"); // a leading slash is not part of the key
    expect(s3.objects.has("bucket/site/pages/index.md")).toBe(true);
    expect(s3.objects.has("bucket/site/pages/about.md")).toBe(true);
    expect(await store.read("index.md")).toBe("title: Home\n\n");
    expect(new TextDecoder().decode(await store.readBytes("about.md"))).toBe("# About");
  });

  test("knows what exists", async () => {
    expect(await store.exists("index.md")).toBe(true);
    expect(await store.exists("nope.md")).toBe(false);
  });

  test("lists files and folders, skipping a folder marker", async () => {
    await store.write("guide/index.md", "title: Guide\n\n");
    s3.objects.set("bucket/site/pages/", new Uint8Array()); // as some S3 tools write for a folder
    const root = await store.list("");
    expect(root.files.map((f) => f.name).sort()).toEqual(["about.md", "index.md"]);
    expect(root.files.find((f) => f.name === "index.md")).toEqual({
      name: "index.md", path: "index.md", file: true, size: 13, type: "text/markdown",
    });
    expect(root.folders).toEqual([{ name: "guide", path: "guide", file: false }]);
    const guide = await store.list("guide");
    expect(guide.files.map((f) => f.path)).toEqual(["guide/index.md"]);
    expect(await store.list("guide/")).toEqual(guide);   // asked with its slash, as the editor's tree asks
    expect(guide.folders).toEqual([]);
  });

  test("removes objects, and guesses types", async () => {
    await store.remove("about.md");
    expect(await store.exists("about.md")).toBe(false);
    expect(store.mime("a.png")).toBe("image/png");
  });
});

describe("seeding a bucket", () => {
  const seed = join(import.meta.dir, "example");
  const store = () => new S3Storage("bucket", "seeded/", s3.endpoint, "us-east-1", {
    accessKeyId: "test", secretAccessKey: "test",
  });
  const quiet = () => spyOn(console, "log").mockImplementation(() => {});

  test("does nothing off S3, or with no seed configured", async () => {
    expect(await seedBucketSite(seed, store(), false)).toBe(0);
    expect(await seedBucketSite("", store(), true)).toBe(0);
    expect([...s3.objects.keys()].some((k) => k.startsWith("bucket/seeded/"))).toBe(false);
  });

  test("says so when the seed folder isn't there, and leaves the bucket alone", async () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await seedBucketSite(join(seed, "nowhere"), store(), true)).toBe(0);
      expect(String(error.mock.calls[0]?.[0])).toContain("isn't there");
    } finally {
      error.mockRestore();
    }
  });

  test("uploads the seed, keeping the folder structure and the bytes", async () => {
    const log = quiet();
    try {
      const count = await seedBucketSite(seed, store(), true);
      expect(count).toBeGreaterThan(5);
      expect(String(log.mock.calls[0]?.[0])).toContain(`(${count} files)`);
    } finally {
      log.mockRestore();
    }
    expect(s3.objects.has("bucket/seeded/pages/index.md")).toBe(true);
    expect(s3.objects.has("bucket/seeded/pages/guide/pages.md")).toBe(true);
    expect(s3.objects.has("bucket/seeded/templates/site.html")).toBe(true);
    expect(s3.objects.has("bucket/seeded/static/images/logo.svg")).toBe(true);

    const onDisk = await Bun.file(join(seed, "static", "images", "logo.svg")).bytes();
    expect(s3.objects.get("bucket/seeded/static/images/logo.svg")).toEqual(onDisk);
  });

  test("won't seed over a site that is already there", async () => {
    const before = s3.objects.size;
    expect(await seedBucketSite(seed, store(), true)).toBe(0);
    expect(s3.objects.size).toBe(before);
  });
});

// In front of the fake bucket: the next `drops` requests are read and their
// connection closed unanswered, as Railway's bucket did (n206); the rest pass
// through. By request, not by connection: Bun keeps connections for the whole
// process, whichever client opened them.
function dropping(to: string) {
  const { hostname, port } = new URL(to);
  const proxy = { drops: 0, endpoint: "", stop: () => server.close() };
  const server = net.createServer((client) => {
    const upstream = net.connect(Number(port), hostname);
    const close = () => { client.destroy(); upstream.destroy(); };
    client.on("data", (chunk) => {
      if (proxy.drops > 0) { proxy.drops--; close(); }
      else upstream.write(chunk);
    });
    upstream.pipe(client);
    client.on("error", close).on("close", close);
    upstream.on("error", close).on("close", close);
  }).listen(0, "127.0.0.1");
  proxy.endpoint = `http://127.0.0.1:${(server.address() as net.AddressInfo).port}`;
  return proxy;
}

describe("a dropped connection", () => {
  const proxy = dropping(s3.endpoint);
  afterAll(() => proxy.stop());
  const kept = new S3Storage("bucket", "dropped/", proxy.endpoint, "us-east-1",
    { accessKeyId: "test", secretAccessKey: "test" }, [1, 1, 1]);
  const store = () => kept;

  test("is made again, for every call", async () => {
    proxy.drops = 3;
    await store().write("a.md", "kept");
    for (const call of [
      (s: S3Storage) => s.read("a.md"),
      (s: S3Storage) => s.readBytes("a.md"),
      (s: S3Storage) => s.exists("a.md"),
      (s: S3Storage) => s.list(""),
      (s: S3Storage) => s.keys(),
    ]) {
      proxy.drops = 3;
      await call(store());
      expect(proxy.drops).toBe(0);
    }
    expect(await store().read("a.md")).toBe("kept");
    proxy.drops = 3;
    await store().remove("a.md");
    expect(s3.objects.has("bucket/dropped/a.md")).toBe(false);
  });

  test("gives up after the last pause, with the bucket's own error", async () => {
    proxy.drops = 100;   // more than Bun's own retry of a kept connection, and ours
    const err = await store().read("a.md").catch((e) => e);
    expect(err.code).toBe("ConnectionClosed");
    expect(proxy.drops).toBeLessThanOrEqual(96);
    proxy.drops = 0;
  });

  test("an answer is never asked twice", async () => {
    let calls = 0;
    const missing = Object.assign(new Error("NoSuchKey"), { code: "NoSuchKey" });
    const err = await again(async () => { calls++; throw missing; }, [1, 1, 1]).catch((e) => e);
    expect([err, calls]).toEqual([missing, 1]);
    expect(await again(async () => { if (++calls < 4) throw { code: "ECONNRESET" }; return "ok"; }, [1, 1, 1])).toBe("ok");
  });
});
