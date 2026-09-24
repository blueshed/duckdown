import { TEMPLATES_PATH } from "./config";
import { createPageStorage, createStorage } from "./storage";
import { renderMarkdown, folderOf } from "./markdown";
import { siteNav, markCurrent, folderListing, siteMap } from "./nav";
import { feedLink } from "./feed";
import { fillCollections, fillItem, itemMeta, itemBody, type ItemContext } from "./collection";
import { escapeHtml, outsideCode, canonicalPath, dateHtml } from "./utils";

const site = createStorage();
const pages = createPageStorage();

const BARE = "<!DOCTYPE html><html><head><title>{{title}}</title></head><body>{{content}}</body></html>";

// A plain word: letters, digits, dash, underscore. `layout:` and `css:` each
// name a file in a folder a page must not be able to climb out of, and one
// guard in one place is one thing to get right.
export const plainName = (value: string) => /^[\w-]+$/.test(value);

// `image:` as an absolute address, for a card: a full URL as it is, a path
// on the site ("/static/images/cover.jpg") or one under static/
// ("images/cover.jpg") after the origin. Nothing without an origin — a card's
// picture must be absolute — and nothing that climbs out with "..". Characters
// a URL can't hold are encoded, and an escape already made is left alone (an
// item's picture arrives encoded).
export function pictureUrl(value: string, origin: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  if (!value || !origin || value.split("/").includes("..")) return "";
  const path = value.startsWith("/") ? value : `/static/${value}`;
  return origin + path.replace(/[^\w\-.~:/?#[\]@!$&'()*+,;=%]/g, encodeURIComponent);
}

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

// {{include name}} pulls templates/name.html into a template — the seed's
// search form and nav wrapper, shared by site.html and post.html, instead of
// pasted into each. Resolved once, over the template as chosen, before
// anything else is filled: an include can use {{nav}}, {{x-anything}} and the
// rest, because those substitutions run over the merged result afterward. Not
// resolved inside what it pulls in — an {{include}} inside an included file
// is left as written, so a template can document the tag without writing a
// loop. A name that isn't plain, or names a file that isn't there, fills as
// nothing: a broken include should not take the whole page down, but it
// should not fail silently either, so it is logged (failures speak).
async function resolveIncludes(body: string, draft?: DraftTemplate): Promise<{ html: string; includes: string[] }> {
  const includes: string[] = [];
  const names = new Set([...body.matchAll(/\{\{include ([^}]*)\}\}/g)].map((m) => m[1]!.trim()));
  if (!names.size) return { html: body, includes };

  const resolved = new Map<string, string>();
  for (const name of names) {
    const file = `${name}.html`;
    if (!plainName(name)) {
      console.error(`{{include ${name}}}: not a plain name — filled as nothing`);
      resolved.set(name, "");
      continue;
    }
    // The same draft mechanism templateFor uses for the page's own template:
    // an unsaved templates/topbar.html shows in the preview of any page whose
    // template includes it, not only the page wearing it as a layout.
    if (draft?.name === file) {
      resolved.set(name, draft.body);
      includes.push(file);
      continue;
    }
    const key = `${TEMPLATES_PATH}${file}`;
    if (await site.exists(key)) {
      resolved.set(name, await site.read(key));
      includes.push(file);
    } else {
      console.error(`{{include ${name}}}: templates/${file} doesn't exist — filled as nothing`);
      resolved.set(name, "");
    }
  }
  const html = body.replace(/\{\{include ([^}]*)\}\}/g, (_, name: string) => resolved.get(name.trim()) ?? "");
  return { html, includes };
}

