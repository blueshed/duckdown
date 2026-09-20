import { TEMPLATES_PATH } from "../config";
import { createPageStorage, createStorage } from "../storage";
import { renderMarkdown, loadThemeCss, folderOf, yes } from "../markdown";
import { siteNav, markCurrent, folderListing } from "../nav";
import { getUser } from "../auth";
import { escapeHtml, outsideCode } from "../utils";

const site = createStorage();
const pages = createPageStorage();

const BARE = "<!DOCTYPE html><html><head><title>{{title}}</title></head><body>{{content}}</body></html>";

// Fill every occurrence of a placeholder: a template may use one more than once
// (a title belongs in <title> and again in og:title), and String.replace with a
// string pattern only ever does the first. The value is a function rather than
// a string because a string replacement reads $$, $& and $' in the page as
// patterns — "$$5" would publish as "$5".
function fill(html: string, name: string, value: () => string): string {
  return html.replace(new RegExp(`\\{\\{${name}\\}\\}`, "g"), value);
}

// The page's own address, for a canonical link and og:url. Behind a proxy the
// request's own URL names the container, so the forwarded headers win.
function pageUrl(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host;
  const proto = req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  return `${proto}://${host}${url.pathname}`;
}

// `layout: post` picks templates/post.html, else templates/site.html, else a
// bare one. The name is a plain word: a page can't reach out of templates/.
async function template(layout = ""): Promise<string> {
  for (const name of [/^[\w-]+$/.test(layout) ? layout : "", "site"]) {
    if (!name) continue;
    const key = `${TEMPLATES_PATH}${name}.html`;
    if (await site.exists(key)) return site.read(key);
  }
  return BARE;
}

export const handleSite = async (req: Request) => {
  const url = new URL(req.url);
  const path = decodeURIComponent(url.pathname).replace(/^\//, "") || "index.html";
  const name = path.replace(/\.html$/, "").replace(/\/$/, "") || "index";
  // A page, or the index of the folder of that name: /blog, /blog/ and
  // /blog/index.html all reach pages/blog/index.md.
  const key = await pages.exists(`${name}.md`) ? `${name}.md` : `${name}/index.md`;
  if (!await pages.exists(key)) {
    return new Response("Not Found", { status: 404 });
  }
  const file = key.replace(/\.md$/, "");

  const { content, meta } = renderMarkdown(await pages.read(key), file);
  const user = await getUser(req);
  // A draft is for whoever is signed in to the editor, and nobody else.
  if (yes(meta.draft) && !user) {
    return new Response("Not Found", { status: 404 });
  }

  const nav = markCurrent(await siteNav(pages), file);
  const themeCss = await loadThemeCss(pages, file);
  const description = meta.description?.[0] ?? "";

  // {{pages}} in a page lists the pages beside it (a blog index writes itself),
  // except in code, where it stays as written so a page can document the tag.
  let body = content;
  if (body.includes("{{pages}}")) {
    const list = await folderListing(pages, folderOf(file));
    body = outsideCode(body, (part) =>
      part.replace(/<p>\{\{pages\}\}<\/p>|\{\{pages\}\}/g, () => list));
  }

  let html = await template(meta.layout?.[0]);
  for (const [name, value] of [
    ["title", () => escapeHtml(meta.title?.[0] || "duckie")],
    ["theme", () => escapeHtml(meta.theme?.[0] || "")],
    ["url", () => escapeHtml(pageUrl(req))],
    ["description", () => description
      ? `<meta name="description" content="${escapeHtml(description)}">\n  <meta property="og:description" content="${escapeHtml(description)}">`
      : ""],
    ["nav", () => nav ? `<nav><ul class="nav">${nav}</ul></nav>` : ""],
    ["theme_css", () => themeCss ? `<style>${themeCss}</style>` : ""],
    ["edit", () => user ? `<a class="user-edit" href="/edit?path=${encodeURIComponent(key)}">Edit this page</a>` : ""],
    // Last, so a placeholder written in a page's own text is never filled in.
    ["content", () => body],
  ] as const) {
    html = fill(html, name, value);
  }

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
};
