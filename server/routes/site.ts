import { createPageStorage } from "../storage";
import { yes } from "../markdown";
import { getUser } from "../auth";
import { parsePage, pageHtml } from "../page";
import { logView } from "../log";
import { decodePath, conditional } from "../utils";
import { NOT_FOUND } from "../search";
import { ROOT_FILES } from "../base";
import { APP_PATH, IS_S3 } from "../config";
import { existsSync } from "fs";
import { staticFile, CACHE } from "./static";

const pages = createPageStorage();

// Where the page lives, in one form. Three addresses reach the same page —
// /blog, /blog/ and /blog/index.html — so the address it was asked for is the
// wrong thing to call canonical: each would name itself and search engines
// would see one page three times. This names the page by what it resolved to.
// Behind a proxy the request's own URL names the container, so the forwarded
// headers win.
export function siteOrigin(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host;
  const proto = req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

// Every page view is counted the same way, whatever the answer was — a 404
// that keeps being asked for is worth knowing about too.
export const handleSite = async (req: Request) => {
  const startedAt = performance.now();
  const res = await renderPage(req);
  logView(req, res.status, startedAt);
  return res;
};

const HTML = "text/html; charset=utf-8";

// The content folder is read at every request but only seeded at startup, so
// one that is deleted or moved while the server runs turns every page into a
// 404 with nothing said, and /health still answers. Say so, once per
// disappearance, when the first miss happens.
let rootGone = false;
export function noticeMissingRoot(exists: (path: string) => boolean = existsSync): void {
  if (IS_S3 || exists(APP_PATH)) {
    rootGone = false;
  } else if (!rootGone) {
    rootGone = true;
    console.error(`The site folder ${APP_PATH} is gone, so every page is a 404. `
      + "DUCKDOWN_PATH points at it: put it back, or restart to seed a new one.");
  }
}

// The site's own 404 page when it has one (pages/404.md), the same one a
// published site's host serves from 404.html; a plain line when it doesn't.
const notFound = async (req: Request) => {
  noticeMissingRoot();
  if (!await pages.exists(NOT_FOUND)) return new Response("Not Found", { status: 404 });
  const { html } = await pageHtml(parsePage(NOT_FOUND, await pages.read(NOT_FOUND)), {
    origin: siteOrigin(req), editHref: "",
  });
  return new Response(html, { status: 404, headers: { "Content-Type": HTML } });
};

const renderPage = async (req: Request) => {
  const url = new URL(req.url);
  const decoded = decodePath(url.pathname);
  if (decoded === null) return new Response("Bad Request", { status: 400 });
  const path = decoded.replace(/^\//, "") || "index.html";
  if (ROOT_FILES.includes(path)) {
    const file = await staticFile(req, path);
    if (file) return file;
  }
  const name = path.replace(/\.html$/, "").replace(/\/$/, "") || "index";
  // A page, or the index of the folder of that name: /blog, /blog/ and
  // /blog/index.html all reach pages/blog/index.md.
  const key = await pages.exists(`${name}.md`) ? `${name}.md` : `${name}/index.md`;
  if (!await pages.exists(key)) return notFound(req);

  const page = parsePage(key, await pages.read(key));
  const user = await getUser(req);
  // A draft is for whoever is signed in to the editor, and nobody else.
  if (yes(page.meta.draft) && !user) return notFound(req);

  const { html } = await pageHtml(page, {
    origin: siteOrigin(req),
    editHref: user ? `/edit?path=${encodeURIComponent(key)}` : "",
  });

  // Signed in, the page carries an edit link a reader's copy doesn't: never
  // kept, and never shared. Otherwise it is cached like a static file.
  if (user) return new Response(html, { headers: { "Content-Type": HTML, "Cache-Control": "private, no-cache" } });
  return conditional(req, html, { "Content-Type": HTML, "Cache-Control": CACHE });
};
