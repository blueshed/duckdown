import { TEMPLATES_PATH } from "../config";
import { createPageStorage, createStorage } from "../storage";
import { renderMarkdown, buildNav, loadThemeCss } from "../markdown";

const site = createStorage();
const pages = createPageStorage();

export const handleSite = async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\//, "") || "index.html";
  const file = path.replace(/\.html$/, "") || "index";
  const mdKey = `${file}.md`;

  if (!await pages.exists(mdKey)) {
    return new Response("Not Found", { status: 404 });
  }

  const raw = await pages.read(mdKey);
  const { content, meta } = renderMarkdown(raw);
  const nav = await buildNav(pages);
  const themeCss = await loadThemeCss(pages, file);

  const tmplKey = `${TEMPLATES_PATH}site.html`;
  const tmpl = await site.exists(tmplKey)
    ? await site.read(tmplKey)
    : "<!DOCTYPE html><html><head><title>{{title}}</title></head><body>{{content}}</body></html>";

  const html = tmpl
    .replace("{{title}}", meta.title?.[0] || "duckie")
    .replace("{{theme}}", meta.theme?.[0] || "")
    .replace("{{nav}}", nav ? `<nav><ul class="nav">${nav}</ul></nav>` : "")
    .replace("{{theme_css}}", themeCss ? `<style>${themeCss}</style>` : "")
    .replace("{{content}}", content);

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
};
