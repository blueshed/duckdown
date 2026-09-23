import type { Storage } from "./storage";
import { DEBUG } from "./config";
import { canonicalPath } from "./utils";

// Front-matter parser + Bun.markdown wrapper

export interface MarkdownResult {
  content: string;
  meta: Record<string, string[]>;
  body: string;
}

// The keys duckdown reads. A bare block at the top of a page may only use
// these (or an x- extension of your own), so a page that opens "Update: closed
// Monday" keeps its first line instead of losing it to metadata. For any other
// key, fence the block with --- … --- , which takes whatever you put in it.
const KEYS = ["title", "nav", "toc", "layout", "css", "description", "draft", "date", "order", "aliases", "each", "collection"];
const isKey = (key: string) => KEYS.includes(key) || key.startsWith("x-");

export function parseFrontMatter(source: string): { meta: Record<string, string[]>; body: string } {
  const meta: Record<string, string[]> = {};
  const lines = source.split("\n");
  const fenced = lines[0]?.trim() === "---";
  let closed = !fenced;
  let i = fenced ? 1 : 0;

  while (i < lines.length) {
    const line = lines[i]!;
    if (fenced && line.trim() === "---") {
      closed = true;
      i++;
      break;
    }
    if (fenced && line.trim() === "") {
      i++;
      continue;
    }
    const match = line.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
    const key = match?.[1]!.toLowerCase();
    if (!match || (!fenced && !isKey(key!))) break;
    meta[key!] = [...(meta[key!] ?? []), match[2]!.trim()];
    i++;
  }

  // A fence nobody closed isn't front matter: the page keeps every line.
  if (!closed) return { meta: {}, body: source };
  if (lines[i]?.trim() === "") i++; // the blank line that ends the block

  const body = fenced || Object.keys(meta).length > 0 ? lines.slice(i).join("\n") : source;
  return { meta, body };
}

// Render a page. `path` is where it lives ("guide/pages", or "guide/pages.md"),
// which its [[wiki links]] are relative to.
export function renderMarkdown(source: string, path = ""): MarkdownResult {
  const { meta, body } = parseFrontMatter(source);
  let content = Bun.markdown.html(body, {
    tables: true,
    strikethrough: true,
    tasklists: true,
    autolinks: true,
    wikiLinks: true,
    headings: { ids: true, autolink: true }, // <h2 id="x"><a href="#x">…</a></h2>
  });
  content = wikiLinks(callouts(content), folderOf(path));
  if (yes(meta.toc)) content = withContents(content);
  return { content, meta, body };
}

// A front-matter switch: `toc: true`, `draft: yes`.
export function yes(value?: string[]): boolean {
  return ["true", "yes"].includes(value?.[0] ?? "");
}

// The folder part of a page path: "guide/pages" → "guide", "index" → "".
export function folderOf(path: string): string {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}

// GitHub's alerts: a quote that opens with [!NOTE] (or TIP, IMPORTANT, WARNING,
// CAUTION) becomes a titled callout. Anywhere else it still reads as a quote.
function callouts(html: string): string {
  return html.replace(
    /<blockquote>\s*<p>\[!(note|tip|important|warning|caution)\]\s*(<\/p>)?/gi,
    (_, kind: string, closed?: string) => {
      const k = kind.toLowerCase();
      const title = k[0]!.toUpperCase() + k.slice(1);
      return `<blockquote class="callout ${k}"><p class="callout-title">${title}</p>${closed ? "" : "<p>"}`;
    },
  );
}

// [[page]], [[page|label]], [[page#heading]], [[#heading]]: Bun marks these up
// as <x-wikilink>; make them links, resolved like any relative link (from the
// page's folder, or from the root with a leading /), with .html added.
function wikiLinks(html: string, dir: string): string {
  return html.replace(/<x-wikilink data-target="([^"]*)">(.*?)<\/x-wikilink>/g, (_, target: string, label: string) => {
    const [page = "", heading] = target.split("#");
    const hash = heading ? `#${heading}` : "";
    if (!page) return `<a class="wikilink" href="${hash}">${label}</a>`;
    const path = page.startsWith("/") ? page : `/${dir ? `${dir}/` : ""}${page}`;
    return `<a class="wikilink" href="${encodeURI(`${path.replace(/\.md$/, "")}.html`)}${hash}">${label}</a>`;
  });
}

// toc: true — a contents list of the page's h2 and h3 headings, just after its
// title (the first h1), or at the top if it has none.
function withContents(html: string): string {
  const items = [...html.matchAll(/<h([23]) id="([^"]+)">(.*?)<\/h\1>/g)].map(
    ([, level, id, inner]) => `<li class="toc-h${level}"><a href="#${id}">${inner!.replace(/<[^>]+>/g, "")}</a></li>`,
  );
  if (!items.length) return html;
  const toc = `<nav class="toc" aria-label="Contents"><ul>\n${items.join("\n")}\n</ul></nav>`;
  const end = html.indexOf("</h1>");
  return end < 0 ? `${toc}\n${html}` : `${html.slice(0, end + 5)}\n${toc}${html.slice(end + 5)}`;
}

// A folder's order: (a whole number on its own index.md), for sorting it
// among its siblings: numbered folders first, ascending, then everything
// else alphabetical by name — so a site that never sets it sees no change.
// Not a whole number: ignored (treated as unset) and, per "failures speak",
// logged once in development, where a content author would see it.
export async function folderOrder(pages: Storage, path: string): Promise<number> {
  const key = `${path}/index.md`;
  if (!await pages.exists(key)) return Infinity;
  const raw = parseFrontMatter(await pages.read(key)).meta.order?.[0];
  if (raw === undefined) return Infinity;
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    if (DEBUG) console.error(`order: "${raw}" on ${key} isn't a whole number — ignored`);
    return Infinity;
  }
  return n;
}

// The nav, {{sitemap}} and any other listing of folders sort them the same
// way: by folderOrder(), then by name, so a folder without order: still
// sorts alphabetically among the others without one.
export async function sortFolders<T extends { name: string; path: string }>(
  pages: Storage, folders: T[],
): Promise<T[]> {
  const withOrder = await Promise.all(
    folders.map(async (f) => ({ f, order: await folderOrder(pages, f.path.replace(/^\//, "")) })),
  );
  withOrder.sort((a, b) => a.order - b.order || a.f.name.localeCompare(b.f.name));
  return withOrder.map((x) => x.f);
}

// Build nav from index.md files — walks folders looking for nav/title metadata
export async function buildNav(pages: Storage, prefix = ""): Promise<string> {
  const { folders, files } = await pages.list(prefix);
  const items: string[] = [];

  // Check current folder's index.md for a nav entry
  for (const f of files) {
    if (f.name === "index.md") {
      const raw = await pages.read(f.path.replace(/^\//, ""));
      const { meta } = parseFrontMatter(raw);
      const title = meta.nav?.[0] || meta.title?.[0];
      if (title && !yes(meta.draft)) { // a draft stays out of the nav
        const href = encodeURI(canonicalPath(f.path.replace(/^\//, "")));
        items.push(`<li><a href="${href}">${title}</a></li>`);
      }
    }
  }

  // Recurse into subfolders, ordered
  const eligible = folders.filter((f) => !f.name.startsWith(".") && !f.name.startsWith("-"));
  for (const folder of await sortFolders(pages, eligible)) {
    const sub = await buildNav(pages, folder.path.replace(/^\//, ""));
    if (sub) items.push(sub);
  }

  return items.length > 0 ? items.join("\n") : "";
}
