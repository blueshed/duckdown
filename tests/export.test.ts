// The site written out as files, rendered by the same code that serves it.
import { describe, test, expect, spyOn } from "bun:test";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { RUN, SITE } from "./helpers";
import { exportSite, outPath, aliasFile, main, lands } from "../server/export";
import { brokenLinks } from "../server/links";
import { LocalStorage } from "../server/storage";
import { searchChanged } from "../server/search";
import { collectionsChanged } from "../server/collection";

const out = (name: string) => join(RUN, `export-${name}`);
const read = (dir: string, path: string) => readFileSync(join(dir, path), "utf8");
const quiet = () => {};

describe("outPath", () => {
  test("one page, one file, at the page's one address", () => {
    expect(outPath("index.md")).toBe("index.html");
    expect(outPath("blog/index.md")).toBe("blog/index.html");
    expect(outPath("blog/a-post.md")).toBe("blog/a-post.html");
  });
});

describe("exportSite", () => {
  test("writes every page through its template, and every static file beside it", async () => {
    const dir = out("whole");
    const count = await exportSite({ out: dir, origin: "https://example.com/", say: quiet });

    expect(count.pages).toBeGreaterThan(0);
    expect(count.files).toBeGreaterThan(0);

    // A folder is its index, and a page is itself.
    const home = read(dir, "index.html");
    const post = read(dir, "blog/a-post-with-its-own-layout.html");
    expect(existsSync(join(dir, "blog/index.html"))).toBe(true);

    // The whole document, not a fragment: template, nav, stylesheets.
    expect(home).toContain('<link href="/static/site.css" rel="stylesheet">');
    expect(home).toContain('<link href="/static/theme.css" rel="stylesheet">');
    expect(home).toContain('<ul class="nav">');
    expect(home).toContain('<link rel="canonical" href="https://example.com/">');

    // Its own layout, and the stylesheet a page asked for by name.
    expect(post).toContain("all posts");                       // templates/post.html
    expect(read(dir, "blog/one-page-that-looks-different.html"))
      .toContain('<link rel="stylesheet" href="/static/poster.css">');

    // Nothing that needs a server.
    expect(home).not.toContain("user-edit");
    expect(home).not.toMatch(/\{\{\w+\}\}/);

    // The index the browser searches, as a file: a published site has no
    // server to ask for it.
    const index = JSON.parse(read(dir, "search.json"));
    // Every page but the 404 page, and its sections after it.
    expect(index.filter((e: { url: string }) => !e.url.includes("#")).length).toBe(count.pages - 1);
    expect(index.some((e: { url: string }) => e.url === "/guide/pages.html#front-matter")).toBe(true);
    expect(index.find((e: { url: string }) => e.url === "/").title).toBe("duckdown");

    // static/ comes along, bytes and all.
    expect(read(dir, "static/site.css")).toContain("--accent");
    expect(existsSync(join(dir, "static/images/logo.svg"))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  test("leaves out drafts and anything in pages/ that isn't one", async () => {
    const draft = join(SITE, "pages", "export-draft.md");
    const stray = join(SITE, "pages", "notes.txt");
    writeFileSync(draft, "title: Not yet\ndraft: true\n\n# Not yet\n");
    writeFileSync(stray, "not a page");
    const dir = out("drafts");
    try {
      const count = await exportSite({ out: dir, say: quiet });
      expect(count.drafts).toBe(1);
      expect(existsSync(join(dir, "export-draft.html"))).toBe(false);
      expect(existsSync(join(dir, "notes.txt"))).toBe(false);
      expect(existsSync(join(dir, "notes.html"))).toBe(false);
    } finally {
      rmSync(draft); rmSync(stray); rmSync(dir, { recursive: true, force: true });
    }
  });

  test("starts from empty, so a deleted page doesn't survive in the output", async () => {
    const dir = out("stale");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "gone.html"), "a page that was deleted");
    await exportSite({ out: dir, say: quiet });
    expect(existsSync(join(dir, "gone.html"))).toBe(false);
    expect(existsSync(join(dir, "index.html"))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  test("says what it wrote, and says when the canonical links will be relative", async () => {
    const dir = out("said");
    const log = spyOn(console, "log").mockImplementation(() => {});
    try {
      await exportSite({ out: dir });   // no origin, no say: both defaults
      const said = log.mock.calls.map((c) => String(c[0])).join("\n");
      expect(said).toContain(`written to ${dir}/`);
      expect(said).toContain("DUCKDOWN_ORIGIN isn't set");
      expect(read(dir, "index.html")).toContain('<link rel="canonical" href="/">');
    } finally {
      log.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the seed's shared top bar", () => {
  test("the exported pages still carry the search form, via {{include topbar}}", async () => {
    const dir = out("topbar");
    await exportSite({ out: dir, say: quiet });
    const home = read(dir, "index.html");
    expect(home).toContain('<div class="topbar">');
    expect(home).toContain('class="search"');
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("an export of nothing", () => {
  const empty = join(RUN, "nothing-here");

  test("fails, names where it looked, and leaves a good dist alone", async () => {
    const dir = out("kept");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), "yesterday's site");
    mkdirSync(empty, { recursive: true });
    for (const store of [new LocalStorage(empty), new LocalStorage(join(RUN, "no-such-folder"))]) {
      const failure = await exportSite({ out: dir, pages: store, say: quiet }).catch((e: Error) => e);
      expect((failure as Error).message).toContain("No pages to export");
      expect((failure as Error).message).toContain(SITE);
      expect((failure as Error).message).toContain("DUCKDOWN_PATH");
    }
    expect(read(dir, "index.html")).toBe("yesterday's site");
    rmSync(dir, { recursive: true, force: true });
  });

  test("says when the pages it found were all drafts", async () => {
    mkdirSync(join(empty, "pages"), { recursive: true });
    writeFileSync(join(empty, "pages", "wip.md"), "title: Wip\ndraft: true\n\nsoon");
    const failure = await exportSite({ out: out("drafts-only"), pages: new LocalStorage(join(empty, "pages")), say: quiet })
      .catch((e: Error) => e);
    expect((failure as Error).message).toContain("(1 draft(s) left out)");
  });

  test("main turns it into a message and a non-zero exit", async () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    const pages = join(SITE, "pages");
    const hidden = join(SITE, "pages-hidden");
    renameSync(pages, hidden);
    try {
      expect(await main([out("main-empty")])).toBe(1);
      expect(String(error.mock.calls[0]![0])).toContain("No pages to export");
    } finally {
      renameSync(hidden, pages);
      error.mockRestore();
    }
  });
});

describe("what a published site needs beside its pages", () => {
  test("the home-screen icon at the root, under its two plain names", async () => {
    const icon = join(SITE, "static", "apple-touch-icon.png");
    writeFileSync(icon, "PNG-BYTES");
    try {
      const dir = out("icon");
      await exportSite({ out: dir, origin: "https://example.com", say: quiet });
      expect(read(dir, "apple-touch-icon.png")).toBe("PNG-BYTES");
      expect(read(dir, "apple-touch-icon-precomposed.png")).toBe("PNG-BYTES");
    } finally {
      rmSync(icon);
    }
  });

  test("robots.txt and favicon.ico at the root, the base it has no copy of, and a sitemap", async () => {
    const dir = out("crawlers");
    await exportSite({ out: dir, origin: "https://example.com", say: quiet, files: new LocalStorage(join(RUN, "no-statics")) });
    // The site has no static/ here, so the base comes from duckdown.
    expect(read(dir, "static/site.css")).toContain("--accent");
    expect(existsSync(join(dir, "static/search.js"))).toBe(true);
    expect(existsSync(join(dir, "robots.txt"))).toBe(false);

    const full = out("crawlers-full");
    await exportSite({ out: full, origin: "https://example.com", say: quiet });
    expect(read(full, "robots.txt")).toContain("Allow: /");
    expect(existsSync(join(full, "favicon.ico"))).toBe(true);
    expect(existsSync(join(full, "apple-touch-icon.png"))).toBe(false);   // the seed has no icon: nothing written
    expect(existsSync(join(full, "static/robots.txt"))).toBe(true);   // and still where the editor has it
    const xml = read(full, "sitemap.xml");
    expect(xml).toContain("<loc>https://example.com/</loc>");
    expect(xml).toContain("<loc>https://example.com/blog/a-post-with-its-own-layout.html</loc><lastmod>2026-09-21</lastmod>");
    expect(xml).not.toContain("404");
    expect(existsSync(join(full, "404.html"))).toBe(true);           // the miss page a static host serves
    // n111: the blog's feed, at the address its pages link to, in absolute addresses.
    const feed = read(full, "blog/feed.xml");
    expect(feed).toContain("<id>https://example.com/blog/feed.xml</id>");
    expect(feed).toContain("<id>https://example.com/blog/a-post-with-its-own-layout.html</id>");
    expect(read(full, "blog/a-post-with-its-own-layout.html"))
      .toContain('<link rel="alternate" type="application/atom+xml" title="Blog" href="/blog/feed.xml">');
    // n112: a card with absolute addresses, from DUCKDOWN_ORIGIN.
    const work = read(full, "gallery/first-light/index.html");
    expect(work).toContain('<meta property="og:url" content="https://example.com/gallery/first-light/">');
    expect(work).toContain('<meta property="og:image" content="https://example.com/static/images/gallery/one.svg">');
    rmSync(dir, { recursive: true, force: true });
    rmSync(full, { recursive: true, force: true });
  });

  test("no sitemap without an origin, and it says why", async () => {
    const dir = out("no-origin");
    const said: string[] = [];
    await exportSite({ out: dir, say: (l) => said.push(l) });
    expect(existsSync(join(dir, "sitemap.xml"))).toBe(false);
    expect(said.join("\n")).toContain("sitemap.xml");
    // n111: nor a feed, which says so, and no page links to the feed it didn't write.
    expect(existsSync(join(dir, "blog/feed.xml"))).toBe(false);
    expect(said.join("\n")).toContain("/blog/feed.xml not written: a feed needs DUCKDOWN_ORIGIN for its addresses.");
    expect(read(dir, "blog/index.html")).not.toContain("application/atom+xml");
    // n112: nor a card's address or picture, which must be absolute; its title stays.
    const work = read(dir, "gallery/first-light/index.html");
    expect(work).toContain('<meta property="og:title"');
    expect(work).not.toContain("og:url");
    expect(work).not.toContain("og:image");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("the site map, exported", () => {
  test("sitemap.html lists a nested page, and the 404 page links to it", async () => {
    const dir = out("site-map");
    await exportSite({ out: dir, say: quiet });
    expect(read(dir, "sitemap.html")).toContain('<a href="/blog/a-post-with-its-own-layout.html">');
    expect(read(dir, "404.html")).toContain('href="/sitemap.html"');
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("brokenLinks", () => {
  const known = new Set(["index.html", "blog/index.html", "about.html", "a b.html", "static/site.css", "static/Hart'sLeap.jpg"]);
  const one = (from: string, html: string) => brokenLinks(new Map([[from, html]]), known);

  test("finds a link to nothing, by page and as written", () => {
    expect(one("news/index.html", '<a href="include/music/x.mp3">x</a>')).toEqual(["news/index.html -> include/music/x.mp3"]);
    expect(one("index.html", "<img src='/missing.png'>")).toEqual(["index.html -> /missing.png"]);
  });

  test("passes what is there: a file, a folder's index, a folder without its slash", () => {
    expect(one("index.html", '<a href="/about.html"></a><a href="/blog/"></a><a href="/blog"></a><a href="/"></a><link href="/static/site.css">')).toEqual([]);
  });

  test("resolves against the page's own address", () => {
    expect(one("blog/index.html", '<a href="../about.html"></a><a href="../">up</a>')).toEqual([]);
    expect(one("blog/index.html", '<a href="about.html"></a>')).toEqual(["blog/index.html -> about.html"]);
  });

  test("ignores other sites, fragments, queries, mail and empty links", () => {
    expect(one("index.html",
      '<a href="https://example.com/x"></a><a href="//cdn.example.com/x.js"></a><a href="mailto:a@b.c"></a>'
      + '<a href="#top"></a><a href="about.html#part"></a><a href="?page=2"></a><a href=""></a>')).toEqual([]);
  });

  test("reads an entity or a percent-escape as the character it is", () => {
    expect(one("index.html", '<img src="/static/Hart&#x27;sLeap.jpg"><img src="/static/Hart&#39;sLeap.jpg">')).toEqual([]);
    expect(one("index.html", '<a href="/a%20b.html"></a><a href="/a&#32;b.html"></a>')).toEqual([]);
    expect(one("index.html", '<a href="/about.html?a=1&amp;b=2"></a>')).toEqual([]);
    // The editor's addresses exist on a served site; they are no mistake.
    expect(one("index.html", '<a href="/login"></a><a href="/edit?path=x.md"></a><a href="/logout"></a>')).toEqual([]);
    expect(one("index.html", '<a href="/editions.html"></a>')).toEqual(["index.html -> /editions.html"]);
    // What isn't an entity, or isn't a character, stays as it is, and a bad escape is just missing.
    expect(one("index.html", '<a href="/x&nbsp;y"></a><a href="/x&#x110000;"></a><a href="/%E0%A4%A"></a>'))
      .toEqual(["index.html -> /x&nbsp;y", "index.html -> /x&#x110000;", "index.html -> /%E0%A4%A"]);
  });
});

describe("the export's report of broken links", () => {
  const page = join(SITE, "pages", "links.md");

  test("reports and counts them, and the seed itself has none", async () => {
    const clean = await exportSite({ out: out("clean"), say: quiet });
    expect(clean.broken).toBe(0);
    writeFileSync(page, "title: Links\n\n[gone](/gone.html) and [here](/blog/)\n");
    const said: string[] = [];
    try {
      const dir = out("links");
      const count = await exportSite({ out: dir, say: (l) => said.push(l) });
      expect(count.broken).toBe(1);
      expect(said).toContain("broken link: links.html -> /gone.html");
      rmSync(dir, { recursive: true, force: true });
    } finally {
      rmSync(page);
    }
  });

  test("--strict, or DUCKDOWN_STRICT=1, turns them into a failure and an exit code", async () => {
    writeFileSync(page, "title: Links\n\n[gone](/gone.html)\n");
    const log = spyOn(console, "log").mockImplementation(() => {});
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await main([out("lenient")])).toBe(0);                                 // a report, not a failure
      expect(await main(["--strict", out("strict")])).toBe(1);
      expect(await main([out("env")], { DUCKDOWN_STRICT: "1" })).toBe(1);
      expect(String(error.mock.calls.at(-1)![0])).toContain("1 broken link(s)");
    } finally {
      rmSync(page); log.mockRestore(); error.mockRestore();
    }
    expect(await exportSite({ out: out("mended"), strict: true, say: quiet }).then((c) => c.broken)).toBe(0);
  });
});

describe("collections", () => {
  test("every item is a page in dist/, and the overview links to it", async () => {
    const dir = out("collection");
    const count = await exportSite({ out: dir, origin: "https://example.com", say: quiet });

    // The item, at its one canonical address, through the same pageHtml the
    // site and the preview use: a feature that skipped the export wouldn't be
    // a duckdown feature.
    const item = read(dir, "gallery/first-light/index.html");
    expect(item).toContain("<title>First Light</title>");
    expect(item).toContain('<link rel="canonical" href="https://example.com/gallery/first-light/">');
    expect(item).toContain('<a class="next" rel="next" href="/gallery/second-wind/">Second Wind</a>');
    expect(item).not.toContain("user-edit");           // no editor behind a folder of files
    expect(item).not.toMatch(/\{\{[\w-]+\}\}/);
    expect(item).toContain("<figcaption>First Light, 1961. Ink on paper, 40 x 40 cm.</figcaption>");   // the each: page's body
    expect(existsSync(join(dir, "gallery/item.html"))).toBe(false);                                     // and not a page itself

    expect(read(dir, "gallery/index.html")).toContain('<a class="item" href="/gallery/first-light/">');
    expect(read(dir, "by-year.html")).toContain("<h2>1961 - Early work</h2>");

    // Items are pages to search and to the sitemap, from the same walk.
    const index = JSON.parse(read(dir, "search.json"));
    expect(index.some((e: { url: string }) => e.url === "/gallery/study-in-green/")).toBe(true);
    expect(read(dir, "sitemap.xml")).toContain("https://example.com/gallery/study-in-green/");

    // The thumbnails a collection points at are links like any other, so a
    // missing one is reported rather than published.
    expect(count.broken).toBe(0);
    expect(count.problems).toBe(0);
  });

  test("an alias is a redirect page a static host can serve", async () => {
    const dir = out("aliases");
    await exportSite({ out: dir, origin: "https://example.com", say: quiet });
    const moved = read(dir, "first-light-1961/index.html");
    expect(moved).toContain('<link rel="canonical" href="/gallery/first-light/">');
    expect(moved).toContain('<meta http-equiv="refresh" content="0; url=/gallery/first-light/">');
    // And this server finds it: /first-light-1961 redirects to the folder,
    // whose index.html is the page above.
    expect(existsSync(join(dir, "first-light-1961", "index.html"))).toBe(true);
  });

  test("a legacy address full of punctuation is written under the name a request decodes to", async () => {
    const dir = out("legacy");
    const file = join(SITE, "pages", "gallery", "collection.json");
    const before = readFileSync(file, "utf8");
    const changed = JSON.parse(before);
    changed.groups[0].items[0].aliases.push(`/l"etoile-1976`, "/don’t-write-everything-down");
    try {
      writeFileSync(file, JSON.stringify(changed));
      collectionsChanged();
      searchChanged();
      await exportSite({ out: dir, origin: "https://example.com", say: quiet });
      // The name on disk is the decoded one, which is what serve.ts looks for
      // after decodePath — so the round trip works without re-encoding twice.
      expect(read(dir, `l"etoile-1976/index.html`)).toContain("/gallery/first-light/");
      expect(read(dir, "don’t-write-everything-down/index.html")).toContain("/gallery/first-light/");
    } finally {
      writeFileSync(file, before);
      collectionsChanged();
      searchChanged();
    }
  });

  test("an alias is written as the file a request for it opens, and never outside dist/", () => {
    expect(aliasFile("/first-light-1961")).toBe("first-light-1961/index.html");
    expect(aliasFile("/old/place/")).toBe("old/place/index.html");
    // /legacy.html is opened as legacy.html — by serve.ts and by a static host.
    expect(aliasFile("/legacy.html")).toBe("legacy.html");
    expect(aliasFile("/")).toBe("index.html");
    expect(aliasFile("../../escaped")).toBeNull();
    expect(aliasFile("/a/./b")).toBeNull();
    expect(aliasFile("/a/../../b")).toBeNull();
  });

  test("a page's .html alias answers in dist/, and one that climbs out is left out and said", async () => {
    const dir = join(RUN, "alias-climb", "dist");
    const page = join(SITE, "pages", "moved.md");
    const said: string[] = [];
    writeFileSync(page, "title: Moved\naliases: /legacy.html\naliases: ../../escaped\n\n# Moved\n");
    try {
      const count = await exportSite({ out: dir, origin: "https://example.com", say: (l) => said.push(l) });
      expect(read(dir, "legacy.html")).toContain('<link rel="canonical" href="/moved.html">');
      expect(existsSync(join(RUN, "escaped"))).toBe(false);
      expect(existsSync(join(RUN, "alias-climb", "escaped"))).toBe(false);
      expect(said.join("\n")).toContain("alias ../../escaped climbs out of the site");
      expect(count.problems).toBe(1);
    } finally {
      rmSync(page);
    }
  });

  // n95: a name the filesystem refuses, or keeps under another spelling, was
  // an export that crashed or an address that silently didn't answer.
  test("an alias this filesystem won't take is left out and said, and the rest of the site is written", async () => {
    const dir = join(RUN, "alias-refused", "dist");
    const page = join(SITE, "pages", "refused.md");
    const said: string[] = [];
    const long = `/${"x".repeat(300)}`;                                   // no filesystem takes a 300-byte name
    writeFileSync(page, `title: Refused\naliases: ${long}\naliases: /refused.html/under\naliases: /kept\n\n# Refused\n`);
    try {
      const count = await exportSite({ out: dir, origin: "https://example.com", say: (l) => said.push(l) });
      const lines = said.join("\n");
      expect(lines).toContain(`alias ${long} can't be written here as ${long.slice(1)}/index.html (ENAMETOOLONG) — left out`);
      expect(lines).toContain("alias /refused.html/under can't be written here as refused.html/under/index.html (");   // a page is a file, not a folder
      expect(read(dir, "refused.html")).toContain("<h1");                  // the page it clashed with is untouched
      expect(read(dir, "kept/index.html")).toContain('href="/refused.html"');
      expect(count.problems).toBe(2);
    } finally {
      rmSync(page);
    }
  });

  test("an alias a filesystem keeps under another spelling is said, and not counted as written", async () => {
    const dir = join(RUN, "alias-respelt", "dist");
    const page = join(SITE, "pages", "respelt.md");
    const said: string[] = [];
    writeFileSync(page, "title: Respelt\naliases: /café\n\n# Respelt\n");
    try {
      const count = await exportSite({
        out: dir, origin: "https://example.com", say: (l) => said.push(l),
        lands: (_, path) => path !== "café/index.html",                      // as a normalising filesystem would
      });
      expect(said.join("\n")).toContain("alias /café was written, but this filesystem spells café/index.html another way — a request for it won't find it");
      expect(count.problems).toBe(1);
    } finally {
      rmSync(page);
    }
  });

  test("lands() is true only for the name spelt exactly as asked", () => {
    const dir = join(RUN, "lands");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(join(dir, "cafe\u0301"), { recursive: true });              // é as e + a combining accent
    writeFileSync(join(dir, "cafe\u0301", "index.html"), "");
    expect(lands(dir, "cafe\u0301/index.html")).toBe(true);
    expect(lands(dir, "caf\u00e9/index.html")).toBe(false);               // é as one character: another name
    expect(lands(dir, "cafe\u0301/other.html")).toBe(false);
  });

  test("an alias that is already a page leaves the page alone and says so", async () => {
    const dir = out("alias-clash");
    const said: string[] = [];
    const file = join(SITE, "pages", "gallery", "collection.json");
    const before = readFileSync(file, "utf8");
    const changed = JSON.parse(before);
    changed.groups[0].items[0].aliases.push("/gallery");   // the folder's own index
    try {
      writeFileSync(file, JSON.stringify(changed));
      collectionsChanged();
      const count = await exportSite({ out: dir, origin: "https://example.com", say: (l) => said.push(l) });
      expect(read(dir, "gallery/index.html")).toContain('class="collection"');   // still the overview
      expect(said.join("\n")).toContain("alias /gallery is already a page");
      expect(count.problems).toBe(1);
    } finally {
      writeFileSync(file, before);
      collectionsChanged();
    }
  });

  test("a collection that can't have its addresses is reported, and --strict stops the build", async () => {
    const log = spyOn(console, "error").mockImplementation(() => {});
    const said: string[] = [];
    const file = join(SITE, "pages", "gallery", "collection.json");
    const before = readFileSync(file, "utf8");
    const changed = JSON.parse(before);
    changed.groups[0].items.push({ title: "Notes" });
    try {
      writeFileSync(join(SITE, "pages", "gallery", "notes.md"), "title: Notes\n\n# Notes");
      writeFileSync(file, JSON.stringify(changed));
      collectionsChanged();
      const count = await exportSite({ out: out("clash"), origin: "", say: (l) => said.push(l) });
      expect(count.problems).toBe(1);
      expect(said.join("\n")).toContain("already a page");
      await expect(exportSite({ out: out("clash"), origin: "", say: quiet, strict: true }))
        .rejects.toThrow("collection problem(s), and --strict is on");
    } finally {
      rmSync(join(SITE, "pages", "gallery", "notes.md"));
      writeFileSync(file, before);
      collectionsChanged();
      log.mockRestore();
    }
  });
});
