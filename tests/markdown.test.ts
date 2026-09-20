import { describe, test, expect, spyOn } from "bun:test";
import { parseFrontMatter, renderMarkdown, buildNav, loadThemeCss } from "../server/markdown";
import type { Storage, Listing } from "../server/storage";
import { siteNav, pagesChanged, markCurrent, folderListing } from "../server/nav";

// An in-memory Storage over { "guide/index.md": "…" }; exists() throws for `broken`.
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
    async read(key) { return files[key]!; },
    async readBytes(key) { return new TextEncoder().encode(files[key]); },
    async write(key, body) { files[key] = String(body); },
    async remove(key) { delete files[key]; },
    async exists(key) {
      if (key === broken) throw new Error("storage is down");
      return key in files;
    },
    mime: () => "text/plain",
  };
}

describe("buildNav", () => {
  const pages = memory({
    "index.md": "title: duckdown\nnav: Home\n\n",
    "about.md": "title: About\n\n", // a page, not a folder: not in the nav
    "guide/index.md": "title: Guide\n\n", // no nav: falls back to the title
    "guide/deep/index.md": "nav: Deep\n\n",
    "plain/index.md": "# No front matter\n", // nothing to call it: left out
    "-drafts/index.md": "title: Drafts\n\n",
    ".git/index.md": "title: Git\n\n",
    "My Folder/index.md": "title: Mine\n\n",
  });

  test("lists each folder's index.md by its nav, else its title", async () => {
    const nav = await buildNav(pages);
    expect(nav).toContain('<li><a href="/index.html">Home</a></li>');
    expect(nav).toContain('<li><a href="/guide/index.html">Guide</a></li>');
    expect(nav).toContain('<li><a href="/guide/deep/index.html">Deep</a></li>');
    expect(nav).toContain('<li><a href="/My%20Folder/index.html">Mine</a></li>');
  });

  test("leaves out plain pages, untitled folders, and - or . folders", async () => {
    const nav = await buildNav(pages);
    for (const missing of ["About", "plain", "Drafts", "Git"]) expect(nav).not.toContain(missing);
  });

  test("is empty for an empty site", async () => {
    expect(await buildNav(memory({}))).toBe("");
  });
});

describe("siteNav", () => {
  // The cache is shared with the in-process server: start and end it empty.
  test("builds once, rebuilds after pagesChanged, and never keeps a failure", async () => {
    pagesChanged();
    let lists = 0;
    const pages = memory({ "index.md": "nav: Home\n\n" });
    const counting = { ...pages, list: (prefix: string) => (lists++, pages.list(prefix)) };
    try {
      expect(await siteNav(counting)).toContain(">Home<");
      const once = lists;
      expect(await siteNav(counting)).toContain(">Home<");
      expect(lists).toBe(once); // kept
      pagesChanged();
      await siteNav(counting);
      expect(lists).toBe(once * 2); // rebuilt

      pagesChanged();
      const failing = { ...pages, list: async () => { throw new Error("storage is down"); } };
      await expect(siteNav(failing)).rejects.toThrow("storage is down");
      expect(await siteNav(counting)).toContain(">Home<"); // tried again, not the failure
    } finally {
      pagesChanged();
    }
  });

  test("in development it is built per request, so files written straight to disk show up", async () => {
    pagesChanged();
    let lists = 0;
    const pages = memory({ "index.md": "nav: Home\n\n" });
    const counting = { ...pages, list: (prefix: string) => (lists++, pages.list(prefix)) };
    try {
      await siteNav(counting, true);
      const once = lists;
      await siteNav(counting, true);
      expect(lists).toBe(once * 2); // built again
      await siteNav(counting, false);
      await siteNav(counting, false);
      expect(lists).toBe(once * 3); // kept
    } finally {
      pagesChanged();
    }
  });
});

