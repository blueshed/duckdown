import { describe, test, expect, afterAll } from "bun:test";
import { S3Storage } from "../server/storage";
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
      name: "index.md", path: "/index.md", file: true, size: 13, type: "text/markdown",
    });
    expect(root.folders).toEqual([{ name: "guide", path: "/guide", file: false }]);
    const guide = await store.list("guide");
    expect(guide.files.map((f) => f.path)).toEqual(["/guide/index.md"]);
    expect(guide.folders).toEqual([]);
  });

  test("removes objects, and guesses types", async () => {
    await store.remove("about.md");
    expect(await store.exists("about.md")).toBe(false);
    expect(store.mime("a.png")).toBe("image/png");
  });
});
