import type { Storage } from "./storage";
import { DEBUG } from "./config";
import { escapeHtml, outsideCode } from "./utils";
import { parseFrontMatter, renderMarkdown } from "./markdown";
import { type Images, DEFAULT_IMAGES, ownImages, imageUrl, thumbName } from "./images";
import { SLUG, slugify, unique, slugger, itemHref } from "./slugs";

export { SLUG, slugify, aliasKey } from "./slugs";

// A collection is a folder of pages duckdown writes for you. The DATA is
// `collection.json`: the fields every item has, and groups of items. The
// PRESENTATION is pages, like everything else: an `each:` page beside it
// (works/item.md, `each: true`) is the page every item gets, at
// /<folder>/<slug>/, and any page with {{items}} is an overview. It is for the
// site that has four hundred paintings and no wish to write four hundred
// markdown files, each the same but for a filename and a caption — and that
// shows them more than one way, which is why the data can't own a template.
//
// The data is read through the storage layer like everything else, so a
// collection works on disk and in a bucket, and the images it names may live
// somewhere else entirely (an "images" base URL: a gallery's originals are
// usually far too big to keep in the site's own static/).

// --- Shape on disk -----------------------------------------------------

// Keys an item may carry that aren't fields: duckdown reads them itself.
const RESERVED = ["aliases", "slug"];

// What an item is made of, declared once at the top of the file:
// `fields: [{ "name": "title" }, { "name": "src", "kind": "image" }, …]`.
// The kind is what the editor offers for it; `image` is also the one field
// {{item-thumb}} and the overview's thumbnails are made from.
export const KINDS = ["text", "long", "image", "number"] as const;
export type Field = { name: string; kind: typeof KINDS[number]; label: string };

// Values every item answers to whatever its fields: {{item-slug}} and the rest.
const BUILT_IN = ["slug", "href", "thumb"];

// The page every item gets: an `each:` page's front matter and rendered
// markdown, with its {{item-…}} still in it. `key` is "" for the one a 0.4
// collection.json implies with its `layout`.
export type EachPage = { key: string; meta: Record<string, string[]>; content: string };

export type Group = {
  name: string;
  label: string;      // what a heading shows; the name when it says nothing else
  id: string;         // unique within the collection, for #links
  items: Item[];
  groups: Group[];    // subgroups, one level deep in practice, any depth here
};

export type Item = {
  slug: string;                     // [a-z0-9-], unique in the collection
  href: string;                     // "/works/battersea-1961/"
  key: string;                      // "works/battersea-1961/index.md" — its page key
  title: string;
  caption: string;
  src: string;                      // resolved URL of the original
  thumb: string;                    // resolved URL of the thumbnail
  fields: Record<string, string>;   // everything the item says, raw
  aliases: string[];                // addresses it used to answer at
  group: Group;                     // the innermost group it sits in
};

export type Collection = {
  folder: string;                   // "works" ("" at the site root)
  fields: Field[];                  // declared, or read off the items (0.4)
  declared: boolean;                // whether the file said them
  image: string;                    // the field that is the picture
  layout: string;                   // 0.4's item template; "" when unsaid
  each: EachPage | null;            // the page each item gets, when there is one
  images: Images;
  labels: Record<string, Record<string, string>>;
  groups: Group[];
  items: Item[];                    // flat, in order: the prev/next chain
  bySlug: Map<string, Item>;
  problems: string[];               // what was wrong with the file itself
};

export type ItemContext = { collection: Collection; item: Item };

export const COLLECTION_FILE = "collection.json";

// Where a folder's collection is written, as a key under pages/.
export const collectionPath = (folder: string) => `${folder ? `${folder}/` : ""}${COLLECTION_FILE}`;

// --- Slugs -------------------------------------------------------------

// What a slug is, and how an item gets one, live in slugs.ts: the editor's
// collection pane works them out too, and the two must never disagree.

// A value used as a fragment (#1967, #London): itself when it can be one, and
// a slug when it can't, so a heading's id and a template's href agree.
export function fragmentId(value: string): string {
  return /^[A-Za-z][\w.:-]*$/.test(value) ? value : slugify(value) || "x";
}

