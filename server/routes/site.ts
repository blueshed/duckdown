import { createPageStorage } from "../storage";
import { yes } from "../markdown";
import { getUser } from "../auth";
import { parsePage, pageHtml, itemPage } from "../page";
import { logView } from "../log";
import { decodePath, conditional } from "../utils";
import { NOT_FOUND, aliasTarget } from "../search";
import { itemAt, collectionPath } from "../collection";
import { ROOT_FILES } from "../base";
import { APP_PATH, IS_S3, ORIGIN } from "../config";
import { hostAnswer, hostOf, looking } from "../hosts";
import { existsSync } from "fs";
import { staticFile, CACHE } from "./static";
import { feedXml, feedFolder, FEED_FILE } from "../feed";

const pages = createPageStorage();

// Where the page lives, in one form. Three addresses reach the same page —
// /blog, /blog/ and /blog/index.html — so the address it was asked for is the
// wrong thing to call canonical: each would name itself and search engines
// would see one page three times. This names the page by what it resolved to.
// Behind a proxy the request's own URL names the container, so the forwarded
// headers win.
export function siteOrigin(req: Request): string {
  const url = new URL(req.url);
  const host = hostOf(req);
  const proto = req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

// Every page view is counted the same way, whatever the answer was — a 404
// that keeps being asked for is worth knowing about too.
//
// One site, one address, as the published server has it (hosts.ts): with
// DUCKDOWN_ORIGIN set, a page asked for under another name — the apex when
// the origin is www — moves there, and the platform's own address (or
// localhost) still shows the site but tells no crawler, so a served site is
// never indexed three times under three names. `origin` is the setting,
// passed so a test can give one.
export const siteHandler = (origin: string) => async (req: Request) => {
  const startedAt = performance.now();
  const res = hostAnswer(req, origin) ?? await renderPage(req);
  if (looking(hostOf(req), origin)) res.headers.set("X-Robots-Tag", "noindex");
  logView(req, res.status, startedAt);
  return res;
};

export const handleSite = siteHandler(ORIGIN);

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

// No page of that name. Before it is a miss, two more things it could be: an
// item of a collection, or an address that has moved.
//
// An item is looked up by its folder and slug — one collection, the one the
// address names — and never by searching every collection for something that
// looks close. A miss here is a miss: the site that inspired this feature
// served the wrong painting with a 200 for years because a lookup that failed
// fell back to an item instead of a 404.
const INDEX = "/index";

const collected = async (req: Request, name: string, decoded: string) => {
  // An item's address is a folder with an index, so the same three addresses
  // reach it that reach any folder: /works/x, /works/x/ and /works/x/index.html
  // — and the last is the file the export writes, so a published copy and a
  // served one answer the same set.
  const found = await itemAt(pages, name)
    ?? (name.endsWith(INDEX) ? await itemAt(pages, name.slice(0, -INDEX.length)) : null);
  if (found) {
    const user = await getUser(req);
    const { html } = await pageHtml(itemPage(found), {
      origin: siteOrigin(req),
      // There is no markdown behind an item, so the edit link opens the file
      // it is written in: the folder's collection.
      editHref: user ? `/edit?path=${encodeURIComponent(collectionPath(found.collection.folder))}` : "",
      item: found,
    });
    if (user) return new Response(html, { headers: { "Content-Type": HTML, "Cache-Control": "private, no-cache" } });
    return conditional(req, html, { "Content-Type": HTML, "Cache-Control": CACHE });
  }

  // An address a page or an item used to live at, compared decoded: a legacy
  // slug may hold a quote or a curly apostrophe, which arrives percent-encoded.
  const moved = await aliasTarget(pages, decoded);
  if (moved) return new Response(null, { status: 301, headers: { Location: encodeURI(moved) } });

  return notFound(req);
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
  // A folder's feed, when its index asks for one (feed.ts); otherwise the
  // name is just a miss like any other.
  if (path === FEED_FILE || path.endsWith(`/${FEED_FILE}`)) {
    const xml = await feedXml(pages, feedFolder(`/${path}`), siteOrigin(req));
    if (xml) return conditional(req, xml, { "Content-Type": "application/atom+xml; charset=utf-8", "Cache-Control": CACHE });
  }
  const name = path.replace(/\.html$/, "").replace(/\/$/, "") || "index";
  // A page, or the index of the folder of that name: /blog, /blog/ and
  // /blog/index.html all reach pages/blog/index.md.
  const key = await pages.exists(`${name}.md`) ? `${name}.md` : `${name}/index.md`;
  if (!await pages.exists(key)) return collected(req, name, decoded);

  const page = parsePage(key, await pages.read(key));
  // An each: page is what every item of its collection is made from, not a
  // page of its own: its address is a miss (or an item that happens to share
  // its name).
  if (page.meta.each) return collected(req, name, decoded);
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