describe("folderListing", () => {
  const pages = memory({
    "blog/index.md": "title: Blog\n\n{{pages}}",
    "blog/one.md": "title: One\ndate: 2026-03-04\ndescription: The first.\n\n",
    "blog/two.md": "title: Two\ndate: whenever\n\n", // a date it can't read
    "blog/three.md": "# No front matter\n", // no title: the file's name
    "blog/draft.md": "title: Draft\ndraft: true\n\n",
    "blog/-aside.md": "title: Aside\n\n",
    "blog/notes.txt": "not a page",
    "empty/index.md": "title: Empty\n\n",
  });

  test("lists the folder's pages, leaving out its index, drafts, - files and non-pages", async () => {
    const list = await folderListing(pages, "blog", true);
    expect(list).toContain('<a href="/blog/one.html">One</a>');
    expect(list).toContain('<time datetime="2026-03-04">4 March 2026</time>');
    expect(list).toContain("<p>The first.</p>");
    expect(list).toContain('<time datetime="whenever">whenever</time>'); // shown as written
    expect(list).toContain('<a href="/blog/three.html">three</a>');
    for (const missing of ["Blog<", "Draft", "Aside", "notes"]) expect(list).not.toContain(missing);
  });

  test("dated pages come first, newest first; the rest follow by title", async () => {
    const order = [...(await folderListing(pages, "blog", true)).matchAll(/<a [^>]*>([^<]*)<\/a>/g)].map((m) => m[1]);
    expect(order).toEqual(["Two", "One", "three"]); // "whenever" sorts above 2026-03-04, then the undated
  });

  test("a folder with nothing to list has no list", async () => {
    expect(await folderListing(pages, "empty", true)).toBe("");
  });

  test("is kept until a page changes, and a failure isn't kept", async () => {
    pagesChanged();
    let reads = 0;
    const counting = { ...pages, read: (key: string) => (reads++, pages.read(key)) };
    try {
      await folderListing(counting, "blog");
      const once = reads;
      await folderListing(counting, "blog");
      expect(reads).toBe(once); // kept
      pagesChanged();
      await folderListing(counting, "blog");
      expect(reads).toBe(once * 2); // rebuilt

      pagesChanged();
      const failing = { ...pages, list: async () => { throw new Error("storage is down"); } };
      await expect(folderListing(failing, "blog")).rejects.toThrow("storage is down");
      expect(await folderListing(counting, "blog")).toContain(">One<"); // tried again
    } finally {
      pagesChanged();
    }
  });
});

describe("loadThemeCss", () => {
  const pages = memory({
    "-theme.css": "/* root */",
    "guide/-theme.css": "/* guide */",
    "guide/deep/-theme.css": "/* deep */",
  }, "broken/-theme.css");

  test("cascades: the root's theme, then each folder's down to the page's own", async () => {
    expect(await loadThemeCss(pages, "index")).toBe("/* root */");
    expect(await loadThemeCss(pages, "guide/deep/page.md")).toBe("/* root */\n/* guide */\n/* deep */");
    expect(await loadThemeCss(pages, "other/page")).toBe("/* root */"); // a folder without one inherits
  });

  test("is empty for a site without themes", async () => {
    expect(await loadThemeCss(memory({}), "guide/intro")).toBe("");
  });

  test("leaves out a theme it can't load, and says why", async () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await loadThemeCss(pages, "broken/page")).toBe("/* root */");
      expect(error.mock.calls[0]![0]).toBe("Couldn't load broken/-theme.css:");
    } finally {
      error.mockRestore();
    }
  });
});