// --- Reading the file --------------------------------------------------

type Raw = Record<string, unknown>;

const text = (value: unknown): string | null =>
  typeof value === "string" ? value : typeof value === "number" ? String(value) : null;

function images(raw: unknown, problems: string[]): Images {
  if (raw === undefined) return ownImages();
  const said = typeof raw === "string" ? { src: raw } : raw as Raw;
  if (typeof said !== "object" || said === null || Array.isArray(said)) {
    problems.push(`"images" should be a base URL or an object, not ${JSON.stringify(raw)} — the default is used`);
    return ownImages();
  }
  const src = text(said.src) ?? DEFAULT_IMAGES.src;
  return {
    src,
    thumb: text(said.thumb) ?? src,
    suffix: text(said.suffix) ?? DEFAULT_IMAGES.suffix,
    extension: text(said.extension) ?? DEFAULT_IMAGES.extension,
  };
}

function asArray(value: unknown): Raw[] {
  return Array.isArray(value) ? value.filter((v): v is Raw => typeof v === "object" && v !== null) : [];
}

function fieldsOf(raw: unknown, problems: string[], where: string): Field[] | null {
  if (raw === undefined) return null;
  if (!Array.isArray(raw)) {
    problems.push(`${where}: "fields" should be a list of { "name", "kind" }`);
    return null;
  }
  const fields: Field[] = [];
  for (const entry of raw) {
    const said = (typeof entry === "string" ? { name: entry } : entry) as Raw | null;
    const name = text(said?.name);
    if (!name || !/^[\w-]+$/.test(name) || fields.some((f) => f.name === name)) {
      problems.push(`${where}: field ${JSON.stringify(entry)} needs a name of its own, in letters, digits, - and _`);
      continue;
    }
    let kind = text(said!.kind) ?? "text";
    if (!(KINDS as readonly string[]).includes(kind)) {
      problems.push(`${where}: field "${name}" is kind "${kind}", which isn't one of ${KINDS.join(", ")} — read as text`);
      kind = "text";
    }
    if (kind === "image" && fields.some((f) => f.kind === "image")) {
      problems.push(`${where}: "${name}" is a second image field — the first is the picture, this one is read as text`);
      kind = "text";
    }
    fields.push({ name, kind: kind as Field["kind"], label: text(said!.label) ?? name });
  }
  return fields;
}

function labelsOf(raw: unknown): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return out;
  for (const [field, values] of Object.entries(raw as Raw)) {
    if (typeof values !== "object" || values === null || Array.isArray(values)) continue;
    const map: Record<string, string> = {};
    for (const [value, label] of Object.entries(values as Raw)) {
      const said = text(label);
      if (said !== null) map[value] = said;
    }
    out[field] = map;
  }
  return out;
}

