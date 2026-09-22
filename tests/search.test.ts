// The index a reader searches: built here, matched in the browser.
import { describe, test, expect } from "bun:test";
import type { Storage, Listing } from "../server/storage";
import { buildSite, searchIndex, pageList, searchChanged } from "../server/search";
import { siteMap, pagesChanged } from "../server/nav";

const buildIndex = async (pages: Storage) => (await buildSite(pages)).entries;

// An in-memory Storage over { "guide/index.md": "…" }; read() throws for `broken`.
function memory(files: Record<string, string>, broken = ""): Storage {
  return {
    async list(prefix) {
      const dir = prefix ? `${prefix}/` : "";
      const out: Listing = { files: [], folders: [] };
      for (const key of Object.keys(files).filter((k) => k.startsWith(dir))) {
        const rest = key.slice(dir.length);
        const name = rest.split("/")[0]!;
        if (rest === name) out.files.push({ name, path: `/${key}`, file: true, size: 0, type: "text/markdown" });
        else if (!out.folders.some((f) => f.name === name)) out.folders.push({ name, path: `/${dir}${name}`, file: false });
      }
      return out;
    },
    async read(key) {
      if (key === broken) throw new Error("storage is down");
      return files[key]!;
    },
    async readBytes(key) { return new TextEncoder().encode(files[key]); },
    async write(key, body) { files[key] = String(body); },
    async remove(key) { delete files[key]; },
    async exists(key) { return key in files; },
    mime: () => "text/plain",
  };
}

describe("buildIndex", () => {
  const site = () => memory({
    "index.md": "title: Home\ndescription: The front door\n\n# Home\n\nWelcome in.",
    "no-title.md": "# Untitled\n\nnothing declared",
    "draft.md": "title: Later\ndraft: true\n\n# Later\n\nnot yet",
    "notes.txt": "not a page",
    "guide/index.md": "title: Guide\n\n# Guide\n\nHow to use it.",
    "guide/deep/page.md": "title: Deep\n\n# Deep\n\nFurther in.",
    ".hidden/page.md": "title: Hidden\n\n# Hidden",
  });

  test("one entry per page a reader could reach, at its canonical address", async () => {
    const entries = await buildIndex(site());
    const urls = entries.map((e) => e.url);

    expect(urls).toContain("/");                    // index.md
    expect(urls).toContain("/guide/");              // a folder is its index
    expect(urls).toContain("/guide/deep/page.html");
    expect(urls).not.toContain("/draft.html");      // 404 to a reader
    expect(entries.some((e) => e.url.includes("notes"))).toBe(false);   // not a page
    expect(entries.some((e) => e.title === "Hidden")).toBe(false);      // a . folder

    const home = entries.find((e) => e.url === "/")!;
    expect(home.title).toBe("Home");
    expect(home.description).toBe("The front door");
    expect(home.section).toBe("");
    expect(home.text).toBe("");                                        // nothing before the page's first heading
    const title = entries.find((e) => e.url === "/#home")!;            // the h1 is a section like any other
    expect(title).toMatchObject({ title: "Home", section: "Home", description: "", text: "Welcome in." });
  });

  test("a page with no title: is named by its file, and needs no description", async () => {
    const entry = (await buildIndex(site())).find((e) => e.url === "/no-title.html")!;
    expect(entry.title).toBe("no-title");
    expect(entry.description).toBe("");
  });
});

describe("sections", () => {
  const entries = (md: string) => buildIndex(memory({ "song.md": `title: Songs\ndate: 2026-09-21\ndescription: Twenty of them\n\n${md}` }));

  test("a page with two headings is three entries: its own words, and each section at #id", async () => {
    const found = await entries("Before any heading.\n\n## Train song\n\nAll aboard.\n\n## Rain song\n\nIt fell.");
    expect(found.map((e) => e.url)).toEqual(["/song.html", "/song.html#train-song", "/song.html#rain-song"]);
    expect(found[0]).toMatchObject({ title: "Songs", section: "", description: "Twenty of them", date: "2026-09-21", text: "Before any heading." });
    expect(found[1]).toMatchObject({ title: "Songs", section: "Train song", description: "", date: "2026-09-21", text: "All aboard." });
    expect(found[2]!.text).toBe("It fell.");
  });

  test("the ids are the page's own, so a repeated heading is numbered as the page numbers it", async () => {
    const found = await entries("## Same\n\none\n\n## Same\n\ntwo");
    expect(found.map((e) => e.url)).toEqual(["/song.html", "/song.html#same", "/song.html#same-1"]);
    expect(found.map((e) => e.text)).toEqual(["", "one", "two"]);
  });

  test("a page with no headings is one entry with all its words", async () => {
    const found = await entries("Just words, and *some emphasis*.");
    expect(found.map((e) => e.url)).toEqual(["/song.html"]);
    expect(found[0]!.text).toBe("Just words, and some emphasis.");
  });

  test("code, and the contents list, are left out of the words", async () => {
    const found = await entries("toc: true\n\n# Songs\n\nintro\n\n## One\n\nbefore\n\n```js\nconst x = () => 1;\n```\n\nafter");
    const text = found.map((e) => e.text).join("|");
    expect(text).toContain("before after");
    expect(text).not.toContain("const");
    expect(text).not.toContain("One One");       // the contents list, which only repeats the headings
  });

  test("a heading with & and an apostrophe is the words as written, not as escaped", async () => {
    const found = await entries("## Tom & Jerry's\n\nchase");
    expect(found[1]).toMatchObject({ url: "/song.html#tom-jerrys", section: "Tom & Jerry's", text: "chase" });
    const quoted = await entries("## Say \"hi\" < 3\n\nx");
    expect(quoted[1]!.section).toBe('Say "hi" < 3');
  });

  test("a draft yields none, and neither does the 404 page", async () => {
    const found = await buildIndex(memory({
      "draft.md": "title: Later\ndraft: true\n\n## Hidden\n\nx",
      "404.md": "title: Lost\n\n## Nothing\n\nx",
      "index.md": "title: Home\n\nx",
    }));
    expect(found.map((e) => e.url)).toEqual(["/"]);
  });

  test("the page list has each page once, for the sitemap, whatever its sections", async () => {
    const pages = memory({ "song.md": "title: S\ndate: 2026-09-21\n\n## A\n\nx\n\n## B\n\ny", "guide/index.md": "title: G\n\n## C\n\nz" });
    expect((await buildSite(pages)).pages).toEqual([{ url: "/song.html", date: "2026-09-21" }, { url: "/guide/", date: "" }]);
    expect(await pageList(pages, true)).toHaveLength(2);
    searchChanged();
    expect(await pageList(pages, false)).toHaveLength(2);
    searchChanged();
  });
});

