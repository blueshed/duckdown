// n169: what every storage answers, asked of both — a folder on disk and a
// bucket (Bun's S3Client against fake-s3). The routes and the editor are
// tested on disk; this is what keeps a bucket from answering them otherwise.
// It exists because 0.12.1 made the tree ask for "news/", disk took it, and
// vashti's bucket listed every folder empty for a day (n168).
import { describe, test, expect, afterAll, spyOn } from "bun:test";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "fs";
import { dirname, isAbsolute, join } from "path";
import { RUN } from "./helpers";
import { LocalStorage, S3Storage, type Storage } from "../server/storage";
import { History, HISTORY_PATH } from "../server/history";
import { push } from "../server/bucket";
import { fakeS3 } from "./fake-s3";

const s3 = fakeS3();
afterAll(() => s3.server.stop(true));

// Each, and how it holds a link (n172): `to` is a key, or a path off the site.
// On disk a link is a link. A bucket has none, so it holds what `duckdown
// bucket push` leaves there: a copy of the file a link inside the site leads
// to, and nothing for a link out of it or to a folder.
type Backend = { store: LocalStorage | S3Storage; link(key: string, to: string): Promise<void> };

const backends: [string, () => Backend][] = [
  ["a folder on disk", () => {
    const root = mkdtempSync(join(RUN, "contract-"));
    return {
      store: new LocalStorage(root),
      link: async (key, to) => {
        mkdirSync(dirname(join(root, key)), { recursive: true });
        symlinkSync(isAbsolute(to) ? to : join(root, to), join(root, key));
      },
    };
  }],
  ["a bucket", () => {
    const store = new S3Storage("bucket", `contract-${crypto.randomUUID()}/`, s3.endpoint, "us-east-1", {
      accessKeyId: "test", secretAccessKey: "test",
    });
    return {
      store,
      link: async (key, to) => {
        if (!isAbsolute(to) && await store.exists(to)) await store.write(key, await store.readBytes(to));
      },
    };
  }],
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
    const { store, link } = make();
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

    test("keys are every file, flat and sorted, . names and all", async () => {
      await ready;
      expect((await store.keys()).filter((k) => k !== "gone.md")).toEqual([
        ".history/x", "My Folder/a b.md", "guide/.widths.json", "guide/deep/more.md", "guide/pages.md", "index.md",
      ]);
    });

    test("exists is for files: not a folder, not what isn't there; remove takes one away", async () => {
      await ready;
      expect(await store.exists("guide/pages.md")).toBe(true);
      expect(await store.exists("guide")).toBe(false);
      expect(await store.exists("nope.md")).toBe(false);
      await store.write("gone.md", "x");
      await store.remove("gone.md");
      expect(await store.exists("gone.md")).toBe(false);
      expect(store.mime("a/b.css")).toContain("text/css");
    });

    // Typed as the published server types it (serve.ts hands out a Bun.file),
    // so the served site and the published one agree: 0.16.0 answered a WebP,
    // which widths.ts itself makes, as application/octet-stream (n176).
    test("a file is typed by its name, listed or asked alone, as the published site types it", async () => {
      await ready;
      const names = ["a.webp", "b.AVIF", "c.png", "d.css", "e.woff2", "f.pdf", "g"];
      for (const name of names) await store.write(`typed/${name}`, "x");
      const { files } = await store.list("typed");
      for (const name of names) {
        expect(files.find((f) => f.name === name)?.type).toBe(Bun.file(name).type);
        expect(store.mime(`typed/${name}`)).toBe(Bun.file(name).type);
      }
      expect(store.mime("typed/a.webp")).toBe("image/webp");
      expect(store.mime("typed/b.AVIF")).toBe("image/avif");
    });

    // A page that is a link was listed nowhere, and said nothing (n172): the
    // nav, search and the export all walk list(). One to a file in the site is
    // that file, as a bucket holds it once pushed. One out of the site is
    // nothing, not a way out of it; nor is one to a folder, since two such
    // can send a walk of the site round forever.
    test("a link to a file in the site is that file; one out of it, or to a folder, is nothing", async () => {
      await ready;
      const away = join(mkdtempSync(join(RUN, "away-")), "away.md");
      writeFileSync(away, "not the site's");
      await link("linked/alias.md", "guide/pages.md");
      await link("linked/away.md", away);
      await link("linked/guide", "guide");
      const said = spyOn(console, "warn").mockImplementation(() => {});   // the disk says which (units.test.ts)
      try {
        expect(await shape(store, "linked")).toEqual({ files: ["alias.md linked/alias.md"], folders: [] });
        expect((await store.keys()).filter((k) => k.startsWith("linked/"))).toEqual(["linked/alias.md"]);
      } finally {
        said.mockRestore();
      }
      expect(await store.read("linked/alias.md")).toBe("pages");
      expect(await store.exists("linked/alias.md")).toBe(true);
      expect(await store.exists("linked/away.md")).toBe(false);
      await expect(store.read("linked/away.md")).rejects.toThrow();
    });
  });
}