// The whole file, checked and filled in: slugs made, images resolved, groups
// flattened into the one order prev/next runs in.
export function parseCollection(folder: string, source: string): Collection {
  const problems: string[] = [];
  let raw: Raw = {};
  try {
    const parsed: unknown = JSON.parse(source);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      problems.push(`${collectionPath(folder)}: not an object`);
    } else {
      raw = parsed as Raw;
    }
  } catch (e) {
    problems.push(`${collectionPath(folder)}: ${(e as Error).message}`);
  }

  const where = collectionPath(folder);
  const picture = images(raw.images, problems);
  const declared = fieldsOf(raw.fields, problems, where);
  const collection: Collection = {
    folder,
    fields: declared ?? [],
    declared: declared !== null,
    image: declared ? declared.find((f) => f.kind === "image")?.name ?? "" : "src",
    layout: typeof raw.layout === "string" ? raw.layout : "",
    each: null,
    images: picture,
    labels: labelsOf(raw.labels),
    groups: [],
    items: [],
    bySlug: new Map(),
    problems,
  };

  const slugOf = slugger();
  const ids = new Set<string>();

  const readGroup = (rawGroup: Raw): Group => {
    const name = text(rawGroup.name) ?? "";
    const group: Group = {
      name,
      label: text(rawGroup.label) || name,
      id: unique(fragmentId(name || "group"), ids),
      items: [],
      groups: [],
    };
    for (const rawItem of asArray(rawGroup.items)) group.items.push(readItem(rawItem, group));
    for (const sub of asArray(rawGroup.groups)) group.groups.push(readGroup(sub));
    return group;
  };

  // Keys the items use that the file doesn't declare, said once each with a
  // count rather than once per item: four hundred lines is noise.
  const undeclared = new Map<string, number>();
  const readItem = (rawItem: Raw, group: Group): Item => {
    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawItem)) {
      if (key === "aliases") continue;
      const said = text(value);
      if (said !== null) fields[key] = said;
      if (RESERVED.includes(key)) continue;
      if (!declared) {
        if (!collection.fields.some((f) => f.name === key)) {
          collection.fields.push({ name: key, kind: key === "src" ? "image" : "text", label: key });
        }
      } else if (!declared.some((f) => f.name === key)) {
        undeclared.set(key, (undeclared.get(key) ?? 0) + 1);
      }
    }
    const title = fields.title ?? "";
    // A slug the file states has to be a slug; one that isn't is said so and
    // cleaned rather than served, because a bad address is the whole bug.
    if (fields.slug !== undefined && !SLUG.test(fields.slug)) {
      problems.push(`${collectionPath(folder)}: slug "${fields.slug}" isn't [a-z0-9-] — using "${slugify(fields.slug)}"`);
    }
    const slug = slugOf(fields.slug ?? null, title);
    const src = fields[collection.image] ?? "";
    const item: Item = {
      slug,
      href: itemHref(folder, slug),
      key: `${folder ? `${folder}/` : ""}${slug}/index.md`,
      title,
      caption: fields.caption ?? "",
      src: imageUrl(picture.src, src),
      thumb: src ? imageUrl(picture.thumb, thumbName(src, picture)) : "",
      fields: { ...fields, slug },
      aliases: (Array.isArray(rawItem.aliases) ? rawItem.aliases : []).flatMap((a) => text(a) ?? []),
      group,
    };
    collection.items.push(item);
    collection.bySlug.set(slug, item);
    return item;
  };

  for (const rawGroup of asArray(raw.groups)) collection.groups.push(readGroup(rawGroup));
  for (const [key, count] of undeclared) {
    problems.push(`${where}: ${count} item(s) say "${key}", which isn't one of the fields — declare it, or take it out`);
  }
  return collection;
}

// --- The cache ---------------------------------------------------------

// Kept like the nav and the search index: built once, and dropped when a page
// changes (the pages route writes collection.json through the same folder). In
// development it is read per request, where files are written straight to disk.
const loaded = new Map<string, Promise<Collection | null>>();

export function collectionsChanged(): void {
  loaded.clear();
  warned.clear();
}

// Said once, not per request: a warning repeated on every page view is noise.
const warned = new Set<string>();
function warnOnce(line: string): void {
  if (warned.has(line)) return;
  warned.add(line);
  console.warn(line);
}

