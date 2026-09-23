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
  // The preview is the page as the site renders it — same template, same nav,
  // same theme cascade — so what it answers is a whole document.
  const mark = (source: string, path = "", draft?: { name: string; body: string }) =>
    fetch(`${BASE}/edit/mark/?path=${encodeURIComponent(path)}`,
      authed({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source, draft }) }));

  test("renders the whole document, through the page's own template", async () => {
    const data = await (await mark("# Hello\n\nWorld")).json();
    expect(data.html).toContain('<h1 id="hello">');
    expect(data.html).toContain("<p>World</p>");
    expect(data.html).toContain('<link href="/static/site.css" rel="stylesheet">'); // the template's
    expect(data.html).toContain('<ul class="nav">');                                // and its nav
    expect(data.html).not.toContain("Edit this page");                              // a reader's view
    expect(data.layout).toBe("site.html");
  });

  test("renders where the page lives: its wiki links, and the template's stylesheets", async () => {
    const data = await (await mark("See [[themes]].", "guide/new.md")).json();
    expect(data.html).toContain('<a class="wikilink" href="/guide/themes.html">themes</a>');
    expect(data.html).toContain('<link href="/static/site.css" rel="stylesheet">');
    expect(data.html).toContain(`<link href="/static/theme.css" rel="stylesheet">`);
  });

  test("parses front-matter, and the template it names picks the layout", async () => {
    const data = await (await mark("title: My Page\nlayout: post\n\n# Content", "blog/new.md")).json();
    expect(data.meta.title).toEqual(["My Page"]);
    expect(data.html).toContain("<title>My Page</title>");
    expect(data.html).not.toContain("title:");
    expect(data.layout).toBe("post.html");
  });

  test("an unsaved template is used in place of the saved one it stands for", async () => {
    const draft = { name: "site.html", body: "<html><body><h9>draft</h9>{{content}}</body></html>" };
    const data = await (await mark("# Hi", "index.md", draft)).json();
    expect(data.html).toContain("<h9>draft</h9>");
    expect(data.html).toContain('<h1 id="hi">');

    // One this page doesn't wear changes nothing, and `layout` says which it did.
    const other = await (await mark("# Hi", "index.md", { name: "post.html", body: "<p>nope</p>" })).json();
    expect(other.html).not.toContain("nope");
    expect(other.layout).toBe("site.html");
  });

  test("handles GFM tables", async () => {
    const data = await (await mark("| a | b |\n|---|---|\n| 1 | 2 |")).json();
    expect(data.html).toContain("<table>");
  });
});

