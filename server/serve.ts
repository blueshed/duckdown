#!/usr/bin/env bun

// Serve the exported site: a folder of files and nothing else.
//
// There is no CMS here. `bun run export` writes dist/ from the site's pages,
// and this hands those files out. It keeps no state, reads no database and
// holds no secret, because a site nobody edits in the browser needs none of
// that — the editing happens locally, and git is the site.
//
//   bun run node_modules/duckdown/server/serve.ts     (SITE_DIR, PORT)

import { join, normalize, relative, resolve, sep } from "path";
import { realpath, stat } from "fs/promises";
import { logView } from "./log";
import { decodePath, HEALTH } from "./utils";
import { hostAnswer, hostOf, looking } from "./hosts";
import { rootFile } from "./base";
import { loadExtensions, siteFor, withExtensions, type Extension } from "./extensions";
import { asFile, everyAnswer, nosniff } from "./headers";

export { looking };

// A page's canonical address is the short one — `/blog/`, not `/blog` — so
// the other form is a redirect rather than a second copy of the page.
const MOVED = 301;

const inside = (root: string, path: string) => path === root || path.startsWith(root + sep);

// Under dir or nowhere: a path never climbs out of it, by ".." or through a
// link, and only a file is served — the rule storage has (n172). A link in
// dist/ to /etc/passwd handed it over. What is served is the file the path
// really is, typed by the name it was asked for, with where it really is in
// dist/ (`key`), which is what decides how it is handed out.
async function file(dir: string, path: string): Promise<{ body: Bun.BunFile; key: string } | null> {
  const full = normalize(join(dir, path));
  if (!inside(dir, full)) return null;
  const [root, to] = await Promise.all([realpath(dir), realpath(full)]).catch(() => []);   // nothing there: a miss
  if (!root || !to || !inside(root, to) || !(await stat(to)).isFile()) return null;
  return { body: Bun.file(to, { type: Bun.file(full).type }), key: relative(root, to).split(sep).join("/") };
}

// A file from static/, or one of the root files the export took from there,
// is a file, never a page (headers.ts), as the served site answers it. Told
// by the file, never by the address: /%2Fstatic/…, //static/… and
// /x/..%2Fstatic/… each reach static/ without starting /static/.
const handedOut = (key: string) => key.startsWith("static/") || !!rootFile(key);

// What one request gets. `html` says whether the answer is a page: only pages
// are views (a stylesheet or an image fetched by one is not a reader arriving),
// which is what the served site counts too.
async function route(req: Request, dir: string, origin: string): Promise<{ res: Response; html: boolean }> {
  const url = new URL(req.url);
  if (url.pathname === "/health") return { res: new Response(HEALTH), html: false };

  // A place to look is not a place to be (hosts.ts): on localhost or the
  // platform's own address the site is served whatever the origin says, but
  // told to no crawler; under any other name than the origin's it moves there.
  const moved = hostAnswer(req, origin);
  if (moved) return { res: moved, html: false };

  const path = decodePath(url.pathname);
  if (path === null) return { res: new Response("Bad Request", { status: 400 }), html: false };

  // An icon asked for under one of its other names (base.ts) is the one the
  // export wrote at the root.
  const found = await file(dir, path.endsWith("/") ? `${path}index.html` : path)
    ?? (rootFile(path.slice(1)) === "apple-touch-icon.png" ? await file(dir, "/apple-touch-icon.png") : null);
  if (found) {
    // Short: nothing here is content-hashed, so a stylesheet edited this
    // morning has to be able to show up. The search index's parts are asked
    // about every time (search.ts): they name each other by number, and a
    // browser must not keep one from before a deploy beside one from after.
    const { body, key } = found;
    return {
      res: new Response(body, { headers: { "Cache-Control": path.startsWith("/search/") ? "no-cache" : "public, max-age=300", ...(handedOut(key) ? asFile(body.type) : {}) } }),
      html: !!body.name?.endsWith(".html"),
    };
  }

  // `/blog` is a folder with an index: send the reader to its real address.
  // Relative, deliberately — behind a proxy the request's own URL says http,
  // and an absolute Location built from it bounces readers off https.
  if (!path.endsWith("/") && await file(dir, `${path}/index.html`)) {
    return { res: new Response(null, { status: MOVED, headers: { Location: `${url.pathname}/${url.search}` } }), html: false };
  }

  const missing = await file(dir, "404.html");
  return {
    res: missing
      ? new Response(missing.body, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } })
      : new Response("Not Found", { status: 404 }),
    html: true,
  };
}

// One line per page view, as the served site prints: what was read and how
// much, and nothing that identifies a reader. `bun run views` reads these.
export async function serveDist(
  req: Request,
  dir: string,
  log: (req: Request, status: number, startedAt: number) => void = logView,
  origin = "",
): Promise<Response> {
  const startedAt = performance.now();
  const { res, html } = await route(req, resolve(dir), origin);
  nosniff(res);
  if (looking(hostOf(req), origin)) res.headers.set("X-Robots-Tag", "noindex");
  if (html) log(req, res.status, startedAt);
  return res;
}

// The site's extensions (extensions.ts) are served beside dist/, on the same
// host, so a form on a published site wears the site's stylesheets and links.
export async function listen(
  dir = process.env.SITE_DIR || "./dist",
  port = parseInt(process.env.PORT || "8080"),
  origin = process.env.DUCKDOWN_ORIGIN || "",
  extensions?: Extension[],
) {
  const server = Bun.serve({
    port,
    routes: everyAnswer(await withExtensions({ "/health": new Response(HEALTH) }, siteFor(), extensions ?? (await loadExtensions()))),
    fetch: (req) => serveDist(req, dir, logView, origin),
  });
  console.log(`serving ${resolve(dir)} on http://localhost:${server.port}/`);
  return server;
}

// Only when run, never on import: the tests call serveDist() directly.
if (import.meta.main) await listen();