// The each: page beside a collection: the page every item gets. Only this
// folder is looked in, because an item's address is this folder and its
// slug — one each: page, one set of addresses, and {{items}} knows where they
// are. The folder's index.md is its overview, never its each: page.
async function eachPageIn(pages: Storage, collection: Collection): Promise<EachPage | null> {
  const { folder, problems } = collection;
  const found: { key: string; meta: Record<string, string[]>; source: string }[] = [];
  for (const file of (await pages.list(folder)).files.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!file.name.endsWith(".md") || file.name === "index.md") continue;
    const key = file.path.replace(/^\//, "");
    const source = await pages.read(key);
    const { meta } = parseFrontMatter(source);
    if (!meta.each) continue;
    // `each: true` — its folder is its collection, so there is nothing to
    // name. The folder's own name is taken too; anything else is a page that
    // thinks it can serve another folder's works, and is told it can't.
    const said = meta.each[0]!.replace(/^\/+|\/+$/g, "");
    if (!["true", "yes", "", folder].includes(said)) {
      problems.push(`${key} says each: ${meta.each[0]} — an each: page makes pages for the collection in its own folder; write each: true`);
      continue;
    }
    found.push({ key, meta, source });
  }
  if (found.length > 1) {
    problems.push(`${found.map((f) => f.key).join(" and ")} are each: pages for one collection — ${found[0]!.key} is used`);
  }
  const first = found[0];
  if (first) return { key: first.key, meta: first.meta, content: renderMarkdown(first.source, first.key.replace(/\.md$/, "")).content };
  // 0.4's shape: the template named in the data. Honoured for one release,
  // as an each: page with nothing in it but that layout.
  if (collection.layout) {
    warnOnce(`${collectionPath(folder)}: "layout" in the data is going — write an each: page instead `
      + `(${folder ? `${folder}/` : ""}item.md, saying "each: true" and "layout: ${collection.layout}")`);
    return { key: "", meta: { layout: [collection.layout] }, content: "" };
  }
  return null;
}

async function read(pages: Storage, folder: string): Promise<Collection | null> {
  const key = collectionPath(folder);
  if (!await pages.exists(key)) return null;
  const collection = parseCollection(folder, await pages.read(key));
  collection.each = await eachPageIn(pages, collection);
  if (!collection.declared) warnOnce(`${key}: no "fields" — read off the items; declare them`);
  // Failures speak: a file the site can't read is a folder of missing pages,
  // and the log is where that gets noticed.
  for (const problem of collection.problems) console.error(problem);
  return collection;
}

export function loadCollection(pages: Storage, folder: string, debug = DEBUG): Promise<Collection | null> {
  if (debug) return read(pages, folder);
  const kept = loaded.get(folder);
  if (kept) return kept;
  const building = read(pages, folder).catch((e) => {
    loaded.delete(folder);
    throw e;
  });
  loaded.set(folder, building);
  return building;
}

// The item a request names, with the collection it belongs to, or null.
// `name` is the path with its extension and trailing slash already off
// ("works/battersea-1961"), so the folder is everything before the last
// segment and a collection may sit at any depth. One collection is asked —
// the one the address names — and a slug it doesn't hold is a miss, not an
// invitation to look for something like it somewhere else.
export async function itemAt(pages: Storage, name: string, debug = DEBUG): Promise<ItemContext | null> {
  const cut = name.lastIndexOf("/");
  const folder = cut < 0 ? "" : name.slice(0, cut);
  const slug = name.slice(cut + 1);
  if (!slug) return null;
  const collection = await loadCollection(pages, folder, debug);
  const item = collection?.each ? collection.bySlug.get(slug) : undefined;
  return collection && item ? { collection, item } : null;
}

// --- Where an item collides with a page --------------------------------

// An item's address is a folder with an index, so a page of the same name in
// the same folder is the same address twice — and the page wins, silently,
// leaving an item unreachable. One listing of the folder answers it for every
// item, rather than an exists() each (four hundred of those is four hundred
// round trips to a bucket).
export async function collisions(pages: Storage, collection: Collection): Promise<string[]> {
  if (!collection.items.length) return [];
  const { files, folders } = await pages.list(collection.folder);
  const each = collection.each?.key.split("/").pop();
  const taken = new Set([
    ...files.filter((f) => f.name.endsWith(".md") && f.name !== each).map((f) => f.name.replace(/\.md$/, "")),
    ...folders.map((f) => f.name),
  ]);
  return collection.items
    .filter((item) => taken.has(item.slug))
    .map((item) => `${collectionPath(collection.folder)}: "${item.title}" wants ${item.href}, `
      + `which is already a page — rename the item or give it a slug of its own`);
}

// Everything wrong with the collection in a folder, for the export's checks
// and for the editor's Notice: the file's own problems, and the addresses it
// can't have.
export async function collectionProblems(pages: Storage, folder: string, debug = DEBUG): Promise<string[]> {
  const collection = await loadCollection(pages, folder, debug);
  if (!collection) return [];
  return [...collection.problems, ...await collisions(pages, collection)];
}

