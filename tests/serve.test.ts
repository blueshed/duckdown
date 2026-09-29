// The published flavour: a folder of files and nothing else.
import { describe, test, expect } from "bun:test";
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { RUN } from "./helpers";
import { serveDist, listen, looking } from "../server/serve";
import pkg from "../package.json";

const dist = join(RUN, "dist-served");
const files: Record<string, string> = {
  "index.html": "<h1>home</h1>",
  "blog/index.html": "<h1>blog</h1>",
  "static/site.css": "body{}",
  "search.json": "[]",
  "search/index.json": '{"version":"1","words":[]}',
  "search/tips.html": "<h1>tips</h1>",   // a page of the site's own, not a part
};
for (const [path, body] of Object.entries(files)) {
  mkdirSync(join(dist, path, ".."), { recursive: true });
  writeFileSync(join(dist, path), body);
}

// What was logged, as [path, status], without printing anything.
async function ask(path: string, dir = dist, headers: Record<string, string> = {}) {
  const logged: [string, number][] = [];
  const res = await serveDist(new Request(`http://site${path}`, { headers }), dir, (req, status) =>
    void logged.push([new URL(req.url).pathname, status]));
  return { res, logged };
}

describe("serveDist", () => {
  test("the home-screen icon answers under its sized names too", async () => {
    expect((await ask("/apple-touch-icon-120x120-precomposed.png")).res.status).toBe(404);   // none written
    writeFileSync(join(dist, "apple-touch-icon.png"), "PNG-BYTES");
    try {
      for (const name of ["/apple-touch-icon.png", "/apple-touch-icon-180x180.png", "/apple-touch-icon-120x120-precomposed.png"]) {
        const { res } = await ask(name);
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("PNG-BYTES");
      }
    } finally {
      rmSync(join(dist, "apple-touch-icon.png"));
    }
  });

  test("a folder is its index, and a file is itself, cached briefly", async () => {
    const { res } = await ask("/blog/");
    expect(await res.text()).toBe("<h1>blog</h1>");
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect(await (await ask("/")).res.text()).toBe("<h1>home</h1>");
    expect(await (await ask("/static/site.css")).res.text()).toBe("body{}");
  });

  // n166, after review: a browser kept a word's shard from before a deploy
  // beside a page from after it, and the page numbers had moved.
  test("the search index's parts are asked about every time: they name each other by number", async () => {
    const { res } = await ask("/search/index.json");
    expect(await res.text()).toContain('"version"');
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect((await ask("/search.json")).res.headers.get("cache-control")).toBe("public, max-age=300");
  });

  // After review: asked about every time, and never told "unchanged", a
  // reader fetched every part again at each search.
  test("and one that hasn't changed is a 304, as the served site's are", async () => {
    const first = (await ask("/search/index.json")).res;
    const etag = first.headers.get("etag")!;
    expect(etag).toMatch(/^"\w+"$/);
    expect(first.headers.get("content-type")).toContain("application/json");
    const again = (await ask("/search/index.json", dist, { "If-None-Match": etag })).res;
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
    expect((await ask("/search/index.json", dist, { "If-None-Match": '"another"' })).res.status).toBe(200);
    // Weak, in a list, or "*": each is a match (RFC 9110's weak comparison).
    for (const header of [`W/${etag}`, `"another", ${etag}`, "*"]) {
      expect((await ask("/search/index.json", dist, { "If-None-Match": header })).res.status).toBe(304);
    }
  });

  // After review: every file under search/ was taken for a part, so a page of
  // the site's own there was never logged as a view and was never cached.
  test("a page of the site's own under search/ is a page: logged, and cached as one", async () => {
    const { res, logged } = await ask("/search/tips.html");
    expect(await res.text()).toBe("<h1>tips</h1>");
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect(logged).toEqual([["/search/tips.html", 200]]);
  });

  test("a path with a NUL is a 400, as one that won't decode is", async () => {
    for (const path of ["/%00", "/static/a%00.css"]) expect((await ask(path)).res.status).toBe(400);
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

  // The rule storage has for a link (n172): what a path really is must be a
  // file in the folder. dist/static/passwd.txt linked to /etc/passwd was
  // served, 200, with the file. A dist that is itself a link is still the
  // folder, and a link to a file in it is that file.
  test("never leaves the folder through a link, and serves only a file", async () => {
    const away = join(RUN, "dist-away");
    mkdirSync(away, { recursive: true });
    writeFileSync(join(away, "secret.txt"), "SECRET");
    const links: [string, string][] = [
      [join(away, "secret.txt"), join(dist, "static", "secret.txt")],
      [away, join(dist, "away")],
      [join(dist, "static", "site.css"), join(dist, "static", "alias.css")],
      [dist, join(RUN, "dist-linked")],
    ];
    for (const [to, at] of links) symlinkSync(to, at);
    Bun.spawnSync(["mkfifo", join(dist, "static", "pipe.css")]);
    try {
      expect((await ask("/static/secret.txt")).res.status).toBe(404);
      expect((await ask("/away/secret.txt")).res.status).toBe(404);
      const alias = (await ask("/static/alias.css")).res;
      expect(alias.status).toBe(200);
      expect(await alias.text()).toBe("body{}");
      expect(alias.headers.get("content-type")).toContain("text/css");
      expect(await (await ask("/blog/", join(RUN, "dist-linked"))).res.text()).toBe("<h1>blog</h1>");
      expect((await ask("/static/pipe.css")).res.status).toBe(404);   // a named pipe is no file
    } finally {
      for (const [, at] of links) rmSync(at);
      rmSync(join(dist, "static", "pipe.css"));
    }
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
    expect(await health.res.text()).toBe(`OK duckdown ${pkg.version}`);
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
    expect(await (await at("blueshed.co.uk", "/health")).text()).toBe(`OK duckdown ${pkg.version}`);
    // Without an origin, any host is served; a Request with no Host header uses its URL's.
    expect((await ask("/")).res.status).toBe(200);
    expect((await serveDist(new Request("http://blueshed.co.uk/"), dist, () => {}, origin)).status).toBe(301);
  });

  test("a Railway address or localhost is a place to look: served whatever the origin, noindex, robots closed", async () => {
    const origin = "https://www.antonydonaldson.com";
    const at = (host: string, path = "/", o = origin) => serveDist(
      new Request(`http://${host}${path}`, { headers: { host } }), dist, () => {}, o);
    // Before cutover the domain still points at the old site: the new one is seen here.
    const seen = await at("tony-site-production.up.railway.app", "/blog/");
    expect(seen.status).toBe(200);
    expect(await seen.text()).toBe("<h1>blog</h1>");
    expect(seen.headers.get("x-robots-tag")).toBe("noindex");
    expect(await (await at("tony-site-production.up.railway.app", "/robots.txt")).text()).toBe("User-agent: *\nDisallow: /\n");
    expect((await at("localhost:8080", "/nope")).headers.get("x-robots-tag")).toBe("noindex");  // every answer, a 404 too
    expect((await at("127.0.0.1:8080")).status).toBe(200);
    // The origin's own host is indexable and keeps the site's robots.txt (or a miss).
    const own = await at("www.antonydonaldson.com");
    expect(own.headers.get("x-robots-tag")).toBeNull();
    expect((await at("www.antonydonaldson.com", "/robots.txt")).status).toBe(404);
    // With no origin at all the platform address is still marked, and another host still moves.
    expect((await at("x.up.railway.app", "/", "")).headers.get("x-robots-tag")).toBe("noindex");
    expect((await at("antonydonaldson.com")).status).toBe(301);
    expect(looking("up.railway.app.evil.com")).toBe(false);
    expect(looking("localhost.example.com")).toBe(false);         // the whole hostname, not its start
    // A site with no domain yet publishes at its railway.app address: there
    // it is the origin, indexable, and its own robots.txt answers.
    const railway = "https://vashti-production.up.railway.app";
    expect(looking("vashti-production.up.railway.app", railway)).toBe(false);
    expect(looking("other.up.railway.app", railway)).toBe(true);
  });

  test("listens on the port it is given", async () => {
    const server = await listen(dist, 0);
    try {
      expect(await (await fetch(`http://localhost:${server.port}/`)).text()).toBe("<h1>home</h1>");
      expect((await fetch(`http://localhost:${server.port}/health`)).headers.get("x-content-type-options")).toBe("nosniff");
    } finally {
      server.stop(true);
    }
  });

  // As the served site answers (server.test.ts): no answer lets a browser
  // take a file for another type, and a file from static/ opened alone —
  // an SVG with a <script> in it — runs nothing on the site's address.
  test("every answer says its type is the one it is; a file from static/ is sandboxed, a page never is", async () => {
    writeFileSync(join(dist, "static", "evil.svg"), "<svg><script>alert(1)</script></svg>");
    const media = ["leaflet.pdf", "song.wav", "film.mp4"];
    for (const name of media) writeFileSync(join(dist, "static", name), "bytes");
    try {
      for (const path of ["/", "/blog/", "/blog", "/static/site.css", "/nope", "/%E0%A4%A", "/health", "/search.json"]) {
        expect([path, (await ask(path)).res.headers.get("x-content-type-options")]).toEqual([path, "nosniff"]);
      }
      const policy = async (path: string) => [path, (await ask(path)).res.headers.get("content-security-policy")];
      for (const path of ["/static/evil.svg", "/static/site.css", "/static/leaflet.pdf"]) expect(await policy(path)).toEqual([path, "sandbox"]);
      for (const path of ["/static/song.wav", "/static/film.mp4", "/", "/blog/", "/search.json", "/nope"]) expect(await policy(path)).toEqual([path, null]);
    } finally {
      rmSync(join(dist, "static", "evil.svg"));
      for (const name of media) rmSync(join(dist, "static", name));
    }
  });

  // Whether a file is sandboxed is decided by the file, never by the address
  // it was asked for: /%2Fstatic/…, //static/… and /x/..%2Fstatic/… each
  // reach a file in static/ without starting /static/, and an SVG's script
  // ran on the site's address in Chrome and WebKit (hardening review).
  test("a file from static/ is sandboxed however its address is spelled", async () => {
    mkdirSync(join(dist, "static", "images"), { recursive: true });
    writeFileSync(join(dist, "static", "images", "evil.svg"), "<svg><script>alert(1)</script></svg>");
    writeFileSync(join(dist, "static", "evil.html"), "<script>alert(1)</script>");
    writeFileSync(join(dist, "robots.txt"), "User-agent: *\n");
    try {
      const policy = async (path: string) => {
        const { res } = await ask(path);
        return [path, res.status, res.headers.get("content-security-policy")];
      };
      for (const path of ["/%2Fstatic/images/evil.svg", "//static/images/evil.svg", "/x/..%2Fstatic/evil.html",
        "/static/images/evil.svg", "/blog/..%2Fstatic/evil.html", "/%2Frobots.txt", "/x/..%2Frobots.txt"]) {
        expect(await policy(path)).toEqual([path, 200, "sandbox"]);
      }
      // A page is the site's own, however it is reached.
      for (const path of ["/blog/", "//blog/", "/x/..%2Fblog/index.html", "/static/..%2Findex.html"]) {
        expect(await policy(path)).toEqual([path, 200, null]);
      }
    } finally {
      rmSync(join(dist, "static", "images"), { recursive: true });
      rmSync(join(dist, "static", "evil.html"));
      rmSync(join(dist, "robots.txt"));
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
