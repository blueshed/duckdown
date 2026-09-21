import { createPageStorage } from "../storage";
import { yes } from "../markdown";
import { getUser } from "../auth";
import { parsePage, pageHtml } from "../page";
import { logView } from "../log";

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

const renderPage = async (req: Request) => {
  const url = new URL(req.url);
  const path = decodeURIComponent(url.pathname).replace(/^\//, "") || "index.html";
  const name = path.replace(/\.html$/, "").replace(/\/$/, "") || "index";
  // A page, or the index of the folder of that name: /blog, /blog/ and
  // /blog/index.html all reach pages/blog/index.md.
  const key = await pages.exists(`${name}.md`) ? `${name}.md` : `${name}/index.md`;
  if (!await pages.exists(key)) {
    return new Response("Not Found", { status: 404 });
  }

  const page = parsePage(key, await pages.read(key));
  const user = await getUser(req);
  // A draft is for whoever is signed in to the editor, and nobody else.
  if (yes(page.meta.draft) && !user) {
    return new Response("Not Found", { status: 404 });
  }

  const { html } = await pageHtml(page, {
    origin: siteOrigin(req),
    editHref: user ? `/edit?path=${encodeURIComponent(key)}` : "",
  });

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
};