// --- Rendering ---------------------------------------------------------

const img = (item: Item) => item.thumb
  ? `<img class="thumb" src="${escapeHtml(item.thumb)}" alt="${escapeHtml(item.title)}" loading="lazy">`
  : "";

// A thumbnail links to its item's page — when items have pages. A collection
// with no each: page is shown, not linked: a link that 404s is worse than none.
const thumbLink = (item: Item, linked: boolean) => {
  const inside = `${img(item)}<span class="item-title">${escapeHtml(item.title)}</span>`;
  return linked ? `<a class="item" href="${encodeURI(item.href)}">${inside}</a>` : `<span class="item">${inside}</span>`;
};

type Render = (item: Item) => string;

const grid = (items: Item[], render: Render) =>
  items.length ? `<div class="items">\n${items.map(render).join("\n")}\n</div>` : "";

function groupSection(group: Group, level: number, render: Render): string {
  const inside = [grid(group.items, render), ...group.groups.map((sub) => groupSection(sub, level + 1, render))].filter(Boolean);
  if (!inside.length) return "";
  const tag = `h${Math.min(level, 6)}`;
  return `<section class="group" id="${escapeHtml(group.id)}">\n`
    + `<${tag}>${escapeHtml(group.label)}</${tag}>\n${inside.join("\n")}\n</section>`;
}

// {{items}} — the collection's groups, each a grid of thumbnails.
// {{items by=<field>}} — one grid per distinct value of that field instead, in
// the order the values first appear, and an item whose value is "skip" is left
// out. That is how one collection is both /works (by year) and /prints (by the
// year it was printed), without a second copy of anything. `sort=asc` or
// `sort=desc` orders the groups by value instead — years as numbers, the rest
// as words — for a file written newest first that wants its overview oldest
// first. Items inside a group keep the file's order either way.
export function sortValues(values: string[], sort?: string): string[] {
  if (sort !== "asc" && sort !== "desc") return values;
  const numeric = values.every((v) => /^-?\d+(\.\d+)?$/.test(v));
  const sorted = [...values].sort((a, b) => numeric ? Number(a) - Number(b) : a.localeCompare(b));
  return sort === "desc" ? sorted.reverse() : sorted;
}

//
// `template=<name>` says how each item looks: templates/<name>.html, filled for
// every item with the same {{item-…}} an each: page takes — the overview's
// counterpart of the each: page's layout. Without it, a thumbnail and a title.
export function itemsHtml(collection: Collection, by?: string, sort?: string, template?: string): string {
  const linked = collection.each !== null;
  const render: Render = template === undefined
    ? (item) => thumbLink(item, linked)
    : (item) => fillItem(template, { collection, item });
  if (!by) {
    const sections = collection.groups.map((g) => groupSection(g, 2, render)).filter(Boolean);
    return sections.length ? `<div class="collection">\n${sections.join("\n")}\n</div>` : "";
  }
  const order: string[] = [];
  const buckets = new Map<string, Item[]>();
  for (const item of collection.items) {
    const value = item.fields[by];
    if (value === undefined || value === "" || value === SKIP) continue;
    if (!buckets.has(value)) { buckets.set(value, []); order.push(value); }
    buckets.get(value)!.push(item);
  }
  if (!order.length) {
    unknownField(collection, by, `{{items by=${by}}}`);
    return "";
  }
  const labels = collection.labels[by] ?? {};
  const sections = sortValues(order, sort).map((value) => {
    const label = labels[value];
    const heading = label ? `${value} - ${label}` : value;
    return `<section class="group" id="${escapeHtml(fragmentId(value))}">\n`
      + `<h2>${escapeHtml(heading)}</h2>\n${grid(buckets.get(value)!, render)}\n</section>`;
  });
  return `<div class="collection">\n${sections.join("\n")}\n</div>`;
}