// {{items template=tile}}: templates/tile.html, the look of one item in an
// overview — or the unsaved copy, when that is the template open in the editor.
async function itemTemplate(name: string, draft?: DraftTemplate): Promise<string | null> {
  if (!plainName(name)) return null;
  if (draft?.name === `${name}.html`) return draft.body;
  const key = `${TEMPLATES_PATH}${name}.html`;
  return await site.exists(key) ? site.read(key) : null;
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

// An item of a collection, as a page: the collection's each: page, filled for
// this item — its body, its front matter, and the template its layout: names.
// Its key is the folder-with-an-index its address resolves to, so
// canonicalPath, the nav's marking and the export's outPath all treat it as
// the page it is.
export function itemPage(context: ItemContext): Page {
  const { item } = context;
  return { key: item.key, file: item.key.replace(/\.md$/, ""), content: itemBody(context), meta: itemMeta(context) };
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
  // This page is an item of a collection: what {{item-…}}, {{prev}}, {{next}}
  // and {{group}} are filled from. The site route, the preview and the export
  // each look the item up and hand it over here, so all three render it the
  // same way they render a page written by hand.
  item?: ItemContext;
};

// The whole document: the page's markdown inside the template it asks for,
// with everything the site knows about it filled in. The editor's preview goes
// through here too, which is what makes it a preview rather than a likeness.
export async function pageHtml(page: Page, o: PageOptions): Promise<{ html: string; layout: string; includes: string[] }> {
  const { file, meta } = page;
  const nav = markCurrent(await siteNav(pages), file);
  const title = meta.title?.[0] || "duckie";
  const description = meta.description?.[0] ?? "";

  // {{pages}} in a page lists the pages beside it (a blog index writes itself),
  // except in code, where it stays as written so a page can document the tag.
  // {{sitemap}} is the same for the whole site, nested by folder.
  let body = page.content;
  for (const [tag, list] of [["pages", () => folderListing(pages, folderOf(file))], ["sitemap", () => siteMap(pages)]] as const) {
    if (!body.includes(`{{${tag}}}`)) continue;
    const html = await list();
    body = outsideCode(body, (part) =>
      part.replace(new RegExp(`<p>\\{\\{${tag}\\}\\}</p>|\\{\\{${tag}\\}\\}`, "g"), () => html));
  }
  // {{items}} and {{groups}} are the same idea over a collection.json: an
  // overview page writes itself from the data, here or in a template. A bare
  // tag means the collection `collection:` names, else the page's own folder's.
  const named = meta.collection?.[0]?.replace(/^\/+|\/+$/g, "");
  const collection = { pages, folder: named ?? folderOf(file), context: o.item, template: (name: string) => itemTemplate(name, o.draft) };
  body = await fillCollections(body, collection);

  const template = o.through === undefined
    ? await templateFor(meta.layout?.[0], o.draft)
    : { name: "", body: o.through };
  const { html: withIncludes, includes } = await resolveIncludes(template.body, o.draft);
  // The page's own x- keys, for a template that varies by page (a cover image,
  // a buy link) without a copy per page. Escaped like the title, empty when
  // the page doesn't say, and before {{content}} so page text is never filled.
  let html = withIncludes.replace(/\{\{(x-[\w-]+)\}\}/g, (_, key: string) => escapeHtml(meta[key.toLowerCase()]?.[0] ?? ""));
  // A template may carry the collection's own tags too: {{groups}} for the
  // section menu, and — on the template an item wears — {{item-<field>}} for
  // anything the item says, {{prev}}, {{next}} and {{group}}. Escaped and
  // empty when unset, like the x- keys, and before {{content}} for the same
  // reason: a placeholder written in a page's text is never filled.
  html = await fillCollections(html, collection);
  html = fillItem(html, o.item);
  // No origin (an export without DUCKDOWN_ORIGIN) means no feed is written,
  // so there is none to link to.
  const feed = o.origin && html.includes("{{feed}}") ? await feedLink(pages, folderOf(file)) : "";
  for (const [name, value] of [
    ["title", () => escapeHtml(title)],
    ["url", () => escapeHtml(o.origin + canonicalPath(page.key))],
    ["date", () => dateHtml(meta.date?.[0] ?? "")],
    // The page's description, and the card a link to it shows when shared:
    // Open Graph, which most places that unfurl a link read. Addresses in it
    // are absolute, so without an origin (an export with no DUCKDOWN_ORIGIN)
    // the URL and the picture are left out rather than written relative.
    ["description", () => {
      const picture = pictureUrl(meta.image?.[0] ?? "", o.origin);
      const tag = (attr: string, name: string, value: string) => `<meta ${attr}="${name}" content="${escapeHtml(value)}">`;
      return [
        ...(description ? [tag("name", "description", description), tag("property", "og:description", description)] : []),
        tag("property", "og:title", title),
        tag("property", "og:type", meta.date ? "article" : "website"),
        ...(o.origin ? [tag("property", "og:url", o.origin + encodeURI(canonicalPath(page.key)))] : []),
        ...(picture ? [tag("property", "og:image", picture), tag("name", "twitter:card", "summary_large_image")] : []),
      ].join("\n  ");
    }],
    ["nav", () => nav ? `<nav><ul class="nav">${nav}</ul></nav>` : ""],
    // The feed of the folder this page is in, for a reader's browser to find.
    ["feed", () => feed],
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

  // What the page wears, for the editor: the template it settled on, and any
  // include that came from a real file, so ResourcePane can say a draft
  // template will show — whether the page wears it directly or through one
  // of these.
  return { html, layout: template.name, includes };
}
