// The nav, {{pages}} and {{sitemap}} of a site in more than one language: the
// shape is the default's, what is in it is what answers in the language, and
// every link goes to the language's own address.
import { describe, test, expect, beforeEach } from "bun:test";
import type { Storage, Listing } from "../server/storage";
import { siteNav, folderListing, siteMap, folderEntries, markCurrent } from "../server/nav";
import { treeOf } from "../server/languages";
import { siteChanged } from "../server/kept";

// An in-memory Storage over { "cy/index.md": "…" }.
function memory(files: Record<string, string>): Storage {
  return {
    async list(prefix) {
      const dir = prefix ? `${prefix}/` : "";
      const out: Listing = { files: [], folders: [] };
      for (const key of Object.keys(files).filter((k) => k.startsWith(dir))) {
        const rest = key.slice(dir.length);
        const name = rest.split("/")[0]!;
        if (rest === name) out.files.push({ name, path: key, file: true, size: 0, type: "text/markdown" });
        else if (!out.folders.some((f) => f.name === name)) out.folders.push({ name, path: `${dir}${name}`, file: false });
      }
      return out;
    },
    async read(key) { return files[key]!; },
    async readBytes(key) { return new TextEncoder().encode(files[key]); },
    async write(key, body) { files[key] = String(body); },
    async remove(key) { delete files[key]; },
    async exists(key) { return key in files; },
    mime: () => "text/markdown",
  };
}

// What the site knows about its languages is the site's, not a storage's: each
// test starts it again, and builds what it asks for afresh.
beforeEach(() => siteChanged());