describe("markCurrent", () => {
  const nav = [
    '<li><a href="/index.html">Home</a></li>',
    '<li><a href="/guide/index.html">Guide</a></li>',
    '<li><a href="/My%20Folder/index.html">Mine</a></li>',
  ].join("\n");

  test("marks the page's own link", () => {
    expect(markCurrent(nav, "index")).toContain('<a href="/index.html" aria-current="page">Home</a>');
    expect(markCurrent(nav, "guide/index")).toContain('<a href="/guide/index.html" aria-current="page">Guide</a>');
    expect(markCurrent(nav, "My Folder/index")).toContain('href="/My%20Folder/index.html" aria-current="page"');
  });

  test("else the nearest folder the page is in, but never the root", () => {
    expect(markCurrent(nav, "guide/pages")).toContain('<a href="/guide/index.html" aria-current="true">Guide</a>');
    expect(markCurrent(nav, "guide/deep/page")).toContain('href="/guide/index.html" aria-current="true"');
    expect(markCurrent(nav, "about")).toBe(nav);
    expect(markCurrent(nav, "about").match(/aria-current/g)).toBeNull();
  });
});

describe("parseFrontMatter", () => {
  test("parses key-value pairs", () => {
    const { meta, body } = parseFrontMatter("title: Hello\ntheme: dark\n\n# Content");
    expect(meta.title).toEqual(["Hello"]);
    expect(meta.theme).toEqual(["dark"]);
    expect(body).toBe("# Content");
  });

  test("handles multiple values for same key", () => {
    const { meta } = parseFrontMatter("x-tag: one\nx-tag: two\n\nbody");
    expect(meta["x-tag"]).toEqual(["one", "two"]);
  });

  test("a bare block holds only the keys duckdown reads, so prose keeps its first line", () => {
    const prose = parseFrontMatter("Update: the shop is closed on Monday.\nSee you Tuesday.");
    expect(prose.meta).toEqual({});
    expect(prose.body).toStartWith("Update: the shop");

    const mixed = parseFrontMatter("title: Sale\nauthor: Peter\n\nWe are open.");
    expect(mixed.meta).toEqual({ title: ["Sale"] });
    expect(mixed.body).toBe("author: Peter\n\nWe are open."); // the rest is content, in plain sight
  });

  test("a --- fence takes any key", () => {
    const { meta, body } = parseFrontMatter("---\ntitle: Sale\nauthor: Peter\n\ntags: one\n---\n\n# Sale");
    expect(meta).toEqual({ title: ["Sale"], author: ["Peter"], tags: ["one"] });
    expect(body).toBe("# Sale");
  });

  test("an unclosed fence is left as content", () => {
    const source = "---\ntitle: Sale\n\n# Sale";
    expect(parseFrontMatter(source)).toEqual({ meta: {}, body: source });
  });

  test("returns full source when no front-matter", () => {
    const { meta, body } = parseFrontMatter("# Just markdown\n\nNo metadata here.");
    expect(Object.keys(meta)).toHaveLength(0);
    expect(body).toBe("# Just markdown\n\nNo metadata here.");
  });

  test("handles empty input", () => {
    const { meta, body } = parseFrontMatter("");
    expect(Object.keys(meta)).toHaveLength(0);
    expect(body).toBe("");
  });

  test("lowercases keys", () => {
    const { meta } = parseFrontMatter("Title: Foo\nTHEME: bar\n\nbody");
    expect(meta.title).toEqual(["Foo"]);
    expect(meta.theme).toEqual(["bar"]);
  });

  test("handles keys with hyphens", () => {
    const { meta } = parseFrontMatter("x-script-src: foo.js\n\nbody");
    expect(meta["x-script-src"]).toEqual(["foo.js"]);
  });

  test("stops at first non-metadata line", () => {
    const { meta, body } = parseFrontMatter("title: Hello\n# Heading\n\nParagraph");
    expect(meta.title).toEqual(["Hello"]);
    expect(body).toBe("# Heading\n\nParagraph");
  });
});

