// Extensions (extensions.ts): routes a site adds to duckdown's own, given the
// site's storage and its look, on the served site and the published one.
import { describe, test, expect, spyOn } from "bun:test";
import { mkdtempSync } from "fs";
import { join } from "path";
import { RUN, SITE } from "./helpers";
import { LocalStorage } from "../server/storage";
import { siteFor, withExtensions, loadExtensions, type Extension } from "../server/extensions";
import { listen } from "../server/serve";
import { HEALTH } from "../server/utils";

// An extension as a site would write one: a page of its own, in the site's look
const hello: Extension = (site) => ({
  "/hello/:name": {
    GET: async (req) =>
      new Response(await site.render(`title: Hello\n\nHello, ${req.params.name}.\n`, { key: "hello/page.md", path: `/hello/${req.params.name}` }), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
  },
});

// What the server says as it starts, unheard where a test isn't asking.
const quiet = () => {};

describe("the site an extension is given", () => {
  test("renders its markdown in the site's template, canonical at the address it is served from (n173)", async () => {
    const site = siteFor(new LocalStorage(SITE), "https://example.com");
    const html = await site.render("title: Hello\n\nHi.\n", { key: "hello/page.md", path: "/hello/ann" });
    expect(html).toContain("<title>Hello</title>");
    expect(html).toContain('<ul class="nav">');
    expect(html).toContain('<link rel="canonical" href="https://example.com/hello/ann">');
    expect(html).toContain('<meta property="og:url" content="https://example.com/hello/ann">');
    expect(html).not.toContain("hello/page.html");
  });

  test("keeps the storage it is given, and is duckdown's own by default", async () => {
    const store = new LocalStorage(SITE);
    expect(siteFor(store).storage).toBe(store);
    expect(await siteFor().storage.exists("pages/index.md")).toBe(true);
  });
});

describe("routes an extension adds", () => {
  const site = siteFor();

  test("join the server's own, an extension that has to wait included", async () => {
    const later: Extension = async () => ({ "/later": new Response("later") });
    const routes = await withExtensions({ "/health": new Response("OK") }, site, [hello, later], quiet);
    expect(Object.keys(routes)).toEqual(["/health", "/hello/:name", "/later"]);
  });

  test("may not take a route the server has, or another extension's", async () => {
    const health: Extension = () => ({ "/health": new Response("mine") });
    await expect(withExtensions({ "/health": new Response("OK") }, site, [health]))
      .rejects.toThrow("An extension's route /health clashes with one already there");
    await expect(withExtensions({}, site, [hello, hello])).rejects.toThrow("/hello/:name clashes");
  });

  // A page isn't a route: it comes through fetch, after every route, so a page
  // at an extension's address is never shown. That isn't refused — pages
  // change while the server runs, and what an editor writes never stops it —
  // it is said, as the server starts (n177).
  test("are said as the server starts, since a page at one of their addresses is never shown", async () => {
    const said: string[] = [];
    const home: Extension = () => ({ "/": new Response("mine") });
    await withExtensions({ "/health": new Response("OK") }, site, [hello, home], (line) => said.push(line));
    await withExtensions({ "/health": new Response("OK") }, site, [], (line) => said.push(line));
    expect(said).toEqual(["extensions answer /hello/:name, /: a page at any of those addresses is never shown"]);
  });
});

describe("the extensions a site declares", () => {
  const folder = async (pkg?: unknown, files: Record<string, string> = {}) => {
    const dir = mkdtempSync(join(RUN, "extensions-"));
    if (pkg !== undefined) await Bun.write(join(dir, "package.json"), JSON.stringify(pkg));
    for (const [name, body] of Object.entries(files)) await Bun.write(join(dir, name), body);
    return dir;
  };

  test("are none with no package.json, or one that declares none", async () => {
    expect(await loadExtensions(await folder())).toEqual([]);
    expect(await loadExtensions(await folder({ name: "a-site" }))).toEqual([]);
    expect(await loadExtensions(await folder({ duckdown: {} }))).toEqual([]);
  });

  test("are loaded by name, relative to the site, and given the site", async () => {
    const dir = await folder(
      { duckdown: { extensions: ["./rsvp.ts"] } },
      { "rsvp.ts": 'export default () => ({ "/rsvp": new Response("rsvp") });\n' },
    );
    const [rsvp] = await loadExtensions(dir);
    const routes = await withExtensions({}, siteFor(), [rsvp!], quiet);
    expect(await (routes["/rsvp"] as Response).text()).toBe("rsvp");
  });

  test("stop the server when the list isn't one, or an extension won't load or has nothing to give the site to", async () => {
    await expect(loadExtensions(await folder({ duckdown: { extensions: "./rsvp.ts" } })))
      .rejects.toThrow('package.json: "duckdown": { "extensions" } is a list of module names');
    await expect(loadExtensions(await folder({ duckdown: { extensions: ["./missing.ts"] } })))
      .rejects.toThrow('Extension "./missing.ts" (package.json) won\'t load');
    await expect(loadExtensions(await folder({ duckdown: { extensions: ["./plain.ts"] } }, { "plain.ts": "export const x = 1;\n" })))
      .rejects.toThrow('Extension "./plain.ts" has no default export to give the site to');
  });
});

describe("a published site with an extension", () => {
  test("serves the extension beside dist/, on the same host, and keeps /health its own", async () => {
    const dist = mkdtempSync(join(RUN, "extensions-dist-"));
    await Bun.write(join(dist, "index.html"), "<h1>home</h1>");
    const log = spyOn(console, "log").mockImplementation(() => {});
    const server = await listen(dist, 0, "", [hello]);
    log.mockRestore();
    try {
      const at = (path: string) => fetch(`http://localhost:${server.port}${path}`);
      expect(await (await at("/")).text()).toBe("<h1>home</h1>");
      expect(await (await at("/health")).text()).toBe(HEALTH);
      const page = await (await at("/hello/ann")).text();
      expect(page).toContain("Hello, ann.");
      expect(page).toContain('<ul class="nav">');
    } finally {
      server.stop(true);
    }
    const health: Extension = () => ({ "/health": new Response("mine") });
    await expect(listen(dist, 0, "", [health])).rejects.toThrow("/health clashes");
  });

  test("answers an extension's address before the page there, and says so as it starts (n177)", async () => {
    const dist = mkdtempSync(join(RUN, "extensions-dist-"));
    await Bun.write(join(dist, "index.html"), "<h1>home</h1>");
    const log = spyOn(console, "log").mockImplementation(() => {});
    const server = await listen(dist, 0, "", [() => ({ "/": new Response("mine") })]);
    try {
      expect(log.mock.calls.map((c) => c[0])).toContain("extensions answer /: a page at any of those addresses is never shown");
      expect(await (await fetch(`http://localhost:${server.port}/`)).text()).toBe("mine");
    } finally {
      log.mockRestore();
      server.stop(true);
    }
  });
});