const links = (html: string) => [...html.matchAll(/<a href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map((m) => `${m[1]} ${m[2]}`);

// A site: English, with Welsh and French beside it. Welsh has translated the
// blog (and given it a label of its own), left about to the default, written a
// folder only it has, and started a translation of news it hasn't finished.
const SITE = {
  "index.md": "title: Home\nnav: Home\n\nHi",
  "cy/index.md": "lang: cy\ntitle: Hafan\nnav: Hafan\n\nCroeso",
  "fr/index.md": "lang: fr\ntitle: Accueil\n\nBonjour",
  "about/index.md": "title: About\nnav: About\norder: 1\n\nUs",
  "blog/index.md": "title: Blog\nnav: Blog\norder: 2\n\n{{pages}}",
  "cy/blog/index.md": "title: Blog Cymraeg\nnav: Blog (cy)\n\n{{pages}}",
  "news/index.md": "title: News\nnav: News\n\nNews",
  "cy/news/index.md": "title: Newyddion\ndraft: true\n\nNewyddion",
  "cy/lleol/index.md": "title: Lleol\nnav: Lleol\n\nDim ond yma",
  "secret/index.md": "title: Secret\ndraft: true\n\nx",
  "-hidden/index.md": "title: Hidden\n\nx",
  "contact.md": "title: Contact\n\nWrite",
  "cy/cymraeg.md": "title: Cymraeg\n\nDim ond yma",
  "404.md": "title: Not found\n\nGone",
  "cy/404.md": "title: Ddim yma\n\nWedi mynd",
};

describe("the nav", () => {
  test("the default's has no language's folders in it, and is otherwise as it was", async () => {
    const nav = await siteNav(memory(SITE), true);
    expect(links(nav)).toEqual(["/ Home", "/about/ About", "/blog/ Blog", "/news/ News"]);
  });

  test("a language's is the default's shape, pointing into the language's site", async () => {
    const nav = await siteNav(memory(SITE), true, "cy");
    expect(links(nav)).toEqual([
      "/cy/ Hafan",
      "/cy/about/ About",              // not translated: the default's, under the language
      "/cy/blog/ Blog (cy)",           // translated: its own label
      "/cy/lleol/ Lleol",              // only the language has it
      "/cy/news/ News",                // a draft there is not a translation: the default's again
    ]);
  });

  test("a language that gave no home of its own is its default's, without another's folders", async () => {
    const nav = await siteNav(memory({ ...SITE, "cy/index.md": "lang: cy\n\nHafan" }), true, "cy");
    expect(links(nav)).toEqual([
      "/cy/about/ About", "/cy/blog/ Blog (cy)", "/cy/lleol/ Lleol", "/cy/news/ News",   // no title or nav: no entry, as anywhere
    ]);
  });

  test("another language has nothing of the first's, and a folder only the first has isn't there", async () => {
    const nav = await siteNav(memory(SITE), true, "fr");
    expect(links(nav)).toEqual(["/fr/ Accueil", "/fr/about/ About", "/fr/blog/ Blog", "/fr/news/ News"]);
  });

  test("the order is the default's, said once; a folder only the language has says its own", async () => {
    const files = { ...SITE, "cy/zeta/index.md": "title: Zeta\norder: 0\n\nx", "cy/blog/index.md": "title: B\norder: 9\n\nx" };
    const nav = await siteNav(memory(files), true, "cy");
    expect(links(nav).map((l) => l.split(" ")[0])).toEqual([
      "/cy/", "/cy/zeta/", "/cy/about/", "/cy/blog/", "/cy/lleol/", "/cy/news/",
    ]);   // zeta says 0, about 1 and blog 2 (the default's: the translation's 9 is ignored), then the rest by name
  });

  test("a folder named for a language, inside another's, is a folder", async () => {
    const nav = await siteNav(memory({ ...SITE, "cy/fr/index.md": "title: Ffrangeg\nnav: Ffrangeg\n\nx" }), true, "cy");
    expect(links(nav)).toContain("/cy/fr/ Ffrangeg");
  });

  test("a site with no other language is as it always was", async () => {
    const nav = await siteNav(memory({ "index.md": "nav: Home\n\n", "cy/index.md": "title: Not a language\n\n" }), true);
    expect(links(nav)).toEqual(["/ Home", "/cy/ Not a language"]);
  });

  test("is kept per language, and dropped with the rest when a page changes", async () => {
    let lists = 0;
    const pages = memory(SITE);
    const counting: Storage = { ...pages, list: (prefix) => (lists++, pages.list(prefix)) };
    const welsh = await siteNav(counting, false, "cy");
    const once = lists;
    expect(await siteNav(counting, false, "cy")).toBe(welsh);
    expect(lists).toBe(once);                                  // kept
    expect(await siteNav(counting, false)).not.toBe(welsh);    // the default's is its own
    expect(lists).toBeGreaterThan(once);
    const both = lists;
    await siteNav(counting, false);
    await siteNav(counting, false, "cy");
    expect(lists).toBe(both);
    siteChanged();
    await siteNav(counting, false, "cy");
    expect(lists).toBeGreaterThan(both);                       // dropped
  });

  test("marks the page the reader is on by its address in the site it is in", () => {
    const nav = '<li><a href="/cy/">Hafan</a></li>\n<li><a href="/cy/blog/">Blog</a></li>';
    expect(markCurrent(nav, "cy/blog/index")).toContain('<a href="/cy/blog/" aria-current="page">');
    expect(markCurrent(nav, "cy/blog/a-post")).toContain('<a href="/cy/blog/" aria-current="true">');   // the folder it is in
  });
});

describe("treeOf", () => {
  test("is every name of either tree once, in the default's names", async () => {
    const tree = await treeOf(memory(SITE), "cy", "");
    expect(tree.files.sort()).toEqual(["404.md", "contact.md", "cymraeg.md", "index.md"]);
    expect(tree.folders.sort()).toEqual(["about", "blog", "lleol", "news", "secret"]);   // not cy, not fr, not -hidden
  });

  test("below the top, nothing is a language's", async () => {
    const tree = await treeOf(memory({ ...SITE, "blog/cy/index.md": "x", "cy/blog/fr/index.md": "x" }), "cy", "blog");
    expect(tree.folders.sort()).toEqual(["cy", "fr"]);
  });

  test("a folder only one tree has is in it, and a folder neither has is empty", async () => {
    expect(await treeOf(memory(SITE), "cy", "lleol")).toEqual({ files: ["index.md"], folders: [] });
    expect(await treeOf(memory(SITE), "cy", "nowhere")).toEqual({ files: [], folders: [] });
  });
});

describe("{{pages}}", () => {
  const BLOG = {
    ...SITE,
    "blog/one.md": "title: One\ndate: 2026-03-04\ndescription: The first.\n\nx",
    "blog/two.md": "title: Two\ndate: 2026-03-05\n\nx",
    "blog/three.md": "title: Three\ndate: 2026-03-01\n\nx",
    "blog/draft.md": "title: Draft\ndraft: true\n\nx",
    "blog/-aside.md": "title: Aside\n\nx",
    "blog/404.md": "title: Not a miss\n\nx",
    "cy/blog/one.md": "title: Un\ndescription: Y cyntaf.\n\nx",                  // no date of its own: the default's
    "cy/blog/two.md": "title: Dau\ndate: 2026-03-05\ndraft: true\n\nx",          // a draft there: the default's
    "cy/blog/three.md": "title: Tri\ndate: 2026-03-02\n\nx",                      // its own date wins
    "cy/blog/lleol.md": "title: Lleol\ndate: 2026-03-06\n\nx",                    // only the language has it
  };

  test("the default's is as it was, and has nothing of the language's", async () => {
    expect(links(await folderListing(memory(BLOG), "blog", true))).toEqual([
      "/blog/two.html Two", "/blog/one.html One", "/blog/three.html Three", "/blog/404.html Not a miss",
    ]);
  });

  test("a language's is what answers there, newest first, each linking into the language's site", async () => {
    expect(links(await folderListing(memory(BLOG), "blog", true, "cy"))).toEqual([
      "/cy/blog/lleol.html Lleol",       // 6 March, its own
      "/cy/blog/two.html Two",          // 5 March: the draft is not a translation, so the default's
      "/cy/blog/one.html Un",           // 4 March: from the default's, which has the date
      "/cy/blog/three.html Tri",        // 2 March: its own date, not the default's 1st
      "/cy/blog/404.html Not a miss",   // not a miss: only the root's 404.md is
    ]);
  });

  test("its dates are written as the language writes them, its descriptions are its own", async () => {
    const list = await folderListing(memory(BLOG), "blog", true, "cy");
    expect(list).toContain('<time datetime="2026-03-04">4 Mawrth 2026</time>');
    expect(list).toContain('<time datetime="2026-03-02">2 Mawrth 2026</time>');
    expect(list).toContain("<p>Y cyntaf.</p>");
    expect(list).not.toContain("The first.");
  });

  test("a language that has translated none of it lists the default's, as its own pages", async () => {
    expect(links(await folderListing(memory(BLOG), "blog", true, "fr"))).toEqual([
      "/fr/blog/two.html Two", "/fr/blog/one.html One", "/fr/blog/three.html Three", "/fr/blog/404.html Not a miss",
    ]);
  });

  test("leaves out a draft, an unlisted name, the index and, at the top, the 404 page (in either language)", async () => {
    const root = await folderListing(memory(BLOG), "", true, "cy");
    expect(links(root)).toEqual(["/cy/contact.html Contact", "/cy/cymraeg.html Cymraeg"]);
    expect(await folderListing(memory(BLOG), "blog", true, "cy")).not.toMatch(/Draft|Aside|Blog Cymraeg/);
  });

  test("a folder with nothing in it either way has no list", async () => {
    expect(await folderListing(memory(BLOG), "nowhere", true, "cy")).toBe("");
  });

  test("is kept per language and per folder", async () => {
    let reads = 0;
    const pages = memory(BLOG);
    const counting: Storage = { ...pages, read: (key) => (reads++, pages.read(key)) };
    await folderListing(counting, "blog", false, "cy");
    const once = reads;
    await folderListing(counting, "blog", false, "cy");
    expect(reads).toBe(once);
    await folderListing(counting, "blog", false);
    expect(reads).toBeGreaterThan(once);
  });

  test("a page that is a miss in the entries a feed makes is not the language's: folderEntries asks for the default's alone", async () => {
    const entries = await folderEntries(memory(BLOG), "blog");
    expect(entries.map((e) => e.key)).toEqual(["blog/two.md", "blog/one.md", "blog/three.md", "blog/404.md"]);
  });
});

describe("{{sitemap}}", () => {
  const MAP = {
    ...SITE,
    "blog/one.md": "title: One\ndate: 2026-03-04\n\nx",
    "cy/blog/one.md": "title: Un\n\nx",
    "cy/blog/two.md": "title: Dau\ndate: 2026-03-05\n\nx",
  };

  test("the default's has no language in it, and is otherwise as it was", async () => {
    const map = await siteMap(memory(MAP), true);
    // A folder with only its index (about, news) is a label with no list, which is left out.
    expect(links(map)).toEqual(["/ Home", "/contact.html Contact", "/blog/ Blog", "/blog/one.html One"]);
    expect(map).not.toContain("/cy/");
    expect(map).not.toContain("Accueil");
  });

  test("a language's is every page of its site, nested, each as it answers there", async () => {
    const map = await siteMap(memory(MAP), true, "cy");
    expect(links(map)).toEqual([
      "/cy/ Hafan",
      "/cy/contact.html Contact",        // not translated: the default's
      "/cy/cymraeg.html Cymraeg",        // only the language has it
      "/cy/blog/ Blog Cymraeg",
      "/cy/blog/two.html Dau",           // newest first, as {{pages}} has them
      "/cy/blog/one.html Un",
    ]);
    // A folder with nothing in it but its index (about, news, lleol) is a label with no list, which is left out.
    for (const left of ["/about/", "/news/", "/lleol/"]) expect(map).not.toContain(left);
  });

  test("a folder with pages but no index of its own in the language is the default's label, or its name", async () => {
    const map = await siteMap(memory({ ...MAP, "cy/zzz/page.md": "title: Tudalen\n\nx" }), true, "cy");
    expect(map).toContain("<li>zzz\n");   // no index anywhere: its name, as a default's folder would be
    expect(map).toContain('<a href="/cy/zzz/page.html">Tudalen</a>');
  });

  test("is kept per language", async () => {
    let lists = 0;
    const pages = memory(MAP);
    const counting: Storage = { ...pages, list: (prefix) => (lists++, pages.list(prefix)) };
    await siteMap(counting, false, "cy");
    const once = lists;
    await siteMap(counting, false, "cy");
    expect(lists).toBe(once);
    expect(await siteMap(counting, false)).not.toContain("/cy/");
  });
});