describe("searchIndex", () => {
  test("built once and kept, until a page changes", async () => {
    const pages = memory({ "index.md": "title: One\n\nfirst" });
    const first = await searchIndex(pages, false);
    await pages.write("index.md", "title: Two\n\nsecond");

    expect((await searchIndex(pages, false))[0]!.title).toBe("One");   // the kept one
    searchChanged();
    expect((await searchIndex(pages, false))[0]!.title).toBe("Two");
    searchChanged();
  });

  test("built per request in development, where pages are written straight to disk", async () => {
    const pages = memory({ "index.md": "title: One\n\nfirst" });
    await searchIndex(pages, true);
    await pages.write("index.md", "title: Two\n\nsecond");
    expect((await searchIndex(pages, true))[0]!.title).toBe("Two");
  });

  test("a build that fails isn't kept: the next request tries again", async () => {
    const pages = memory({ "index.md": "title: One\n\nfirst" }, "index.md");
    expect(searchIndex(pages, false)).rejects.toThrow("storage is down");
    await Bun.sleep(1);
    // The same storage, no longer broken — it would answer from the failure if
    // the failure had been cached.
    expect((await searchIndex(memory({ "index.md": "title: Two\n\nsecond" }), false))[0]!.title).toBe("Two");
    searchChanged();
  });
});

describe("siteMap", () => {
  const pages = () => memory({
    "index.md": "title: Home\n\nx",
    "about.md": "title: About us\n\nx",
    "404.md": "title: Lost\n\nx",
    "draft.md": "title: Later\ndraft: true\n\nx",
    "-private/page.md": "title: Private\n\nx",
    ".hidden/page.md": "title: Hidden\n\nx",
    "blog/index.md": "title: The blog\n\nx",
    "blog/old.md": "title: Old\ndate: 2020-01-01\n\nx",
    "blog/new.md": "title: New\ndate: 2026-09-21\n\nx",
    "blog/deep/page.md": "title: Deep <one>\n\nx",
    "loose/page.md": "title: Loose\n\nx",
    "drafty/index.md": "title: Drafty\ndraft: true\n\nx",
    "drafty/page.md": "title: Under a draft\n\nx",
    "empty/index.md": "title: Empty\n\nx",
  });

  test("every page, nested by folder, each folder under its index's title, newest first as {{pages}} has it", async () => {
    const html = await siteMap(pages(), true);
    expect(html).toStartWith('<ul class="sitemap">');
    const order = [...html.matchAll(/<a href="([^"]+)">/g)].map((m) => m[1]);
    expect(order).toEqual([
      "/",                                     // the front door first
      "/about.html",
      "/blog/",                                // a folder is its index's title, linked to the folder's address
      "/blog/new.html", "/blog/old.html",      // newest first, as {{pages}} has it
      "/blog/deep/page.html",                  // then folders, by name
      "/drafty/page.html",                     // a draft index doesn't take its folder's pages with it
      "/loose/page.html",
    ]);
    expect(html).toContain('<li><a href="/blog/">The blog</a>\n<ul class="sitemap">');   // nested
    expect(html).toContain("Deep &lt;one&gt;");                                          // escaped
  });

  test("leaves out drafts, the 404 page, and folders starting with - or .", async () => {
    const html = await siteMap(pages(), true);
    for (const gone of ["Later", "Lost", "Private", "Hidden"]) expect(html).not.toContain(gone);
  });

  test("a folder with a draft index is listed by its name, and one with nothing to show isn't listed", async () => {
    const html = await siteMap(pages(), true);
    expect(html).toContain("<li>drafty\n");            // named, not linked: its index is a draft
    expect(html).toContain("Under a draft");
    expect(html).not.toContain("Empty");                // an index alone lists nothing beneath it
    expect(await siteMap(memory({ "index.md": "draft: true\n\nx" }), true)).toBe("");
  });

  test("built once and kept, until a page changes", async () => {
    const store = memory({ "index.md": "title: One\n\nx" });
    pagesChanged();
    expect(await siteMap(store, false)).toContain(">One<");
    await store.write("index.md", "title: Two\n\nx");
    expect(await siteMap(store, false)).toContain(">One<");
    pagesChanged();
    expect(await siteMap(store, false)).toContain(">Two<");
    pagesChanged();
  });

  test("a build that fails isn't kept", async () => {
    pagesChanged();
    await expect(siteMap(memory({ "index.md": "title: One" }, "index.md"), false)).rejects.toThrow("storage is down");
    expect(await siteMap(memory({ "index.md": "title: Two" }), false)).toContain(">Two<");
    pagesChanged();
  });
});