// {{groups}} — the collection's section menu, each group linking to its first
// item, and the group the item on this page belongs to marked. On a page that
// is not an item it is the same menu with nothing marked, which is how a home
// page carries it.
function groupItems(group: Group): Item[] {
  return [...group.items, ...group.groups.flatMap(groupItems)];
}

function groupLinks(groups: Group[], linked: boolean, current?: Group): string {
  const items = groups.map((group) => {
    const first = linked ? groupItems(group)[0] : undefined;
    const mark = group === current ? ' aria-current="true"' : "";
    const label = escapeHtml(group.label);
    const link = first ? `<a href="${encodeURI(first.href)}"${mark}>${label}</a>` : `<span${mark}>${label}</span>`;
    const inside = group.groups.length ? `\n${groupLinks(group.groups, linked, current)}` : "";
    return `<li>${link}${inside}</li>`;
  });
  return `<ul>\n${items.join("\n")}\n</ul>`;
}

export function groupsHtml(collection: Collection, current?: Group): string {
  if (!collection.groups.length) return "";
  return `<nav class="groups" aria-label="Sections">\n${groupLinks(collection.groups, collection.each !== null, current)}\n</nav>`;
}

// The item before and after, in the order the file lists them, wrapping: a
// collection is a ring, so the last work's "next" is the first and a reader
// never reaches a dead end.
export function neighbour(collection: Collection, item: Item, step: 1 | -1): Item | null {
  const at = collection.items.indexOf(item);
  if (at < 0 || collection.items.length < 2) return null;
  return collection.items[(at + step + collection.items.length) % collection.items.length]!;
}

function link(item: Item | null, rel: "prev" | "next"): string {
  if (!item) return "";
  return `<a class="${rel}" rel="${rel}" href="${encodeURI(item.href)}">${escapeHtml(item.title)}</a>`;
}

// "skip" is the one value duckdown reads rather than shows: it keeps an item
// out of {{items by=<field>}}. A template writing href="/works/#{{item-index}}"
// would otherwise link to #skip, an anchor no overview has, so the value fills
// as nothing and the link lands at the top of the overview instead.
export const SKIP = "skip";

// A field a page or template asks for that the collection doesn't declare is
// a typo that would otherwise publish as nothing. Said once, in the log.
function unknownField(collection: Collection, field: string, where: string): void {
  if (!collection.declared || BUILT_IN.includes(field) || collection.fields.some((f) => f.name === field)) return;
  warnOnce(`${where}: ${collectionPath(collection.folder)} has no field "${field}"`);
}

// An item's value as text, unescaped: {{item-<field>}} for anything the item
// says (empty when unset, like an x- key; the picture field as its URL), and
// {{group}} — the label of the group it sits in.
export function itemText(name: string, { collection, item }: ItemContext): string {
  if (name === "group") return item.group.label;
  const field = name.slice("item-".length);
  unknownField(collection, field, `{{${name}}}`);
  if (field === collection.image) return item.src;
  if (field === "thumb") return item.thumb;
  if (field === "href") return item.href;
  const value = item.fields[field] ?? "";
  return value === SKIP ? "" : value;
}

// The same, escaped for HTML, plus {{prev}} and {{next}}, which are links.
export function itemValue(name: string, context?: ItemContext): string {
  if (!context) return "";
  const { collection, item } = context;
  if (name === "prev") return link(neighbour(collection, item, -1), "prev");
  if (name === "next") return link(neighbour(collection, item, 1), "next");
  return escapeHtml(itemText(name, context));
}

// Every item placeholder in some HTML: an each: page's body, or a template.
// Markdown percent-encodes braces in a link or an image's address, so
// `![x]({{item-src}})` arrives as %7B%7Bitem-src%7D%7D and is filled as well.
const ITEM_TAG = /\{\{(item-[\w-]+|prev|next|group)\}\}|%7B%7B(item-[\w-]+)%7D%7D/g;
export function fillItem(html: string, context?: ItemContext): string {
  return html.replace(ITEM_TAG, (_, name?: string, encoded?: string) => itemValue((name ?? encoded)!, context));
}

