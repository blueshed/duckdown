// The site written out as files, rendered by the same code that serves it.
import { describe, test, expect, spyOn } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { RUN, SITE } from "./helpers";
import { exportSite, outPath } from "../server/export";

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