// n172, again, after review: a site is sections — pages/, static/,
// static/images/, templates/ — each its own storage, and a link is judged
// against the one site they are all in, not the section it sits in. A link
// from one section to another is followed. A section that is itself a link
// isn't the site's, so nothing in it is read: static/ linked elsewhere served
// that folder, keys and all, to anyone. And no link leads to what is read only
// by its own name — users.json, .history/, reports/ — whichever storage asks,
// the whole site's too, which page.ts reads the templates through: a template
// linked to users.json put the hashes in every page. The bucket holds what
// `duckdown bucket push` sends of the same folder, so the two must agree.
describe("a site's sections, and the links between them", () => {
  const base = mkdtempSync(join(RUN, "sections-"));
  const site = join(base, "site");
  const away = join(base, "away");
  const put = (path: string, body: string) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
  };
  const ln = (to: string, at: string) => {
    mkdirSync(dirname(join(site, at)), { recursive: true });
    symlinkSync(to, join(site, at));
  };
  put(join(away, "imgs", "leak.png"), "LEAKPNG");
  put(join(site, "users.json"), '{"admin":"$argon2id$HASH"}');
  put(join(site, ".history", "pages", "index.md", "v1"), "old");
  put(join(site, "reports", "r.md"), "report");
  put(join(site, "pages", "index.md"), "home");
  put(join(site, "static", "notes.md"), "notes");
  ln("../static/notes.md", "pages/notes.md");
  ln("../users.json", "pages/hashes.md");
  ln("../.history/pages/index.md/v1", "pages/past.md");
  ln("../reports/r.md", "pages/report.md");
  ln("../users.json", "templates/site.html");
  ln(join(away, "imgs"), "static/images");

  const prefix = `sections-${crypto.randomUUID()}/`;
  const bucketAt = (sub: string) => new S3Storage("bucket", prefix + sub, s3.endpoint, "us-east-1", {
    accessKeyId: "test", secretAccessKey: "test",
  });
  const pushed = (async () => {
    const said = spyOn(console, "warn").mockImplementation(() => {});
    try {
      await push(bucketAt(""), new LocalStorage(site), false, () => {}, (section) => new History(bucketAt(`${HISTORY_PATH}${section}`)));
    } finally {
      said.mockRestore();
    }
  })();

  const sites: [string, (sub: string) => Storage][] = [
    ["a folder on disk", (sub) => new LocalStorage(join(site, sub), site)],
    ["the bucket it was pushed to", bucketAt],
  ];
  for (const [what, at] of sites) {
    test(`${what}: a link between sections is followed; one to what is read by name, or a section that is a link, is nothing`, async () => {
      await pushed;
      const said = spyOn(console, "warn").mockImplementation(() => {});   // the disk says which (units.test.ts)
      try {
        const pages = at("pages/");
        expect(await shape(pages, "")).toEqual({ files: ["index.md index.md", "notes.md notes.md"], folders: [] });
        expect(await pages.read("notes.md")).toBe("notes");
        for (const key of ["hashes.md", "past.md", "report.md"]) {
          expect(await pages.exists(key)).toBe(false);
          await expect(pages.read(key)).rejects.toThrow();
        }
        expect(await shape(at("templates/"), "")).toEqual({ files: [], folders: [] });
        expect(await at("templates/").exists("site.html")).toBe(false);
        expect(await at("").exists("templates/site.html")).toBe(false);
        await expect(at("").read("templates/site.html")).rejects.toThrow();
        expect(await shape(at("static/"), "")).toEqual({ files: ["notes.md notes.md"], folders: [] });
        const images = at("static/images/");
        expect(await shape(images, "")).toEqual({ files: [], folders: [] });
        expect(await images.exists("leak.png")).toBe(false);
        await expect(images.readBytes("leak.png")).rejects.toThrow();
      } finally {
        said.mockRestore();
      }
    });
  }
});
