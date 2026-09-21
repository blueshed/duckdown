import { TEMPLATES_PATH } from "./config";
import { createPageStorage, createStorage } from "./storage";
import { renderMarkdown, folderOf } from "./markdown";
import { siteNav, markCurrent, folderListing } from "./nav";
import { escapeHtml, outsideCode, canonicalPath, dateHtml } from "./utils";

const site = createStorage();
const pages = createPageStorage();

const BARE = "<!DOCTYPE html><html><head><title>{{title}}</title></head><body>{{content}}</body></html>";

// A plain word: letters, digits, dash, underscore. `layout:` and `css:` each
// name a file in a folder a page must not be able to climb out of, and one
// guard in one place is one thing to get right.
export const plainName = (value: string) => /^[\w-]+$/.test(value);

// A file open in the editor and not yet saved, used in place of the one on
// disk. It is how the preview shows you a template while you are writing it.
export type DraftTemplate = { name: string; body: string };

// `layout: post` picks templates/post.html, else templates/site.html, else a
// bare one. Says which it settled on, so the editor can tell you when the
// template you have open is not the one this page is wearing.
export async function templateFor(layout = "", draft?: DraftTemplate): Promise<{ name: string; body: string }> {
  for (const name of plainName(layout) ? [`${layout}.html`, "site.html"] : ["site.html"]) {
    if (draft?.name === name) return { name, body: draft.body };
    const key = `${TEMPLATES_PATH}${name}`;
    if (await site.exists(key)) return { name, body: await site.read(key) };
  }
  return { name: "", body: BARE };
}

// Fill every occurrence of a placeholder: a template may use one more than once
// (a title belongs in <title> and again in og:title), and String.replace with a
// string pattern only ever does the first. The value is a function rather than
// a string because a string replacement reads $$, $& and $' in the page as
// patterns — "$$5" would publish as "$5".
function fill(html: string, name: string, value: () => string): string {
  return html.replace(new RegExp(`\\{\\{${name}\\}\\}`, "g"), value);
}

export type Page = {
  key: string;      // where it lives: "blog/a-post.md"
  file: string;     // the same without .md, which is what links are built from
  content: string;  // the rendered markdown
  meta: Record<string, string[]>;
};

// Cheap, and separate from the rest on purpose: the site route reads the front
// matter to decide whether a draft is anyone's business before it goes to the
// trouble of building the nav and reading a template.
export function parsePage(key: string, source: string): Page {
  const file = key.replace(/\.md$/, "");
  const { content, meta } = renderMarkdown(source, file);
  return { key, file, content, meta };
}

export type PageOptions = {
  origin: string;        // scheme and host, for the canonical URL
  editHref?: string;     // where {{edit}} points, when there is somewhere
  // Two different questions the editor asks. `draft` is "this template is
  // open and unsaved — use my copy if this page wears it", which is how a
  // page reshapes itself while you edit its template, and leaves a page that
  // wears another one alone. `through` is "render this page in exactly this
  // template", which is how a template can be previewed with no page open.
  draft?: DraftTemplate;
  through?: string;
};

// The whole document: the page's markdown inside the template it asks for,
// with everything the site knows about it filled in. The editor's preview goes
// through here too, which is what makes it a preview rather than a likeness.
export async function pageHtml(page: Page, o: PageOptions): Promise<{ html: string; layout: string }> {
  const { file, meta } = page;
  const nav = markCurrent(await siteNav(pages), file);
  const description = meta.description?.[0] ?? "";

  // {{pages}} in a page lists the pages beside it (a blog index writes itself),
  // except in code, where it stays as written so a page can document the tag.
  let body = page.content;
  if (body.includes("{{pages}}")) {
    const list = await folderListing(pages, folderOf(file));
    body = outsideCode(body, (part) =>
      part.replace(/<p>\{\{pages\}\}<\/p>|\{\{pages\}\}/g, () => list));
  }

  const template = o.through === undefined
    ? await templateFor(meta.layout?.[0], o.draft)
    : { name: "", body: o.through };
  let html = template.body;
  for (const [name, value] of [
    ["title", () => escapeHtml(meta.title?.[0] || "duckie")],
    ["url", () => escapeHtml(o.origin + canonicalPath(page.key))],
    ["date", () => dateHtml(meta.date?.[0] ?? "")],
    ["description", () => description
      ? `<meta name="description" content="${escapeHtml(description)}">\n  <meta property="og:description" content="${escapeHtml(description)}">`
      : ""],
    ["nav", () => nav ? `<nav><ul class="nav">${nav}</ul></nav>` : ""],
    // A stylesheet this page asked for by name: `css: poster` links
    // /static/poster.css after whatever the template links, so one page can
    // look however it likes without a template of its own. Guarded like
    // `layout`, so a page can't reach out of static/.
    ["css", () => {
      const sheet = meta.css?.[0] ?? "";
      return plainName(sheet) ? `<link rel="stylesheet" href="/static/${sheet}.css">` : "";
    }],
    ["edit", () => o.editHref ? `<a class="user-edit" href="${escapeHtml(o.editHref)}">Edit this page</a>` : ""],
    // Last, so a placeholder written in a page's own text is never filled in.
    ["content", () => body],
  ] as const) {
    html = fill(html, name, value);
  }

  return { html, layout: template.name };
}
