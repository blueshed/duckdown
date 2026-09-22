import type { Storage } from "./storage";
import { DEBUG } from "./config";
import { escapeHtml } from "./utils";
import { type Images, DEFAULT_IMAGES, ownImages, imageUrl, thumbName } from "./images";

// A collection is a folder of pages duckdown writes for you: `collection.json`
// beside a folder's index.md lists groups of items, and each item becomes a
// page at /<folder>/<slug>/ rendered through a template. It is for the site
// that has four hundred paintings and no wish to write four hundred markdown
// files, each the same but for a filename and a caption.
//
// The data is read through the storage layer like everything else, so a
// collection works on disk and in a bucket, and the images it names may live
// somewhere else entirely (an "images" base URL: a gallery's originals are
// usually far too big to keep in the site's own static/).

// --- Shape on disk -----------------------------------------------------

// Every key duckdown itself reads. Anything else on an item is one of its
// fields, addressable as {{item-<field>}} and groupable with {{items by=…}}.
const RESERVED = ["aliases"];

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
  layout: string;                   // the template an item wears: "item"
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

// The only shape a slug ever has. Item addresses are built from titles, and a
// title may hold quotes, backticks, curly apostrophes and accents; a slug that
// kept any of those would be percent-encoded in the browser's request and
// compared against its unencoded self, which is how a gallery ends up serving
// the wrong painting with a 200. So: fold the accents, keep letters and
// digits, and let everything else be a dash.
export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function slugify(text: string): string {
  return text
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")   // Café Ölé → Cafe Ole
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// A value used as a fragment (#1967, #London): itself when it can be one, and
// a slug when it can't, so a heading's id and a template's href agree.
export function fragmentId(value: string): string {
  return /^[A-Za-z][\w.:-]*$/.test(value) ? value : slugify(value) || "x";
}

// --- Addresses ---------------------------------------------------------

// An address reduced to the one form aliases are compared in: decoded (the
// caller's job, decodePath), rooted, and without the trailing slash or .html
// that name the same place. A legacy address may hold anything a URL can
// carry — `/l"etoile-1976` — which is exactly why it is compared decoded.
export function aliasKey(path: string): string {
  const trimmed = path.replace(/\.html$/, "").replace(/\/+$/, "");
  return trimmed.startsWith("/") ? trimmed || "/" : `/${trimmed}`;
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

  const picture = images(raw.images, problems);
  const collection: Collection = {
    folder,
    layout: typeof raw.layout === "string" ? raw.layout : "item",
    images: picture,
    labels: labelsOf(raw.labels),
    groups: [],
    items: [],
    bySlug: new Map(),
    problems,
  };

  const slugs = new Set<string>();
  const ids = new Set<string>();
  const unique = (base: string, taken: Set<string>) => {
    let name = base;
    for (let i = 1; taken.has(name); i++) name = `${base}-${i}`;
    taken.add(name);
    return name;
  };

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

  const readItem = (rawItem: Raw, group: Group): Item => {
    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawItem)) {
      if (RESERVED.includes(key)) continue;
      const said = text(value);
      if (said !== null) fields[key] = said;
    }
    const title = fields.title ?? "";
    // A slug the file states has to be a slug; one that isn't is said so and
    // cleaned rather than served, because a bad address is the whole bug.
    let slug = "";
    if (fields.slug !== undefined) {
      if (SLUG.test(fields.slug)) slug = fields.slug;
      else {
        problems.push(`${collectionPath(folder)}: slug "${fields.slug}" isn't [a-z0-9-] — using "${slugify(fields.slug)}"`);
        slug = slugify(fields.slug);
      }
    }
    // Nothing usable in the title (a work called "…"): a number by position,
    // which is stable as long as the item stays where it is.
    slug = unique(slug || slugify(title) || `item-${collection.items.length + 1}`, slugs);
    const src = fields.src ?? "";
    const item: Item = {
      slug,
      href: `/${folder ? `${folder}/` : ""}${slug}/`,
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
  return collection;
}

// --- The cache ---------------------------------------------------------

// Kept like the nav and the search index: built once, and dropped when a page
// changes (the pages route writes collection.json through the same folder). In
// development it is read per request, where files are written straight to disk.
const loaded = new Map<string, Promise<Collection | null>>();

export function collectionsChanged(): void {
  loaded.clear();
}

async function read(pages: Storage, folder: string): Promise<Collection | null> {
  const key = collectionPath(folder);
  if (!await pages.exists(key)) return null;
  const collection = parseCollection(folder, await pages.read(key));
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
  const item = collection?.bySlug.get(slug);
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
  const taken = new Set([
    ...files.filter((f) => f.name.endsWith(".md")).map((f) => f.name.replace(/\.md$/, "")),
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

const thumbLink = (item: Item) =>
  `<a class="item" href="${encodeURI(item.href)}">${img(item)}<span class="item-title">${escapeHtml(item.title)}</span></a>`;

const grid = (items: Item[]) =>
  items.length ? `<div class="items">\n${items.map(thumbLink).join("\n")}\n</div>` : "";

function groupSection(group: Group, level: number): string {
  const inside = [grid(group.items), ...group.groups.map((sub) => groupSection(sub, level + 1))].filter(Boolean);
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

export function itemsHtml(collection: Collection, by?: string, sort?: string): string {
  if (!by) {
    const sections = collection.groups.map((g) => groupSection(g, 2)).filter(Boolean);
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
  if (!order.length) return "";
  const labels = collection.labels[by] ?? {};
  const sections = sortValues(order, sort).map((value) => {
    const label = labels[value];
    const heading = label ? `${value} - ${label}` : value;
    return `<section class="group" id="${escapeHtml(fragmentId(value))}">\n`
      + `<h2>${escapeHtml(heading)}</h2>\n${grid(buckets.get(value)!)}\n</section>`;
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

function groupLinks(groups: Group[], current?: Group): string {
  const items = groups.map((group) => {
    const first = groupItems(group)[0];
    const mark = group === current ? ' aria-current="true"' : "";
    const label = escapeHtml(group.label);
    const link = first ? `<a href="${encodeURI(first.href)}"${mark}>${label}</a>` : `<span${mark}>${label}</span>`;
    const inside = group.groups.length ? `\n${groupLinks(group.groups, current)}` : "";
    return `<li>${link}${inside}</li>`;
  });
  return `<ul>\n${items.join("\n")}\n</ul>`;
}

export function groupsHtml(collection: Collection, current?: Group): string {
  if (!collection.groups.length) return "";
  return `<nav class="groups" aria-label="Sections">\n${groupLinks(collection.groups, current)}\n</nav>`;
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

// What an item page fills in that an ordinary page doesn't: {{item-<field>}}
// for anything the item says (escaped, empty when unset, like an x- key),
// {{prev}} and {{next}}, and {{group}} — the label of the group it sits in.
export function itemValue(name: string, context?: { collection: Collection; item: Item }): string {
  if (!context) return "";
  const { collection, item } = context;
  if (name === "prev") return link(neighbour(collection, item, -1), "prev");
  if (name === "next") return link(neighbour(collection, item, 1), "next");
  if (name === "group") return escapeHtml(item.group.label);
  const field = name.slice("item-".length);
  if (field === "src") return escapeHtml(item.src);
  if (field === "thumb") return escapeHtml(item.thumb);
  if (field === "href") return escapeHtml(item.href);
  const value = item.fields[field] ?? "";
  return escapeHtml(value === SKIP ? "" : value);
}

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
export async function fillCollections(
  html: string, o: { pages: Storage; folder: string; context?: ItemContext; debug?: boolean },
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
    done.set(whole, tag === "items" ? itemsHtml(collection, options.by, options.sort) : groupsHtml(collection, current));
  }

  const fill = (part: string) => part
    .replace(WRAPPED, (_, whole: string) => done.get(whole) ?? whole)
    .replace(TAG, (whole) => done.get(whole) ?? whole);
  return parts.map((part, i) => (i % 2 ? part : fill(part))).join("");
}
