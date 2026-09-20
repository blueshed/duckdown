import { TEMPLATES_PATH } from "../config";
import { createPageStorage, createStorage } from "../storage";
import { renderMarkdown, loadThemeCss, folderOf, yes } from "../markdown";
import { siteNav, markCurrent, folderListing } from "../nav";
import { getUser } from "../auth";
import { escapeHtml, outsideCode } from "../utils";

const site = createStorage();
const pages = createPageStorage();

const BARE = "<!DOCTYPE html><html><head><title>{{title}}</title></head><body>{{content}}</body></html>";

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

  // Replacer functions, not strings: a string replacement reads $$, $& and $'
  // in the page as patterns, so "$$5" would publish as "$5" (the preview,
  // built another way, would still show "$$5").
  const html = (await template(meta.layout?.[0]))
    .replace("{{title}}", () => escapeHtml(meta.title?.[0] || "duckie"))
    .replace("{{theme}}", () => escapeHtml(meta.theme?.[0] || ""))
    .replace("{{description}}", () => description
      ? `<meta name="description" content="${escapeHtml(description)}">\n  <meta property="og:description" content="${escapeHtml(description)}">`
      : "")
    .replace("{{nav}}", () => nav ? `<nav><ul class="nav">${nav}</ul></nav>` : "")
    .replace("{{theme_css}}", () => themeCss ? `<style>${themeCss}</style>` : "")
    .replace("{{edit}}", () => user ? `<a class="user-edit" href="/edit?path=${encodeURIComponent(key)}">Edit this page</a>` : "")
    .replace("{{content}}", () => body);

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
};
