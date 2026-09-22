// The published flavour: a folder of files and nothing else.
import { describe, test, expect } from "bun:test";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { RUN } from "./helpers";
import { serveDist, listen } from "../server/serve";

const dist = join(RUN, "dist-served");
const files: Record<string, string> = {
  "index.html": "<h1>home</h1>",
  "blog/index.html": "<h1>blog</h1>",
  "static/site.css": "body{}",
  "search.json": "[]",
};
for (const [path, body] of Object.entries(files)) {
  mkdirSync(join(dist, path, ".."), { recursive: true });
  writeFileSync(join(dist, path), body);
}

// What was logged, as [path, status], without printing anything.
async function ask(path: string, dir = dist) {
  const logged: [string, number][] = [];
  const res = await serveDist(new Request(`http://site${path}`), dir, (req, status) =>
    void logged.push([new URL(req.url).pathname, status]));
  return { res, logged };
}

describe("serveDist", () => {
  test("a folder is its index, and a file is itself, cached briefly", async () => {
    const { res } = await ask("/blog/");
    expect(await res.text()).toBe("<h1>blog</h1>");
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect(await (await ask("/")).res.text()).toBe("<h1>home</h1>");
    expect(await (await ask("/static/site.css")).res.text()).toBe("body{}");
  });

  test("a folder without its slash moves to the one with, keeping the query", async () => {
    const { res } = await ask("/blog?page=2");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/blog/?page=2"); // relative: behind a proxy an absolute one would say http
  });

  test("never leaves the folder", async () => {
    expect((await ask("/../secret")).res.status).toBe(404);
    expect((await ask("/%2e%2e/secret")).res.status).toBe(404);
    expect((await ask("/blog/..%2f..%2fsecret")).res.status).toBe(404);
  });

  test("a malformed escape is a 400, not a throw", async () => {
    const { res, logged } = await ask("/%E0%A4%A");
    expect(res.status).toBe(400);
    expect(logged).toEqual([]);
  });

  test("a miss is the site's own 404.html when it has one, and a plain line when it doesn't", async () => {
    expect(await (await ask("/nope")).res.text()).toBe("Not Found");
    writeFileSync(join(dist, "404.html"), "<h1>lost</h1>");
    const { res } = await ask("/nope");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toBe("<h1>lost</h1>");
  });

  test("only pages are views: not stylesheets, the index, health or redirects", async () => {
    expect((await ask("/")).logged).toEqual([["/", 200]]);
    expect((await ask("/blog/")).logged).toEqual([["/blog/", 200]]);
    expect((await ask("/nope")).logged).toEqual([["/nope", 404]]);   // a miss is worth knowing about
    expect((await ask("/static/site.css")).logged).toEqual([]);
    expect((await ask("/search.json")).logged).toEqual([]);
    expect((await ask("/blog")).logged).toEqual([]);
    const health = await ask("/health");
    expect(await health.res.text()).toBe("OK");
    expect(health.logged).toEqual([]);
  });

  test("logs through the view log unless told otherwise", async () => {
    // The default logger prints nothing without DUCKDOWN_LOG=1.
    expect((await serveDist(new Request("http://site/"), dist)).status).toBe(200);
  });

  test("with DUCKDOWN_ORIGIN, another host moves to it, path and query kept", async () => {
    const origin = "https://www.blueshed.co.uk";
    const at = (host: string, path = "/", forwarded?: string) => serveDist(
      new Request(`http://${host}${path}`, { headers: forwarded ? { host, "x-forwarded-host": forwarded } : { host } }),
      dist, () => {}, origin);
    // The apex, arriving direct or through a proxy that says who asked.
    const moved = await at("blueshed.co.uk", "/blog/?page=2");
    expect(moved.status).toBe(301);
    expect(moved.headers.get("location")).toBe("https://www.blueshed.co.uk/blog/?page=2");
    expect((await at("railway.internal", "/", "blueshed.co.uk")).headers.get("location")).toBe("https://www.blueshed.co.uk/");
    // The origin itself, and localhost, are served.
    expect((await at("www.blueshed.co.uk")).status).toBe(200);
    expect((await at("localhost:8080")).status).toBe(200);
    // Health never moves: the platform asks on whatever host it likes.
    expect(await (await at("blueshed.co.uk", "/health")).text()).toBe("OK");
    // Without an origin, any host is served; a Request with no Host header uses its URL's.
    expect((await ask("/")).res.status).toBe(200);
    expect((await serveDist(new Request("http://blueshed.co.uk/"), dist, () => {}, origin)).status).toBe(301);
  });

  test("listens on the port it is given", async () => {
    const server = listen(dist, 0);
    try {
      expect(await (await fetch(`http://localhost:${server.port}/`)).text()).toBe("<h1>home</h1>");
    } finally {
      server.stop(true);
    }
  });
});

describe("an address the export moved", () => {
  // The export writes an alias as <alias>/index.html under the name a request
  // decodes to, so a legacy slug full of punctuation still answers here. A
  // filesystem that can't hold the name (Windows won't take `"`) is the known
  // limit of the published flavour; the served flavour answers 301 instead.
  const moved = join(RUN, "dist-moved");
  for (const name of ["first-light-1961", `l"etoile-1976`, "don’t-write-everything-down"]) {
    mkdirSync(join(moved, name), { recursive: true });
    writeFileSync(join(moved, name, "index.html"), `<link rel="canonical" href="/gallery/first-light/">`);
  }
  writeFileSync(join(moved, "index.html"), "<h1>home</h1>");

  test("the redirect page is found for the encoded request a browser sends", async () => {
    for (const encoded of ["/first-light-1961/", `/l%22etoile-1976/`, "/don%E2%80%99t-write-everything-down/"]) {
      const { res } = await ask(encoded, moved);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("/gallery/first-light/");
    }
    // Without the trailing slash it is a folder with an index, so it moves to
    // the address that has one — the same 301 any folder gets.
    const { res } = await ask("/l%22etoile-1976", moved);
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/l%22etoile-1976/");
  });
});