// An item page's front matter: the each: page's, with {{item-…}} filled in its
// title and description, and the item's own title and caption when it says
// neither. Unescaped: the page escapes them where it prints them.
export function itemMeta(context: ItemContext): Record<string, string[]> {
  const meta = { ...context.collection.each?.meta };
  const fill = (value: string) => value.replace(/\{\{(item-[\w-]+|group)\}\}/g, (_, name: string) => itemText(name, context));
  meta.title = [meta.title ? fill(meta.title[0]!) : context.item.title];
  meta.description = [meta.description ? fill(meta.description[0]!) : context.item.caption];
  return meta;
}

// An item page's body: the each: page's markdown, filled for this item,
// except inside <code> — where a guide prints the tag rather than using it.
export const itemBody = (context: ItemContext) =>
  outsideCode(context.collection.each?.content ?? "", (part) => fillItem(part, context));

// --- The placeholders in a page or a template --------------------------

const TAG = /\{\{(items|groups)((?:\s[^}]*)?)\}\}/g;

// {{items}}, {{items works}}, {{items by=prints}}, {{items works by=prints}}:
// a bare word is the collection to show (another folder's, so /prints can be
// an overview of /works), and key=value is an option.
export function parseArgs(args: string): { name?: string; options: Record<string, string> } {
  const options: Record<string, string> = {};
  let name: string | undefined;
  for (const token of args.trim().split(/\s+/).filter(Boolean)) {
    const cut = token.indexOf("=");
    if (cut < 0) name ??= token;
    else options[token.slice(0, cut)] = token.slice(cut + 1);
  }
  return { name, options };
}

// A placeholder alone on a line comes back from markdown as a paragraph of
// its own, and a grid of thumbnails inside a <p> is not a thing.
const WRAPPED = /<p>(\{\{(?:items|groups)(?:\s[^}]*)?\}\})<\/p>/g;

// Fill every {{items …}} and {{groups …}} in some HTML — a page's rendered
// markdown, or its template. `folder` is the page's own folder, which is the
// collection meant when a tag names none; on an item page it is that item's
// collection. Tags inside <code> are left as written, so the guide can print
// one instead of expanding it.
// `template` reads a template by name for `template=`, or null when there is
// none; the page supplies it, because templates are the site's, not pages'.
export async function fillCollections(
  html: string,
  o: { pages: Storage; folder: string; context?: ItemContext; debug?: boolean; template?: (name: string) => Promise<string | null> },
): Promise<string> {
  if (!html.includes("{{")) return html;
  const parts = html.split(/(<code[^>]*>[\s\S]*?<\/code>)/);
  const tags = parts.filter((_, i) => i % 2 === 0).flatMap((part) => [...part.matchAll(TAG)]);
  if (!tags.length) return html;

  const done = new Map<string, string>();
  for (const [whole, tag, args] of tags) {
    if (done.has(whole)) continue;
    const { name, options } = parseArgs(args ?? "");
    const folder = name ?? o.context?.collection.folder ?? o.folder;
    const collection = folder === o.context?.collection.folder
      ? o.context!.collection
      : await loadCollection(o.pages, folder, o.debug);
    if (!collection) {
      console.error(`{{${tag}${args}}}: there is no ${collectionPath(folder)} — filled as nothing`);
      done.set(whole, "");
      continue;
    }
    const current = collection === o.context?.collection ? o.context.item.group : undefined;
    if (tag === "groups") {
      done.set(whole, groupsHtml(collection, current));
      continue;
    }
    let template: string | undefined;
    if (options.template !== undefined) {
      template = await o.template?.(options.template) ?? undefined;
      if (template === undefined) console.error(`{{${tag}${args}}}: there is no templates/${options.template}.html — the built-in thumbnails are used`);
    }
    done.set(whole, itemsHtml(collection, options.by, options.sort, template));
  }

  const fill = (part: string) => part
    .replace(WRAPPED, (_, whole: string) => done.get(whole) ?? whole)
    .replace(TAG, (whole) => done.get(whole) ?? whole);
  return parts.map((part, i) => (i % 2 ? part : fill(part))).join("");
}
