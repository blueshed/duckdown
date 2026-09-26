// n169: what every storage answers, asked of both — a folder on disk and a
// bucket (Bun's S3Client against fake-s3). The routes and the editor are
// tested on disk; this is what keeps a bucket from answering them otherwise.
// It exists because 0.12.1 made the tree ask for "news/", disk took it, and
// vashti's bucket listed every folder empty for a day (n168).
import { describe, test, expect, afterAll } from "bun:test";
import { mkdtempSync } from "fs";
import { join } from "path";
import { RUN } from "./helpers";
import { LocalStorage, S3Storage, type Storage } from "../server/storage";
import { fakeS3 } from "./fake-s3";

const s3 = fakeS3();
afterAll(() => s3.server.stop(true));

const backends: [string, () => Storage][] = [
  ["a folder on disk", () => new LocalStorage(mkdtempSync(join(RUN, "contract-")))],
  ["a bucket", () => new S3Storage("bucket", `contract-${crypto.randomUUID()}/`, s3.endpoint, "us-east-1", {
    accessKeyId: "test", secretAccessKey: "test",
  })],
];

// What a listing says, in an order both keep.
const shape = async (store: Storage, prefix: string) => {
  const { files, folders } = await store.list(prefix);
  return {
    files: files.map((f) => `${f.name} ${f.path}`).sort(),
    folders: folders.map((f) => `${f.name} ${f.path}`).sort(),
  };
};

for (const [what, make] of backends) {
  describe(`storage: ${what}`, () => {
    const store = make();
    const ready = (async () => {
      await store.write("index.md", "home");
      await store.write("guide/pages.md", "pages");
      await store.write("guide/deep/more.md", "more");
      await store.write("My Folder/a b.md", "spaced");
      await store.write(".history/x", "kept");
      await store.write("guide/.widths.json", "{}");
    })();

    test("a folder lists the same asked as it is, with its slash, or with a leading one", async () => {
      await ready;
      const plain = await shape(store, "guide");
      expect(plain).toEqual({ files: ["pages.md guide/pages.md"], folders: ["deep guide/deep"] });
      expect(await shape(store, "guide/")).toEqual(plain);
      expect(await shape(store, "/guide")).toEqual(plain);
      expect(await shape(store, "guide/deep/")).toEqual({ files: ["more.md guide/deep/more.md"], folders: [] });
    });

    test("the root lists its own, a . name never, and a folder that isn't there is empty", async () => {
      await ready;
      expect(await shape(store, "")).toEqual({
        files: ["index.md index.md"],
        folders: ["My Folder My Folder", "guide guide"],
      });
      expect(await shape(store, "nope")).toEqual({ files: [], folders: [] });
      expect(await shape(store, "nope/")).toEqual({ files: [], folders: [] });
    });

    test("names with spaces, and a key with or without its leading slash", async () => {
      await ready;
      expect(await shape(store, "My Folder")).toEqual({ files: ["a b.md My Folder/a b.md"], folders: [] });
      expect(await store.read("My Folder/a b.md")).toBe("spaced");
      expect(await store.read("/guide/pages.md")).toBe("pages");
      expect(new TextDecoder().decode(await store.readBytes("index.md"))).toBe("home");
    });

    test("exists is for files: not a folder, not what isn't there; remove takes one away", async () => {
      await ready;
      expect(await store.exists("guide/pages.md")).toBe(true);
      expect(await store.exists("guide")).toBe(false);
      expect(await store.exists("nope.md")).toBe(false);
      await store.write("gone.md", "x");
      await store.remove("gone.md");
      expect(await store.exists("gone.md")).toBe(false);
      expect(store.mime("a/b.css")).toBe("text/css");
    });
  });
}
