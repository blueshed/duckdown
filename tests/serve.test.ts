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

  test("listens on the port it is given", async () => {
    const server = listen(dist, 0);
    try {
      expect(await (await fetch(`http://localhost:${server.port}/`)).text()).toBe("<h1>home</h1>");
    } finally {
      server.stop(true);
    }
  });
});