describe("renderMarkdown", () => {
  test("renders basic markdown", () => {
    const { content } = renderMarkdown("# Hello\n\nWorld");
    expect(content).toContain('<h1 id="hello">');
    expect(content).toContain("<p>World</p>");
  });

  test("headings link to themselves, repeats numbered", () => {
    const { content } = renderMarkdown("## Two Words\n\n## Two Words");
    expect(content).toContain('<h2 id="two-words"><a href="#two-words">Two Words</a></h2>');
    expect(content).toContain('<h2 id="two-words-1">');
  });

  test("toc: true lists the h2s and h3s under the title", () => {
    const { content } = renderMarkdown("toc: true\n\n# Title\n\nIntro\n\n## First *part*\n\n### Detail\n\n#### Too deep");
    expect(content).toStartWith('<h1 id="title"><a href="#title">Title</a></h1>\n<nav class="toc" aria-label="Contents"><ul>');
    expect(content).toContain('<li class="toc-h2"><a href="#first-part">First part</a></li>');
    expect(content).toContain('<li class="toc-h3"><a href="#detail">Detail</a></li>');
    expect(content.match(/<nav class="toc"[\s\S]*?<\/nav>/)![0]).not.toContain("too-deep"); // h4s stay out
  });

  test("toc: yes without a title puts the contents first; without headings adds nothing", () => {
    expect(renderMarkdown("toc: yes\n\n## Only").content).toStartWith('<nav class="toc"');
    expect(renderMarkdown("toc: true\n\nJust text").content).toBe("<p>Just text</p>\n");
    expect(renderMarkdown("## Only").content).not.toContain("toc");
  });

  test("callouts: [!NOTE], [!TIP], [!IMPORTANT], [!WARNING], [!CAUTION]", () => {
    for (const kind of ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"]) {
      const { content } = renderMarkdown(`> [!${kind}]\n> Mind this.`);
      const k = kind.toLowerCase();
      expect(content).toContain(`<blockquote class="callout ${k}"><p class="callout-title">${kind[0]}${k.slice(1)}</p><p>Mind this.</p>`);
    }
  });

  test("a callout's text can follow a blank line; the marker is case-blind; other quotes stay quotes", () => {
    expect(renderMarkdown("> [!warning]\n>\n> Careful.").content).toContain(
      '<blockquote class="callout warning"><p class="callout-title">Warning</p>\n<p>Careful.</p>',
    );
    expect(renderMarkdown("> Just a quote").content).toContain("<blockquote>\n<p>Just a quote</p>");
    expect(renderMarkdown("> [!OTHER]\n> text").content).toContain("<p>[!OTHER]");
  });

  test("[[wiki links]] resolve like relative links, with .html added", () => {
    const link = (md: string, path = "guide/pages") => renderMarkdown(md, path).content.match(/<a [^>]*>[^<]*<\/a>/)![0];
    expect(link("[[themes]]")).toBe('<a class="wikilink" href="/guide/themes.html">themes</a>');
    expect(link("[[themes|the Themes guide]]")).toBe('<a class="wikilink" href="/guide/themes.html">the Themes guide</a>');
    expect(link("[[/index]]")).toBe('<a class="wikilink" href="/index.html">/index</a>');
    expect(link("[[images#adding-images]]")).toBe('<a class="wikilink" href="/guide/images.html#adding-images">images#adding-images</a>');
    expect(link("[[#callouts]]")).toBe('<a class="wikilink" href="#callouts">#callouts</a>');
    expect(link("[[About us.md]]", "index")).toBe('<a class="wikilink" href="/About%20us.html">About us.md</a>');
  });

  test("strips front-matter from output", () => {
    const { content, meta } = renderMarkdown("title: Test\n\n# Heading");
    expect(meta.title).toEqual(["Test"]);
    expect(content).not.toContain("title:");
    expect(content).toContain("Heading");
  });

  test("renders GFM tables", () => {
    const { content } = renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(content).toContain("<table>");
  });

  test("renders strikethrough", () => {
    const { content } = renderMarkdown("~~deleted~~");
    expect(content).toContain("<del>");
  });
});
