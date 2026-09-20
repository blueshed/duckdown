import { describe, test, expect, beforeAll, spyOn } from "bun:test";
import { mkdirSync, writeFileSync, readFileSync, renameSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { BASE, SITE, signIn, authed } from "./helpers";

beforeAll(signIn);

// Quiet a console method for one test, returning the spy to assert on.
function hush(method: "error" | "log" | "warn") {
  return spyOn(console, method).mockImplementation(() => {});
}

async function login(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return fetch(`${BASE}/login`, { method: "POST", body: form, redirect: "manual" });
}

// --- Auth ---

describe("auth", () => {
  test("GET /login returns the login page, heading for the editor", async () => {
    const res = await fetch(`${BASE}/login`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Sign In");
    expect(html).toContain('name="next" value="/edit"');
  });

  test("GET /login keeps a same-site next and drops any other", async () => {
    expect(await (await fetch(`${BASE}/login?next=/edit%3Fpath%3Dindex.md`)).text()).toContain('value="/edit?path=index.md"');
    expect(await (await fetch(`${BASE}/login?next=//evil.example`)).text()).toContain('value="/edit"');
  });

  test("GET /login when already signed in goes straight to the editor", async () => {
    const res = await fetch(`${BASE}/login`, authed({ redirect: "manual" }));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/edit");
  });

  test("POST /login with valid creds lands in the editor", async () => {
    const res = await login({ email: "admin", password: "admin" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/edit");
    expect(res.headers.get("set-cookie")).toContain("duckie_token=");
  });

  test("POST /login honours next", async () => {
    const res = await login({ email: "admin", password: "admin", next: "/edit?path=guide/index.md" });
    expect(res.headers.get("location")).toBe("/edit?path=guide/index.md");
  });

  test("POST /login with bad creds returns 401", async () => {
    const res = await login({ email: "admin", password: "wrong" });
    expect(res.status).toBe(401);
    expect(await res.text()).toContain("Invalid");
  });

  test("POST /login without a password returns 400", async () => {
    const res = await login({ email: "admin" });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Email and password required");
  });

  test("POST /login says so when users.json can't be read", async () => {
    const file = join(SITE, "users.json");
    const users = readFileSync(file, "utf8");
    writeFileSync(file, "{ not json");
    const error = hush("error");
    try {
      const res = await login({ email: "admin", password: "admin" });
      expect(res.status).toBe(500);
      expect(await res.text()).toContain("users.json can't be read");
      expect(error).toHaveBeenCalled();
    } finally {
      writeFileSync(file, users);
      error.mockRestore();
    }
  });

  test("POST /login without a users.json logs that nobody can sign in", async () => {
    const file = join(SITE, "users.json");
    renameSync(file, `${file}.away`);
    const error = hush("error");
    try {
      const res = await login({ email: "admin", password: "admin" });
      expect(res.status).toBe(401);
      expect(error.mock.calls[0]![0]).toContain("nobody can sign in");
    } finally {
      renameSync(`${file}.away`, file);
      error.mockRestore();
    }
  });

  test("POST /logout clears the cookie", async () => {
    const res = await fetch(`${BASE}/logout`, { method: "POST", redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  test("POST /logout from another site is refused", async () => {
    const res = await fetch(`${BASE}/logout`, {
      method: "POST",
      redirect: "manual",
      headers: { "Sec-Fetch-Site": "cross-site" },
    });
    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  test("GET /logout signs nobody out", async () => {
    const res = await fetch(`${BASE}/logout`, { redirect: "manual" });
    expect(res.status).not.toBe(302);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  test("editor fetches get a 401 when signed out", async () => {
    const res = await fetch(`${BASE}/edit/pages/`, { redirect: "manual" });
    expect(res.status).toBe(401);
  });

  test("a mangled cookie counts as signed out, not a server error", async () => {
    const res = await fetch(`${BASE}/edit/pages/`, { headers: { Cookie: "duckie_token=a.b.c!" } });
    expect(res.status).toBe(401);
  });

  test("a signed-out page load is sent to the login form", async () => {
    const res = await fetch(`${BASE}/edit/pages/`, {
      redirect: "manual",
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/login?next=%2Fedit%2Fpages%2F");
  });

  test("the login page's stylesheet is served", async () => {
    const html = await (await fetch(`${BASE}/login`)).text();
    expect(html).toContain('href="/edit/styles.css"');
    const res = await fetch(`${BASE}/edit/styles.css`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/css");
    expect(await res.text()).toContain("--accent");
  });

  test("the editor itself is served", async () => {
    const res = await fetch(`${BASE}/edit`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });
});

// --- Editor API (authenticated) ---

describe("editor API", () => {
  describe("GET /edit/pages/*", () => {
    test("lists root folder", async () => {
      const res = await fetch(`${BASE}/edit/pages/`, authed());
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.files.some((f: any) => f.name === "index.md")).toBe(true);
      expect(data.folders.some((f: any) => f.name === "guide")).toBe(true);
    });

    test("returns file content", async () => {
      const res = await fetch(`${BASE}/edit/pages/index.md`, authed());
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("duckdown");
    });

    test("lists a missing folder as empty", async () => {
      const res = await fetch(`${BASE}/edit/pages/nonexistent/`, authed());
      expect(await res.json()).toEqual({ files: [], folders: [] });
    });

    test("a missing page is a 404, not a folder listing", async () => {
      const res = await fetch(`${BASE}/edit/pages/nope.md`, authed());
      expect(res.status).toBe(404);
    });
  });

  describe("PUT /edit/pages/*", () => {
    test("creates and saves a file", async () => {
      const content = "title: Test\n\n# Hello from test";
      const res = await fetch(`${BASE}/edit/pages/test-file.md`, authed({ method: "PUT", body: content }));
      expect(res.status).toBe(200);
      expect((await res.json()).ok).toBe(true);
      expect(await (await fetch(`${BASE}/edit/pages/test-file.md`, authed())).text()).toBe(content);
    });

    test("creates nested directories", async () => {
      await fetch(`${BASE}/edit/pages/sub/nested/deep.md`, authed({ method: "PUT", body: "# Deep file" }));
      expect(await (await fetch(`${BASE}/edit/pages/sub/nested/deep.md`, authed())).text()).toBe("# Deep file");
    });

    test("If-None-Match: * never replaces an existing file", async () => {
      const res = await fetch(`${BASE}/edit/pages/index.md`, authed({
        method: "PUT",
        headers: { "If-None-Match": "*" },
        body: "title: clobbered\n\n",
      }));
      expect(res.status).toBe(412);
      expect(await (await fetch(`${BASE}/edit/pages/index.md`, authed())).text()).toContain("Welcome to duckdown");
    });

    test("If-None-Match: * creates a file that isn't there", async () => {
      const res = await fetch(`${BASE}/edit/pages/brand-new.md`, authed({
        method: "PUT",
        headers: { "If-None-Match": "*" },
        body: "title: brand-new\n\n",
      }));
      expect(res.status).toBe(200);
      expect(await (await fetch(`${BASE}/edit/pages/brand-new.md`, authed())).text()).toBe("title: brand-new\n\n");
    });

    test("names are decoded: 'About us' is stored as 'About us.md'", async () => {
      await fetch(`${BASE}/edit/pages/About%20us.md`, authed({ method: "PUT", body: "title: About us\n\n# About" }));
      expect(existsSync(join(SITE, "pages", "About us.md"))).toBe(true);
      expect(await (await fetch(`${BASE}/edit/pages/About%20us.md`, authed())).text()).toContain("# About");
      expect((await fetch(`${BASE}/About%20us.html`)).status).toBe(200);
    });
  });

  describe("DELETE /edit/pages/*", () => {
    test("deletes an existing file", async () => {
      await fetch(`${BASE}/edit/pages/to-delete.md`, authed({ method: "PUT", body: "delete me" }));
      const res = await fetch(`${BASE}/edit/pages/to-delete.md`, authed({ method: "DELETE" }));
      expect(res.status).toBe(200);
      expect(existsSync(join(SITE, "pages", "to-delete.md"))).toBe(false);
    });

    test("returns 404 for missing file", async () => {
      const res = await fetch(`${BASE}/edit/pages/does-not-exist.md`, authed({ method: "DELETE" }));
      expect(res.status).toBe(404);
    });
  });
});

describe("markdown preview", () => {
  test("renders markdown to HTML", async () => {
    const res = await fetch(`${BASE}/edit/mark/`, authed({ method: "PUT", body: "# Hello\n\nWorld" }));
    const data = await res.json();
    expect(data.content).toContain('<h1 id="hello">');
    expect(data.content).toContain("<p>World</p>");
  });

  test("renders where the page lives: its wiki links, and its whole theme cascade", async () => {
    const guideTheme = join(SITE, "pages", "guide", "-theme.css");
    writeFileSync(guideTheme, "/* guide theme */");
    try {
      const res = await fetch(`${BASE}/edit/mark/?path=guide%2Fnew.md`, authed({ method: "PUT", body: "See [[themes]]." }));
      const data = await res.json();
      expect(data.content).toContain('<a class="wikilink" href="/guide/themes.html">themes</a>');
      expect(data.theme).toStartWith("/* The duckdown theme");
      expect(data.theme).toEndWith("\n/* guide theme */");
    } finally {
      rmSync(guideTheme);
    }
  });

  test("parses front-matter", async () => {
    const res = await fetch(`${BASE}/edit/mark/`, authed({ method: "PUT", body: "title: My Page\ntheme: dark\n\n# Content" }));
    const data = await res.json();
    expect(data.meta.title).toEqual(["My Page"]);
    expect(data.meta.theme).toEqual(["dark"]);
    expect(data.content).not.toContain("title:");
  });

  test("handles GFM tables", async () => {
    const res = await fetch(`${BASE}/edit/mark/`, authed({ method: "PUT", body: "| a | b |\n|---|---|\n| 1 | 2 |" }));
    expect((await res.json()).content).toContain("<table>");
  });
});

describe("image browser", () => {
  test("lists images folder", async () => {
    const data = await (await fetch(`${BASE}/edit/browse/`, authed())).json();
    expect(data.files.some((f: any) => f.name === "logo.svg")).toBe(true);
  });

  test("returns image path", async () => {
    const data = await (await fetch(`${BASE}/edit/browse/`, authed({ method: "PUT" }))).json();
    expect(data.img_path).toBe("/static/images/");
  });

  test("creates an image folder", async () => {
    const data = await (await fetch(`${BASE}/edit/browse/shots`, authed({ method: "PUT" }))).json();
    expect(data).toEqual({ files: [], folders: [] });
    expect(existsSync(join(SITE, "static", "images", "shots", ".gitkeep"))).toBe(true);
  });

  test("uploads into a folder", async () => {
    const form = new FormData();
    form.set("file", new Blob(["<svg/>"], { type: "image/svg+xml" }), "dot.svg");
    form.set("note", "not a file");
    const data = await (await fetch(`${BASE}/edit/browse/shots`, authed({ method: "POST", body: form }))).json();
    expect(data.result).toEqual(["static/images/shots/dot.svg"]);
  });
});

describe("image thumbnails", () => {
  test("serves an svg thumb as-is (Bun.Image doesn't decode vector formats)", async () => {
    const res = await fetch(`${BASE}/edit/browse/logo.svg?thumb=32`, authed());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("svg");
  });

  test("resizes a raster image to webp via Bun.Image", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const form = new FormData();
    form.set("file", new Blob([png], { type: "image/png" }), "thumb-test.png");
    await fetch(`${BASE}/edit/browse/`, authed({ method: "POST", body: form }));

    const res = await fetch(`${BASE}/edit/browse/thumb-test.png?thumb=32`, authed());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
  });

  test("without a thumb param, serves the original file", async () => {
    const res = await fetch(`${BASE}/edit/browse/logo.svg`, authed());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("svg");
  });
});

// --- Public routes (no auth needed) ---

describe("health", () => {
  test("answers without reading storage, for a platform's healthcheck", async () => {
    const res = await fetch(`${BASE}/health`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("OK");
  });
});

describe("static files", () => {
  test("serves CSS", async () => {
    const res = await fetch(`${BASE}/static/site.css`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/css");
  });

  test("serves images", async () => {
    const res = await fetch(`${BASE}/static/images/logo.svg`);
    expect(res.headers.get("content-type")).toContain("svg");
  });

  test("returns 404 for missing file", async () => {
    expect((await fetch(`${BASE}/static/nope.txt`)).status).toBe(404);
  });
});

describe("site rendering", () => {
  test("renders index page with its nav and theme", async () => {
    const res = await fetch(`${BASE}/index.html`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<title>duckdown</title>");
    expect(html).toContain('<a href="/index.html" aria-current="page">Home</a>');
    expect(html).toContain('<a href="/guide/index.html">Guide</a>');
    expect(html).toContain("<style>/* The duckdown theme");
    expect(html).toContain("/* Wobbling duck */");
  });

  test("marks the section in the nav, and cascades themes down folders", async () => {
    const guideTheme = join(SITE, "pages", "guide", "-theme.css");
    writeFileSync(guideTheme, "/* guide theme */");
    try {
      const guide = await (await fetch(`${BASE}/guide/index.html`)).text();
      expect(guide).toContain('<a href="/guide/index.html" aria-current="page">Guide</a>');
      const page = await (await fetch(`${BASE}/guide/pages.html`)).text();
      expect(page).toContain('<a href="/guide/index.html" aria-current="true">Guide</a>');
      expect(page).toContain('<a href="/index.html">Home</a>');
      expect(page).toMatch(/<style>\/\* The duckdown theme[\s\S]*\/\* guide theme \*\/<\/style>/);
    } finally {
      rmSync(guideTheme);
    }
  });

  test("publishes contents lists, callouts and wiki links (the Writing Pages guide uses them all)", async () => {
    const html = await (await fetch(`${BASE}/guide/pages.html`)).text();
    expect(html).toContain('<nav class="toc" aria-label="Contents">');
    expect(html).toContain('<blockquote class="callout caution"><p class="callout-title">Caution</p>');
    expect(html).toContain('<a class="wikilink" href="/guide/themes.html">the Themes guide</a>');
  });

  test("/ is the index page", async () => {
    expect(await (await fetch(`${BASE}/`)).text()).toContain("<title>duckdown</title>");
  });

  test("publishes $ sequences as written", async () => {
    await fetch(`${BASE}/edit/pages/money.md`, authed({
      method: "PUT",
      body: "title: $$ and $& and $'\n\nCosts $$5. In a regex, `$&` is the match.",
    }));
    const html = await (await fetch(`${BASE}/money.html`)).text();
    expect(html).toContain("<title>$$ and $&amp; and $'</title>"); // escaped for HTML, not mangled
    expect(html).toContain("Costs $$5.");
    expect(html).toContain("<code>$&amp;</code>");
  });

  test("leaves folders starting with - out of the nav", async () => {
    await fetch(`${BASE}/edit/pages/-drafts/index.md`, authed({ method: "PUT", body: "title: Drafts\n\n" }));
    expect(await (await fetch(`${BASE}/index.html`)).text()).not.toContain("Drafts");
  });

  test("keeps the nav until the editor changes a page", async () => {
    await fetch(`${BASE}/index.html`); // built, and kept
    mkdirSync(join(SITE, "pages", "offstage"), { recursive: true });
    writeFileSync(join(SITE, "pages", "offstage", "index.md"), "title: Offstage\n\n"); // behind the server's back
    expect(await (await fetch(`${BASE}/index.html`)).text()).not.toContain("Offstage");

    await fetch(`${BASE}/edit/pages/onstage/index.md`, authed({ method: "PUT", body: "title: Onstage\n\n" }));
    const after = await (await fetch(`${BASE}/index.html`)).text();
    expect(after).toContain(">Onstage<");
    expect(after).toContain(">Offstage<"); // rebuilt from what's there

    await fetch(`${BASE}/edit/pages/onstage/index.md`, authed({ method: "DELETE" }));
    expect(await (await fetch(`${BASE}/index.html`)).text()).not.toContain("Onstage");
  });

  test("falls back to a bare template when templates/site.html is missing", async () => {
    const tmpl = join(SITE, "templates", "site.html");
    renameSync(tmpl, `${tmpl}.away`);
    try {
      const html = await (await fetch(`${BASE}/index.html`)).text();
      expect(html).toStartWith("<!DOCTYPE html><html><head><title>duckdown</title>");
    } finally {
      renameSync(`${tmpl}.away`, tmpl);
    }
  });

  test("returns 404 for missing page", async () => {
    expect((await fetch(`${BASE}/no-such-page.html`)).status).toBe(404);
  });
});

describe("folders, the edit link, layouts, drafts and listings", () => {
  const put = (path: string, body: string) => fetch(`${BASE}/edit/pages/${path}`, authed({ method: "PUT", body }));

  test("a folder is served at /guide, /guide/ and /guide/index.html alike", async () => {
    for (const url of ["/guide", "/guide/", "/guide/index.html"]) {
      const res = await fetch(`${BASE}${url}`);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("<title>Getting Started</title>");
    }
    expect((await fetch(`${BASE}/no-such-folder/`)).status).toBe(404);
  });

  test("signed in, a page offers to edit itself", async () => {
    expect(await (await fetch(`${BASE}/guide/pages.html`)).text()).not.toContain("user-edit");
    const html = await (await fetch(`${BASE}/guide/pages.html`, authed())).text();
    expect(html).toContain('<a class="user-edit" href="/edit?path=guide%2Fpages.md">Edit this page</a>');
  });

  test("layout: picks a template; anything else falls back to site.html", async () => {
    const post = join(SITE, "templates", "post.html");
    writeFileSync(post, '<!DOCTYPE html><html><head><title>{{title}}</title></head><body class="post">{{content}}</body></html>');
    try {
      await put("laid-out.md", "title: Laid out\nlayout: post\n\n# Laid out");
      expect(await (await fetch(`${BASE}/laid-out.html`)).text()).toContain('<body class="post">');

      await put("laid-out.md", "title: Laid out\nlayout: ../../etc/passwd\n\n# Laid out"); // not a plain name
      expect(await (await fetch(`${BASE}/laid-out.html`)).text()).toContain('<ul class="nav">');

      await put("laid-out.md", "title: Laid out\nlayout: missing\n\n# Laid out"); // no such template
      expect(await (await fetch(`${BASE}/laid-out.html`)).text()).toContain('<ul class="nav">');
    } finally {
      rmSync(post);
    }
  });

  test("description fills the meta tags, escaped; a title is escaped too", async () => {
    await put("described.md", 'title: Tea & "biscuits"\ndescription: Tea & "biscuits", from 4pm\n\n# Described');
    const html = await (await fetch(`${BASE}/described.html`)).text();
    expect(html).toContain("<title>Tea &amp; &quot;biscuits&quot;</title>");
    expect(html).toContain('<meta name="description" content="Tea &amp; &quot;biscuits&quot;, from 4pm">');
    expect(html).toContain('<meta property="og:description" content="Tea &amp; &quot;biscuits&quot;, from 4pm">');
    expect(await (await fetch(`${BASE}/index.html`)).text()).not.toContain('<meta name="description"');
  });

  test("a draft is for whoever is signed in, and stays out of the nav", async () => {
    await put("secret/index.md", "title: Secret\nnav: Secret\ndraft: true\n\n# Secret");
    expect((await fetch(`${BASE}/secret/index.html`)).status).toBe(404);
    const signedIn = await fetch(`${BASE}/secret/`, authed());
    expect(signedIn.status).toBe(200);
    expect(await signedIn.text()).toContain("<h1 id=\"secret\">");
    expect(await (await fetch(`${BASE}/index.html`)).text()).not.toContain(">Secret<");
  });

  test("{{pages}} lists the folder: newest first, no drafts, no index", async () => {
    await put("news/index.md", "title: News\nnav: News\n\n# News\n\n{{pages}}");
    await put("news/old.md", "title: Older post\ndate: 2026-01-02\ndescription: From January.\n\nOld");
    await put("news/new.md", "title: Newer post\ndate: 2026-09-19\n\nNew");
    await put("news/undated.md", "title: Undated\n\nNo date");
    await put("news/hidden.md", "title: Hidden\ndate: 2026-09-20\ndraft: true\n\nHidden");

    const list = (await (await fetch(`${BASE}/news/`)).text()).match(/<ul class="pages">[\s\S]*?<\/ul>/)![0];
    expect(list.match(/<a href="[^"]*">[^<]*<\/a>/g)).toEqual([
      '<a href="/news/new.html">Newer post</a>',
      '<a href="/news/old.html">Older post</a>',
      '<a href="/news/undated.html">Undated</a>',
    ]);
    expect(list).toContain('<time datetime="2026-01-02">2 January 2026</time>');
    expect(list).toContain("<p>From January.</p>");
    expect(list).not.toContain("Hidden");

    // The editor's writes rebuild it
    await put("news/newest.md", "title: Newest post\ndate: 2026-09-20\n\nNewest");
    expect(await (await fetch(`${BASE}/news/`)).text()).toContain('<a href="/news/newest.html">Newest post</a>');
  });

  test("a placeholder used twice is filled twice, and {{url}} is the page's address", async () => {
    // og:title repeats {{title}}. String.replace with a string pattern only
    // does the first, so every page published <meta property="og:title"
    // content="{{title}}"> — the placeholder itself.
    writeFileSync(join(SITE, "templates", "twicer.html"),
      `<html><head><title>{{title}}</title><meta property="og:title" content="{{title}}">` +
      `<link rel="canonical" href="{{url}}"></head><body>{{content}}</body></html>`);
    await put("twice.md", "title: Said Twice\nlayout: twicer\n\n# Hello");

    const html = await (await fetch(`${BASE}/twice.html`)).text();
    expect(html).toContain("<title>Said Twice</title>");
    expect(html).toContain('<meta property="og:title" content="Said Twice">');
    expect(html).toContain(`<link rel="canonical" href="${BASE}/twice.html">`);
    expect(html).not.toContain("{{");
  });

  test("{{pages}} in code stays as written, so a page can document it", async () => {
    await put("docs/index.md", "title: Docs\n\nWrite `{{pages}}`:\n\n```markdown\ntitle: Blog\n\n{{pages}}\n```\n\n{{pages}}");
    await put("docs/one.md", "title: One\n\nOne");

    const html = await (await fetch(`${BASE}/docs/`)).text();
    expect(html).toContain("<code>{{pages}}</code>");                  // the span
    expect(html).toMatch(/<pre><code[^>]*>[\s\S]*\{\{pages\}\}[\s\S]*<\/code><\/pre>/); // the fence
    expect(html.match(/<ul class="pages">/g)).toHaveLength(1);         // expanded once, outside both
  });
});

describe("editing the site's other folders", () => {
  test("templates and static are listed, read, written and deleted", async () => {
    for (const [section, name, body] of [
      ["templates", "post.html", "<html><body>{{content}}</body></html>"],
      ["static", "print.css", "body { color: black }"],
    ] as const) {
      const at = `${BASE}/edit/${section}/${name}`;
      expect((await fetch(at, authed({ method: "PUT", body }))).status).toBe(200);
      expect(await (await fetch(at, authed())).text()).toBe(body);

      const listing = await (await fetch(`${BASE}/edit/${section}/`, authed())).json();
      expect(listing.files.some((f: any) => f.name === name)).toBe(true);

      expect((await fetch(at, authed({ method: "PUT", headers: { "If-None-Match": "*" }, body }))).status).toBe(412);
      expect((await fetch(at, authed({ method: "DELETE" }))).status).toBe(200);
      expect((await fetch(at, authed({ method: "DELETE" }))).status).toBe(404);
      expect((await fetch(at, authed())).status).toBe(404);
    }
  });

  test("they need signing in, like pages do", async () => {
    expect((await fetch(`${BASE}/edit/templates/`)).status).toBe(401);
    expect((await fetch(`${BASE}/edit/static/`)).status).toBe(401);
  });

  test("users.json is in none of them, so the hashes stay out of the editor", async () => {
    for (const path of ["/edit/pages/users.json", "/edit/templates/users.json", "/edit/static/users.json"]) {
      expect((await fetch(`${BASE}${path}`, authed())).status).toBe(404);
    }
  });
});

describe("a page's own stylesheet", () => {
  const put = (path: string, body: string) => fetch(`${BASE}/edit/pages/${path}`, authed({ method: "PUT", body }));

  test("css: links that sheet from static, after the theme", async () => {
    await put("styled.md", "title: Styled\ncss: print\n\n# Styled");
    const html = await (await fetch(`${BASE}/styled.html`)).text();
    expect(html).toContain('<link rel="stylesheet" href="/static/print.css">');
  });

  test("a name that could climb out of static is ignored", async () => {
    await put("sneaky.md", "title: Sneaky\ncss: ../../etc/passwd\n\n# Sneaky");
    const html = await (await fetch(`${BASE}/sneaky.html`)).text();
    expect(html).not.toContain("passwd");
    expect(html).not.toContain('<link rel="stylesheet" href="/static/');
  });
});

describe("path traversal", () => {
  test("blocks traversal in pages, even encoded", async () => {
    const error = hush("error");
    try {
      const res = await fetch(`${BASE}/edit/pages/..%2F..%2F..%2Fetc%2Fpasswd`, authed());
      expect(res.status).toBe(500);
      expect(await res.text()).toBe("Server error");
      expect(String(error.mock.calls[0]![0])).toContain("Path traversal denied");
    } finally {
      error.mockRestore();
    }
  });

  test("blocks a sibling folder that merely shares the prefix", async () => {
    mkdirSync(join(SITE, "pages-old"), { recursive: true });
    writeFileSync(join(SITE, "pages-old", "secret.md"), "secret");
    const error = hush("error");
    try {
      const res = await fetch(`${BASE}/edit/pages/..%2Fpages-old%2Fsecret.md`, authed());
      expect(res.status).toBe(500);
      expect(await res.text()).not.toContain("secret");
    } finally {
      error.mockRestore();
    }
  });

  test("blocks traversal in static", async () => {
    expect([404, 500]).toContain((await fetch(`${BASE}/static/../../../etc/passwd`)).status);
  });
});
