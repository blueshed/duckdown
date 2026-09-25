import { describe, test, expect, afterAll, spyOn } from "bun:test";
import { join } from "path";
import { S3Storage, seedBucketSite } from "../server/storage";
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
