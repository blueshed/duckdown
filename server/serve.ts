#!/usr/bin/env bun

// Serve the exported site: a folder of files and nothing else.
//
// There is no CMS here. `bun run export` writes dist/ from the site's pages,
// and this hands those files out. It keeps no state, reads no database and
// holds no secret, because a site nobody edits in the browser needs none of
// that — the editing happens locally, and git is the site.
//
//   bun run node_modules/duckdown/server/serve.ts     (SITE_DIR, PORT)

import { join, normalize, resolve } from "path";
import { logView } from "./log";
import { decodePath } from "./utils";

// A page's canonical address is the short one — `/blog/`, not `/blog` — so
// the other form is a redirect rather than a second copy of the page.
const MOVED = 301;

async function file(dir: string, path: string): Promise<Bun.BunFile | null> {
  // Under dir or nowhere: a path is never allowed to climb out of it.
  const full = normalize(join(dir, path));
  if (full !== dir && !full.startsWith(dir + "/")) return null;
  const f = Bun.file(full);
  return (await f.exists()) ? f : null;
}

// What one request gets. `html` says whether the answer is a page: only pages
// are views (a stylesheet or an image fetched by one is not a reader arriving),
// which is what the served site counts too.
async function route(req: Request, dir: string, origin: string): Promise<{ res: Response; html: boolean }> {
  const url = new URL(req.url);
  if (url.pathname === "/health") return { res: new Response("OK"), html: false };

  // One address. With DUCKDOWN_ORIGIN set, a request for the same site under
  // another name (the apex when the origin is www) moves to the origin, path
  // and query kept. Absolute, deliberately — the point is to leave this host.
  // localhost is left alone so a local run of the published site still works.
  const elsewhere = otherHost(req, url, origin);
  if (elsewhere) {
    return { res: new Response(null, { status: MOVED, headers: { Location: `${elsewhere}${url.pathname}${url.search}` } }), html: false };
  }

  const path = decodePath(url.pathname);
  if (path === null) return { res: new Response("Bad Request", { status: 400 }), html: false };

  const found = await file(dir, path.endsWith("/") ? `${path}index.html` : path);
  if (found) {
    // Short, and the same for everything: nothing here is content-hashed,
    // so a stylesheet edited this morning has to be able to show up.
    return {
      res: new Response(found, { headers: { "Cache-Control": "public, max-age=300" } }),
      html: !!found.name?.endsWith(".html"),
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
      ? new Response(missing, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } })
      : new Response("Not Found", { status: 404 }),
    html: true,
  };
}

// The origin to move to when the request came in under another host, or
// null when it should be served here: no origin configured, the host matches,
// or it's localhost. Behind Railway's proxy the reader's host is
// x-forwarded-host; the Host header is what the proxy said to us.
function otherHost(req: Request, url: URL, origin: string): string | null {
  if (!origin) return null;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const target = new URL(origin);
  if (host === target.host || host.startsWith("localhost")) return null;
  return target.origin;
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
  if (html) log(req, res.status, startedAt);
  return res;
}

export function listen(
  dir = process.env.SITE_DIR || "./dist",
  port = parseInt(process.env.PORT || "8080"),
  origin = process.env.DUCKDOWN_ORIGIN || "",
) {
  const server = Bun.serve({ port, fetch: (req) => serveDist(req, dir, logView, origin) });
  console.log(`serving ${resolve(dir)} on http://localhost:${server.port}/`);
  return server;
}

// Only when run, never on import: the tests call serveDist() directly.
if (import.meta.main) listen();