describe("search", () => {
  test("the whole index, at /search.json, for the browser to match against", async () => {
    const res = await fetch(`${BASE}/search.json`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("max-age");

    const entries = await res.json();
    const home = entries.find((e: any) => e.url === "/");
    expect(home.title).toBe("duckdown");
    // The page's words are in its sections, each at its own #id.
    const intro = entries.find((e: any) => e.url.startsWith("/#") && e.text.includes("Write markdown"));
    expect(intro.title).toBe("duckdown");
    expect(intro.text).not.toContain("["); // the words, not the marks

    // No result may lead anywhere a reader can't go: nothing guards this file,
    // and a search result that 404s is worse than no result.
    for (const entry of entries) {
      expect((await fetch(`${BASE}${entry.url}`)).status).toBe(200);
    }
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

// The one thing the collection pane can't do through the folders the editor
// already has: put a picture where a collection says its pictures live, and
// write the thumbnail beside it. The folders here start with a dot, so the
// site's own walks — nav, search, export — never see the test's collections.
describe("a collection's pictures", () => {
  const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );

  // Written through the pages route, which is what drops the collection cache.
  const collectionAt = async (folder: string, body: unknown) => {
    const res = await fetch(`${BASE}/edit/pages/${folder}/collection.json`,
      authed({ method: "PUT", body: JSON.stringify(body) }));
    expect(res.status).toBe(200);
  };

  const send = (folder: string, file: Blob, as: string, name?: string) => {
    const form = new FormData();
    form.set("file", file, as);
    if (name !== undefined) form.set("name", name);
    return fetch(`${BASE}/edit/collection/${folder}`, authed({ method: "POST", body: form }));
  };

  const picture = (...parts: string[]) => join(SITE, "static", "images", ...parts);

  test("tells the pane where the pictures are and what is wrong with the file", async () => {
    const res = await fetch(`${BASE}/edit/collection/gallery`, authed());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.images.src).toBe("/static/images/gallery/");
    expect(data.images.thumb).toBe("/static/images/gallery/"); // said once, meant for both
    expect(data.uploads).toBe(true);
    expect(data.problems).toEqual([]);
    // The fields as the site reads them, so the pane shows what the site renders.
    expect(data.fields.map((f: { name: string }) => f.name)).toEqual(["src", "title", "caption", "year"]);
    expect(data.fields[0]).toEqual({ name: "src", kind: "image", label: "Picture" });
  });

  test("a folder with no collection.json says so, trailing slash or not", async () => {
    expect((await fetch(`${BASE}/edit/collection/blog`, authed())).status).toBe(404);
    const res = await fetch(`${BASE}/edit/collection/blog/`, authed({ method: "POST", body: new FormData() }));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("There is no blog/collection.json");
  });

  test("signed out, it answers neither", async () => {
    expect((await fetch(`${BASE}/edit/collection/gallery`)).status).toBe(401);
    expect((await fetch(`${BASE}/edit/collection/gallery`, { method: "POST", body: new FormData() })).status).toBe(401);
  });

  test("writes the original and a 128px thumbnail beside it, and answers with both", async () => {
    await collectionAt(".pics", { images: "/static/images/.pics/", groups: [] });
    const res = await send(".pics", new Blob([PNG], { type: "image/png" }), "A Work.png");
    expect(res.status).toBe(200);
    const up = await res.json();
    expect(up.name).toBe("A Work.png");
    expect(up.src).toBe("/static/images/.pics/A%20Work.png");
    expect(up.thumb).toBe("/static/images/.pics/A%20Work_tn.png");
    expect(up.v).toMatch(/^[a-z0-9]+$/);           // what ?v= is set to
    expect(existsSync(picture(".pics", "A Work.png"))).toBe(true);
    expect(readFileSync(picture(".pics", "A Work_tn.png")).subarray(1, 4).toString()).toBe("PNG");
  });

  test("a picture swapped in place is written under the name it is given", async () => {
    const res = await send(".pics", new Blob([PNG], { type: "image/png" }), "whatever.png", "A Work.png");
    expect((await res.json()).name).toBe("A Work.png");
    expect(existsSync(picture(".pics", "whatever.png"))).toBe(false);
  });

  test("the thumbnail is in the format its own name asks for", async () => {
    await collectionAt(".webp", { images: { src: "/static/images/.webp/", extension: ".webp" }, groups: [] });
    expect((await send(".webp", new Blob([PNG]), "w.png")).status).toBe(200);
    expect(readFileSync(picture(".webp", "w_tn.webp")).subarray(8, 12).toString()).toBe("WEBP");

    await collectionAt(".jpg", { images: { src: "/static/images/.jpg/", extension: ".jpeg" }, groups: [] });
    expect((await send(".jpg", new Blob([PNG]), "j.png")).status).toBe(200);
    expect(readFileSync(picture(".jpg", "j_tn.jpeg")).subarray(0, 2).toString("hex")).toBe("ffd8");
  });

  test("an svg is its own thumbnail: Bun.Image decodes raster formats only", async () => {
    await collectionAt(".svg", { images: "/static/images/.svg/", groups: [] });
    expect((await send(".svg", new Blob(["<svg/>"], { type: "image/svg+xml" }), "v.svg")).status).toBe(200);
    expect(readFileSync(picture(".svg", "v_tn.svg"), "utf8")).toBe("<svg/>");
  });

  test("a file that isn't a picture is said, not thrown", async () => {
    const res = await send(".pics", new Blob(["not an image"]), "notes.png");
    expect(res.status).toBe(422);
    expect(await res.text()).toContain("Couldn't read notes.png as a picture");
  });

  test("nothing sent, and a name that is all path, are both refused", async () => {
    expect((await fetch(`${BASE}/edit/collection/.pics`, authed({ method: "POST", body: new FormData() }))).status).toBe(400);
    const res = await send(".pics", new Blob([PNG]), "a.png", "/");
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("That picture has no name");
  });

  test("a collection whose pictures live elsewhere can't be uploaded to, and says where they are", async () => {
    await collectionAt(".away", { images: "https://pictures.example.com/works/", groups: [] });
    const info = await (await fetch(`${BASE}/edit/collection/.away`, authed())).json();
    expect(info.uploads).toBe(false);
    expect(info.fields).toBeNull();   // it declares none: the pane shows what it always did

    const res = await send(".away", new Blob([PNG]), "a.png");
    expect(res.status).toBe(409);
    expect(await res.text()).toContain("https://pictures.example.com/works/");
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
    expect(html).toContain('<a href="/" aria-current="page">Home</a>');
    expect(html).toContain('<a href="/guide/">Guide</a>');
    // The site's look is an ordinary stylesheet the template links, so it is
    // cached once rather than inlined into every page.
    expect(html).toContain(`<link href="/static/theme.css" rel="stylesheet">`);
    expect(html).not.toContain("<style>");
  });

  test("marks the page in the nav, and the section it is in", async () => {
    const guide = await (await fetch(`${BASE}/guide/index.html`)).text();
    expect(guide).toContain('<a href="/guide/" aria-current="page">Guide</a>');
    const page = await (await fetch(`${BASE}/guide/pages.html`)).text();
    expect(page).toContain('<a href="/guide/" aria-current="true">Guide</a>');
    expect(page).toContain('<a href="/">Home</a>');
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
    // Its own name: the seed ships templates/post.html now, and this test
    // removes what it makes.
    const trial = join(SITE, "templates", "trial.html");
    writeFileSync(trial, '<!DOCTYPE html><html><head><title>{{title}}</title></head><body class="trial">{{content}}</body></html>');
    try {
      await put("laid-out.md", "title: Laid out\nlayout: trial\n\n# Laid out");
      expect(await (await fetch(`${BASE}/laid-out.html`)).text()).toContain('<body class="trial">');

      await put("laid-out.md", "title: Laid out\nlayout: ../../etc/passwd\n\n# Laid out"); // not a plain name
      expect(await (await fetch(`${BASE}/laid-out.html`)).text()).toContain('<ul class="nav">');

      await put("laid-out.md", "title: Laid out\nlayout: missing\n\n# Laid out"); // no such template
      expect(await (await fetch(`${BASE}/laid-out.html`)).text()).toContain('<ul class="nav">');
    } finally {
      rmSync(trial);
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
    // Names the seed doesn't use: this test deletes what it writes, and the
    // scratch site is shared, so taking templates/post.html would remove the
    // layout another test depends on.
    for (const [section, name, body] of [
      ["templates", "scratch-layout.html", "<html><body>{{content}}</body></html>"],
      ["static", "scratch.css", "body { color: black }"],
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

describe("one page, one canonical address", () => {
  const put = (path: string, body: string) => fetch(`${BASE}/edit/pages/${path}`, authed({ method: "PUT", body }));
  const canonical = async (url: string) =>
    (await (await fetch(url)).text()).match(/<link rel="canonical" href="([^"]+)"/)?.[1];

  test("the three addresses of a folder index all name the same one", async () => {
    await put("shop/index.md", "title: Shop\n\n# Shop");
    const one = `${BASE}/shop/`;
    for (const url of [`${BASE}/shop`, `${BASE}/shop/`, `${BASE}/shop/index.html`]) {
      expect(await canonical(url)).toBe(one);
    }
  });

  test("a page is named by its .html, and the site root by /", async () => {
    expect(await canonical(`${BASE}/guide/pages.html`)).toBe(`${BASE}/guide/pages.html`);
    expect(await canonical(`${BASE}/`)).toBe(`${BASE}/`);
    expect(await canonical(`${BASE}/index.html`)).toBe(`${BASE}/`);
  });

  test("and the nav links to those addresses, not to index.html", async () => {
    const nav = (await (await fetch(`${BASE}/`)).text()).match(/<nav><ul class="nav">[\s\S]*?<\/ul><\/nav>/)![0];
    expect(nav).toContain('href="/guide/"');
    expect(nav).not.toContain("index.html");
  });
});

describe("layout: a page's own template", () => {
  test("the seed's post uses post.html: no nav, a way back, and its date", async () => {
    const html = await (await fetch(`${BASE}/blog/a-post-with-its-own-layout.html`)).text();
    expect(html).toContain('<a href="/blog/">← all posts</a>');
    expect(html).toContain('<time datetime="2026-09-21">21 September 2026</time>');
    expect(html).not.toContain('<ul class="nav">'); // a post is arrived at, not browsed from
  });

  test("the seed's poster page links its own stylesheet, and no other page does", async () => {
    const poster = await (await fetch(`${BASE}/blog/one-page-that-looks-different.html`)).text();
    expect(poster).toContain('<link rel="stylesheet" href="/static/poster.css">');
    const other = await (await fetch(`${BASE}/blog/`)).text();
    expect(other).not.toContain("poster.css");
  });

  test("other pages still get site.html, which has the nav", async () => {
    const html = await (await fetch(`${BASE}/blog/`)).text();
    expect(html).toContain('<ul class="nav">');
    expect(html).not.toContain("all posts");
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

describe("a URL that won't decode", () => {
  test("is a 400 on the site and on /static/, not a 500 with a stack in the log", async () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      for (const path of ["/%E0%A4%A", "/static/%E0%A4%A", "/blog/%E0%A4%A"]) {
        const res = await fetch(`${BASE}${path}`);
        expect(res.status).toBe(400);
        expect(await res.text()).toBe("Bad Request");
      }
      expect(error).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });
});

describe("the site's own 404 page", () => {
  const file = join(SITE, "pages", "404.md");

  test("is what a miss answers, with a 404 status, and so is a draft to a stranger", async () => {
    for (const path of ["/no-such-page.html", "/secret/index.html"]) {
      const res = await fetch(`${BASE}${path}`);
      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toContain("text/html");
      expect(await res.text()).toContain("There is nothing at that address");
    }
  });

  test("is a plain line when the site has none", async () => {
    const saved = readFileSync(file, "utf8");
    rmSync(file);
    try {
      const res = await fetch(`${BASE}/no-such-page.html`);
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("Not Found");
    } finally {
      writeFileSync(file, saved);
    }
  });

  test("is not a page to search for, list or map", async () => {
    const found = await (await fetch(`${BASE}/search.json`)).json();
    expect(found.some((e: any) => e.url === "/404.html")).toBe(false);
    expect(await (await fetch(`${BASE}/sitemap.xml`)).text()).not.toContain("404");
    expect(await (await fetch(`${BASE}/`)).text()).not.toContain("404.html");
  });
});

describe("files a crawler asks for at the root", () => {
  test("robots.txt and favicon.ico are answered from static/", async () => {
    const robots = await fetch(`${BASE}/robots.txt`);
    expect(robots.status).toBe(200);
    expect(robots.headers.get("content-type")).toContain("text/plain");
    expect(await robots.text()).toContain("Allow: /");
    expect((await fetch(`${BASE}/favicon.ico`)).status).toBe(200);
  });

  test("a site with none gets the 404 page, not an error", async () => {
    const file = join(SITE, "static", "robots.txt");
    const saved = readFileSync(file);
    rmSync(file);
    try {
      expect((await fetch(`${BASE}/robots.txt`)).status).toBe(404);
    } finally {
      writeFileSync(file, saved);
    }
  });
});

describe("sitemap.xml", () => {
  test("every page a reader can reach, at absolute addresses, with the date when there is one", async () => {
    const res = await fetch(`${BASE}/sitemap.xml`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("xml");
    const xml = await res.text();
    expect(xml).toContain(`<loc>${BASE}/</loc>`);
    expect(xml).toContain(`<loc>${BASE}/blog/a-post-with-its-own-layout.html</loc><lastmod>2026-09-21</lastmod>`);
    expect(xml).not.toContain("secret"); // a draft
  });
});

describe("validators", () => {
  test("a static file carries an ETag, and a browser that has it is told 304", async () => {
    const first = await fetch(`${BASE}/static/site.css`);
    const tag = first.headers.get("etag")!;
    expect(tag).toBeTruthy();
    expect(first.headers.get("cache-control")).toBe("public, max-age=300");
    const again = await fetch(`${BASE}/static/site.css`, { headers: { "If-None-Match": tag } });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
  });

  test("a page is kept for a stranger and never for whoever is signed in", async () => {
    const stranger = await fetch(`${BASE}/`);
    const tag = stranger.headers.get("etag")!;
    expect(tag).toBeTruthy();
    expect((await fetch(`${BASE}/`, { headers: { "If-None-Match": tag } })).status).toBe(304);

    await signIn();
    const editor = await fetch(`${BASE}/`, authed());
    expect(editor.headers.get("cache-control")).toBe("private, no-cache");
    expect(editor.headers.get("etag")).toBeNull();
    expect(await editor.text()).toContain("Edit this page");
  });
});

describe("the base a site needn't keep a copy of", () => {
  for (const [name, type] of [["site.css", "text/css"], ["search.js", "javascript"]] as const) {
    test(`${name} comes from duckdown, unless the site has a file of that name`, async () => {
      // The seed carries no copy: it reads the base the way any site does.
      const res = await fetch(`${BASE}/static/${name}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain(type);
      expect(await res.text()).not.toContain("the site's own");

      const file = join(SITE, "static", name);
      writeFileSync(file, "/* the site's own */");
      try {
        expect(await (await fetch(`${BASE}/static/${name}`)).text()).toBe("/* the site's own */");
      } finally {
        rmSync(file);
      }
    });
  }
});

describe("a template reading the page's own x- keys", () => {
  test("fills them escaped, empty when unset, and never inside the page's own text", async () => {
    writeFileSync(join(SITE, "templates", "album.html"),
      '<body data-cover="{{x-cover}}" data-buy="{{x-buy}}">{{x-Cover}}|{{content}}</body>');
    writeFileSync(join(SITE, "pages", "album.md"),
      'title: An album\nlayout: album\nx-cover: a "quoted" <b>\n\nWrite {{x-cover}} in prose.\n');
    try {
      const html = await (await fetch(`${BASE}/album.html`)).text();
      expect(html).toContain('data-cover="a &quot;quoted&quot; &lt;b&gt;"');
      expect(html).toContain('data-buy=""');
      expect(html).toContain("a &quot;quoted&quot; &lt;b&gt;|");            // the key is not case-sensitive
      expect(html).toContain("Write {{x-cover}} in prose.");                 // page text is never filled
    } finally {
      rmSync(join(SITE, "templates", "album.html"));
      rmSync(join(SITE, "pages", "album.md"));
    }
  });
});

describe("a site folder that goes missing", () => {
  test("is said once in the log, not once per request, and again if it goes a second time", async () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    const gone = `${SITE}-moved`;
    renameSync(SITE, gone);
    try {
      for (const path of ["/a.html", "/b.html"]) expect((await fetch(`${BASE}${path}`)).status).toBe(404);
      expect(error).toHaveBeenCalledTimes(1);
      expect(String(error.mock.calls[0]![0])).toContain(`${SITE} is gone`);
    } finally {
      renameSync(gone, SITE);
      error.mockRestore();
    }
    // Back, and a miss is an ordinary one; gone again, and it is said again.
    const again = spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await fetch(`${BASE}/a.html`)).status).toBe(404);
      expect(again).not.toHaveBeenCalled();
      renameSync(SITE, gone);
      await fetch(`${BASE}/a.html`);
      expect(again).toHaveBeenCalledTimes(1);
    } finally {
      renameSync(gone, SITE);
      again.mockRestore();
    }
  });

  test("is quiet while the folder is there", async () => {
    const { noticeMissingRoot } = await import("../server/routes/site");
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      noticeMissingRoot(() => true);   // present: quiet, and rearms
      expect(error).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });
});

describe("{{sitemap}}", () => {
  test("lists every page nested by folder, and is left as written in code", async () => {
    const html = await (await fetch(`${BASE}/sitemap.html`)).text();
    expect(html).toContain('<ul class="sitemap">');
    expect(html).toContain('<a href="/blog/a-post-with-its-own-layout.html">');
    expect(html).not.toContain("{{sitemap}}\n");

    writeFileSync(join(SITE, "pages", "about-tags.md"), "title: Tags\n\nWrite `{{sitemap}}` in a page.\n");
    try {
      const code = await (await fetch(`${BASE}/about-tags.html`)).text();
      expect(code).toContain("<code>{{sitemap}}</code>");
      expect(code).not.toContain('class="sitemap"');
    } finally {
      rmSync(join(SITE, "pages", "about-tags.md"));
    }
  });

  test("the 404 page links to it, and it is not in the navigation", async () => {
    const lost = await (await fetch(`${BASE}/nope.html`)).text();
    expect(lost).toContain('href="/sitemap.html"');
    expect(await (await fetch(`${BASE}/`)).text()).not.toMatch(/<ul class="nav">[\s\S]*sitemap[\s\S]*<\/ul>/);
  });
});

describe("{{include}}", () => {
  const dir = () => join(SITE, "templates");

  test("pulls in a template file, which can itself use {{nav}} and the rest", async () => {
    writeFileSync(join(dir(), "bar.html"), '<div class="bar">{{nav}}</div>');
    writeFileSync(join(dir(), "shell.html"), "<body>{{include bar}}{{content}}</body>");
    writeFileSync(join(SITE, "pages", "shelled.md"), "title: Shelled\nlayout: shell\n\nhi");
    try {
      const html = await (await fetch(`${BASE}/shelled.html`)).text();
      expect(html).toContain('<div class="bar"><nav><ul class="nav">');
      expect(html).toContain("<p>hi</p>");
    } finally {
      rmSync(join(dir(), "bar.html"));
      rmSync(join(dir(), "shell.html"));
      rmSync(join(SITE, "pages", "shelled.md"));
    }
  });

  test("is not resolved inside what it pulls in: an include is left as written there", async () => {
    writeFileSync(join(dir(), "inner.html"), "<p>{{include never}}</p>");
    writeFileSync(join(dir(), "outer.html"), "<body>{{include inner}}{{content}}</body>");
    writeFileSync(join(SITE, "pages", "nested-include.md"), "title: N\nlayout: outer\n\nx");
    try {
      const html = await (await fetch(`${BASE}/nested-include.html`)).text();
      expect(html).toContain("<p>{{include never}}</p>");
    } finally {
      rmSync(join(dir(), "inner.html"));
      rmSync(join(dir(), "outer.html"));
      rmSync(join(SITE, "pages", "nested-include.md"));
    }
  });

  test("a name that isn't plain is refused, fills as nothing, and is logged", async () => {
    writeFileSync(join(dir(), "sneaky.html"), "<body>[{{include ../secret}}]{{content}}</body>");
    writeFileSync(join(SITE, "pages", "sneaky-page.md"), "title: S\nlayout: sneaky\n\nx");
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      const html = await (await fetch(`${BASE}/sneaky-page.html`)).text();
      expect(html).toContain("[]");
      expect(error).toHaveBeenCalled();
      expect(String(error.mock.calls[0]![0])).toContain("not a plain name");
    } finally {
      rmSync(join(dir(), "sneaky.html"));
      rmSync(join(SITE, "pages", "sneaky-page.md"));
      error.mockRestore();
    }
  });

  test("a missing file fills as nothing, and is logged, without failing the page", async () => {
    writeFileSync(join(dir(), "hopeful.html"), "<body>[{{include gone}}]{{content}}</body>");
    writeFileSync(join(SITE, "pages", "hopeful-page.md"), "title: H\nlayout: hopeful\n\nx");
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await fetch(`${BASE}/hopeful-page.html`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("[]");
      expect(String(error.mock.calls[0]![0])).toContain("templates/gone.html");
    } finally {
      rmSync(join(dir(), "hopeful.html"));
      rmSync(join(SITE, "pages", "hopeful-page.md"));
      error.mockRestore();
    }
  });

  test("an unsaved include is used in place of the saved one, reported so the editor can say which files a page wears", async () => {
    const mark = (source: string, path: string, draft?: { name: string; body: string }) =>
      fetch(`${BASE}/edit/mark/?path=${encodeURIComponent(path)}`,
        authed({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source, draft }) }));
    const data = await (await mark("# Hi", "index.md", { name: "topbar.html", body: "<p>draft topbar</p>" })).json();
    expect(data.html).toContain("<p>draft topbar</p>");
    expect(data.includes).toEqual(["topbar.html"]);
  });
});

// --- Collections ---

describe("a collection's items are pages", () => {
  test("an item is served at its own address, through the template the collection names", async () => {
    const res = await fetch(`${BASE}/gallery/first-light/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<title>First Light</title>");
    expect(html).toContain(`<link rel="canonical" href="${BASE}/gallery/first-light/">`);
    // The same document a page gets: the template, its includes, the nav —
    // with the folder marked current, because the item lives inside it.
    expect(html).toContain('<ul class="nav">');
    expect(html).toContain('<a href="/gallery/" aria-current="true">Gallery</a>');
    // What only an item has: its fields, its neighbours, its sections.
    expect(html).toContain('<img src="/static/images/gallery/one.svg" alt="First Light">');
    expect(html).toContain("<figcaption>First Light, 1961. Ink on paper, 40 x 40 cm.</figcaption>");
    expect(html).toContain('<a class="next" rel="next" href="/gallery/second-wind/">Second Wind</a>');
    expect(html).toContain('<a href="/gallery/first-light/" aria-current="true">Paintings</a>');
    expect(html).toContain('href="/by-year.html#1961"');   // {{item-year}}, as a fragment
    expect(html).not.toMatch(/\{\{[\w-]+\}\}/);
  });

  test("the three addresses of a folder reach it, and prev wraps round the end", async () => {
    for (const path of ["/gallery/one-of-three", "/gallery/one-of-three/", "/gallery/one-of-three/index.html"]) {
      expect((await fetch(`${BASE}${path}`)).status).toBe(200);
    }
    // The last work's next is the first: a collection is a ring.
    const html = await (await fetch(`${BASE}/gallery/one-of-three/`)).text();
    expect(html).toContain('<a class="next" rel="next" href="/gallery/first-light/">First Light</a>');
    // year: skip, so the back link lands at the top of the overview rather
    // than at an anchor called #skip.
    expect(html).toContain('href="/by-year.html#"');
  });

  test("the each: page is what the items are made of, not a page: its address is a miss", async () => {
    for (const path of ["/gallery/item", "/gallery/item.html"]) {
      expect((await fetch(`${BASE}${path}`)).status).toBe(404);
    }
    expect(await (await fetch(`${BASE}/gallery/`)).text()).not.toContain('href="/gallery/item.html"');
  });

  test("the preview of an each: page is its first item's page, from the unsaved source", async () => {
    const mark = (source: string, path: string) =>
      fetch(`${BASE}/edit/mark/?path=${encodeURIComponent(path)}`,
        authed({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source }) }));
    const data = await (await mark("each: gallery\nlayout: item\ntitle: Work: {{item-title}}\n\nMade {{item-year}}.", "gallery/item.md")).json();
    expect(data.html).toContain("<title>Work: First Light</title>");
    expect(data.html).toContain("<p>Made 1961.</p>");
    expect(data.layout).toBe("item.html");
    expect(data.problems).toEqual([]);
    // Nothing to fill it from is said, not shown as an empty page.
    const lonely = await (await mark("each: blog\n\n{{item-title}}", "blog/item.md")).json();
    expect(lonely.problems).toEqual(["there is no collection.json beside blog/item.md"]);
  });

  test("an unknown item is a 404, never the nearest thing to it", async () => {
    // The whole point of looking an item up by folder and slug: a miss is a
    // miss. A fallback here is how a gallery serves the wrong painting with a
    // 200 and nobody notices for years.
    for (const path of ["/gallery/first-lite/", "/elsewhere/first-light/", "/first-light/"]) {
      const res = await fetch(`${BASE}${path}`);
      expect(res.status).toBe(404);
      expect(await res.text()).not.toContain("Ink on paper");
    }
  });

  test("an overview writes itself from the collection, here and in another folder", async () => {
    const gallery = await (await fetch(`${BASE}/gallery/`)).text();
    expect(gallery).toContain('<section class="group" id="paintings">');
    expect(gallery).toContain('<a class="item" href="/gallery/study-in-green/">');
    expect(gallery).toContain('src="/static/images/gallery/one_tn.svg"');

    // /by-year.html is not in the gallery folder: {{items gallery by=year}}.
    const year = await (await fetch(`${BASE}/by-year.html`)).text();
    expect(year).toContain('<section class="group" id="1961">');
    expect(year).toContain("<h2>1961 - Early work</h2>");     // the label from collection.json
    expect(year).not.toContain("One of Three");               // year: skip
  });

  test("signed in, an item's edit link opens the file it is written in", async () => {
    const res = await fetch(`${BASE}/gallery/first-light/`, authed());
    expect(res.headers.get("Cache-Control")).toBe("private, no-cache");
    expect(await res.text()).toContain("/edit?path=gallery%2Fcollection.json");
  });

  test("items are in the search index and the sitemap, because they are pages", async () => {
    const index = await (await fetch(`${BASE}/search.json`)).json();
    const found = index.find((e: { url: string }) => e.url === "/gallery/second-wind/");
    expect(found.title).toBe("Second Wind");
    expect(found.text).toContain("Oil on board");
    expect(await (await fetch(`${BASE}/sitemap.xml`)).text()).toContain("/gallery/second-wind/");
  });

  test("writing a collection through the editor is a write under pages/, so every cache drops", async () => {
    const url = `${BASE}/edit/pages/gallery/collection.json`;
    const before = await (await fetch(url, authed())).text();
    const changed = JSON.parse(before);
    changed.groups[1]!.items.push({ src: "four.svg", title: "Late Addition", year: "1980" });
    try {
      expect((await fetch(url, authed({ method: "PUT", body: JSON.stringify(changed) }))).status).toBe(200);
      expect((await fetch(`${BASE}/gallery/late-addition/`)).status).toBe(200);
      expect(await (await fetch(`${BASE}/gallery/`)).text()).toContain("Late Addition");
      expect(await (await fetch(`${BASE}/search.json`)).text()).toContain("Late Addition");
    } finally {
      await fetch(url, authed({ method: "PUT", body: before }));
    }
  });
});

describe("an address that has moved", () => {
  const collection = `${BASE}/edit/pages/gallery/collection.json`;

  test("an item's alias is a 301 to where it lives now", async () => {
    const res = await fetch(`${BASE}/first-light-1961`, { redirect: "manual" });
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("/gallery/first-light/");
  });

  test("a page can carry aliases too, in its front matter", async () => {
    const url = `${BASE}/edit/pages/moved-here.md`;
    try {
      await fetch(url, authed({ method: "PUT", body: "title: Moved\naliases: /old-place\naliases: /older-place.html\n\n# Moved" }));
      for (const from of ["/old-place", "/older-place.html", "/old-place/"]) {
        const res = await fetch(`${BASE}${from}`, { redirect: "manual" });
        expect(res.status).toBe(301);
        expect(res.headers.get("Location")).toBe("/moved-here.html");
      }
    } finally {
      await fetch(url, authed({ method: "DELETE" }));
    }
  });

  test("a legacy address full of punctuation matches as the browser sends it", async () => {
    // The old site's slugs kept quotes, backticks and curly apostrophes, so a
    // browser sends them percent-encoded. They are compared decoded, once,
    // which is the whole reason decodePath runs before the lookup.
    const before = await (await fetch(collection, authed())).text();
    const legacy = [`/l"etoile-1976`, "/polly-underground-1976`", "/don’t-write-everything-down"];
    const changed = JSON.parse(before);
    changed.groups[0]!.items[0]!.aliases.push(...legacy);
    try {
      await fetch(collection, authed({ method: "PUT", body: JSON.stringify(changed) }));
      for (const from of legacy) {
        const res = await fetch(`${BASE}${encodeURI(from).replace(/"/g, "%22")}`, { redirect: "manual" });
        expect(res.status).toBe(301);
        expect(res.headers.get("Location")).toBe("/gallery/first-light/");
      }
      // An address nobody ever had is still a 404, not a near miss.
      expect((await fetch(`${BASE}/l%22etoile-1977`)).status).toBe(404);
    } finally {
      await fetch(collection, authed({ method: "PUT", body: before }));
    }
  });
});

describe("a collection that can't have the addresses it asks for", () => {
  const collection = `${BASE}/edit/pages/gallery/collection.json`;
  const preview = (path: string) =>
    fetch(`${BASE}/edit/mark/?path=${encodeURIComponent(path)}`,
      authed({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: "# Gallery" }) }));

  test("the preview says so, which is how the editor's Notice hears about it", async () => {
    const error = hush("error");
    const before = await (await fetch(collection, authed())).text();
    const changed = JSON.parse(before);
    changed.groups[0]!.items.push({ title: "By Year", slug: "Not A Slug" });
    try {
      await fetch(collection, authed({ method: "PUT", body: JSON.stringify(changed) }));
      const data = await (await preview("gallery/index.md")).json();
      expect(data.problems.join(" ")).toContain(`slug "Not A Slug" isn't [a-z0-9-]`);
    } finally {
      await fetch(collection, authed({ method: "PUT", body: before }));
      error.mockRestore();
    }
  });

  test("a page of the same name wins, and the item that wanted that address is named", async () => {
    const error = hush("error");
    const before = await (await fetch(collection, authed())).text();
    const changed = JSON.parse(before);
    changed.groups[0]!.items.push({ title: "Notes" });
    const notes = `${BASE}/edit/pages/gallery/notes.md`;
    try {
      await fetch(notes, authed({ method: "PUT", body: "title: Notes\n\n# Notes by hand" }));
      await fetch(collection, authed({ method: "PUT", body: JSON.stringify(changed) }));
      expect(await (await fetch(`${BASE}/gallery/notes.html`)).text()).toContain("Notes by hand");
      const data = await (await preview("gallery/index.md")).json();
      expect(data.problems.join(" ")).toContain("already a page");
    } finally {
      await fetch(notes, authed({ method: "DELETE" }));
      await fetch(collection, authed({ method: "PUT", body: before }));
      error.mockRestore();
    }
  });

  test("a page with no collection beside it has no problems to report", async () => {
    expect((await (await preview("index.md")).json()).problems).toEqual([]);
  });
});
