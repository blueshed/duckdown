import type { Storage } from "./storage";
import { decodePath } from "./utils";
import { aliasKey } from "./slugs";
import { pageList, aliasTargets } from "./search";
import { BASE_FILES, ROOT_FILES } from "./base";
import { isFeed } from "./feed";
import { languagesOf, languageAt } from "./languages";
import type { Answers } from "./extensions";

// The links a page makes, and whether anything answers them. The export asks
// of every page it writes, against the files it wrote; the preview asks of
// the page being edited, against what the site answers now. One reading of
// what a link is, so the two can't disagree about which links to check.

// `&amp;` and `&#x27;` in an attribute are one character each. A link scan
// that doesn't undo them calls "Hart&#x27;sLeap.jpg" a missing file.
const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function unescapeHtml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, e: string) => {
    if (e[0] !== "#") return NAMED[e.toLowerCase()] ?? whole;
    const code = e[1]!.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

// Links with a scheme, and bare #fragments, are somebody else's to check; so
// are the editor's own addresses, which exist on a served site and are no
// mistake.
const EDITOR = /^\/(edit|login|logout)(\/|$)/;

export type Link = { link: string; path: string; file: string };

// Every relative href and src in `html`, as written (`link`), as the decoded
// path it asks for from the page at `from` (a file under the site: "guide/pages.html"),
// and as that path without its leading slash (`file`).
export function linksIn(html: string, from: string): Link[] {
  const links: Link[] = [];
  for (const m of html.matchAll(/\s(?:href|src)=(?:"([^"]*)"|'([^']*)')/g)) {
    const link = unescapeHtml(m[1] ?? m[2]!);
    if (link === "" || link.startsWith("#") || /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(link)) continue;
    const { pathname } = new URL(link, `http://site/${from}`);
    if (EDITOR.test(pathname)) continue;
    const path = decodePath(pathname) ?? pathname;
    links.push({ link, path, file: path.slice(1) });
  }
  return links;
}

// A file, a folder's index, or a folder named without its slash.
const reaches = (file: string, has: (path: string) => boolean) =>
  has(file) || has(`${file}index.html`) || has(`${file}/index.html`);

// What a link that leads nowhere may have meant: a flat page is at /numbers.html
// and a folder's index at /numbers/, and the other spelling of either is the
// commonest slip, so say which of them is there (n189). Empty when neither is.
function meant(file: string, has: (path: string) => boolean): string {
  const bare = file.replace(/(\/|\.html)$/, "");
  if (!bare) return "";
  if (!file.endsWith(".html") && has(`${bare}.html`)) return ` — did you mean /${bare}.html?`;
  if (file.endsWith(".html") && has(`${bare}/index.html`)) return ` — did you mean /${bare}/?`;
  return "";
}

// The links of every page an export writes, gathered as it writes them and
// kept small: each distinct link once, and a page as the numbers of its links
// in order. Every page carries the whole nav, so its links as objects weighed
// more than its HTML (n167's first try); as numbers, a few bytes each. A page
// written again at the same address replaces its links, as its file is.
export class Links {
  private numbers: Map<string, number>;   // a link as written, and the file it asks for, → its number
  private distinct: { link: string; file: string }[];
  private pages: Map<string, Int32Array>;

  constructor() {   // written out: an implicit constructor is a function coverage counts and never sees
    this.numbers = new Map();
    this.distinct = [];
    this.pages = new Map();
  }

  add(from: string, html: string): void {
    this.pages.set(from, Int32Array.from(linksIn(html, from), ({ link, file }) => {
      const key = `${link}\0${file}`;
      if (!this.numbers.has(key)) {
        this.numbers.set(key, this.distinct.length);
        this.distinct.push({ link, file });
      }
      return this.numbers.get(key)!;
    }));
  }

  // Every link on every page that points at nothing in `known` (the files the
  // export wrote), as "page -> link", in page order and each page's own, and
  // what the link may have meant when that is there.
  broken(known: Set<string>, answers?: Answers): string[] {
    const has = (p: string) => known.has(p);
    const missing = this.distinct.map(({ file }) => reaches(file, has) || answers?.(`/${file}`) ? null : meant(file, has));
    const broken: string[] = [];
    for (const [from, links] of this.pages) {
      for (const n of links) if (missing[n] !== null) broken.push(`${from} -> ${this.distinct[n]!.link}${missing[n]}`);
    }
    return broken;
  }
}

// The links on one rendered page (at site address `from`, "/guide/pages.html")
// that a reader following them would find nothing at: not a page a reader can
// reach (a draft isn't one), an item, an old address that moves, a folder's
// feed, a file in static/ or the base, a file served at the root, or an address an
// extension answers (`extensions`, declared by the site). Asked of the index the
// site already keeps, and of static/ only for the files the page names, so it
// costs a lookup or two rather than an export. Each link once, as written.
export async function deadLinks(html: string, from: string, pages: Storage, files: Storage, extensions?: Answers): Promise<string[]> {
  const links = linksIn(html, from.replace(/^\//, "").replace(/(^|\/)$/, "$1index.html"));
  if (!links.length) return [];
  const answered = new Set((await pageList(pages)).map((p) => (p.url.endsWith("/") ? `${p.url}index.html` : p.url).slice(1)));
  const moved = new Set(await aliasTargets(pages));
  // A language answers every page of the default's, in its own words or with a
  // note (languages.ts), so a link into its folder leads where the default's does.
  const languages = await languagesOf(pages);
  const answers = (p: string) => answered.has(p) || answered.has(languageAt(languages, p)?.rest ?? "");
  const dead = new Set<string>();
  for (const { link, path, file } of links) {
    if (reaches(file, answers) || moved.has(aliasKey(path)) || extensions?.(path)) continue;
    if (file === "search.json" || file === "sitemap.xml" || await isFeed(pages, path)) continue;
    if (file.startsWith("static/")) {
      const name = file.slice("static/".length);
      if (BASE_FILES.includes(name) || await files.exists(name)) continue;
    }
    if (ROOT_FILES.includes(file) && await files.exists(file)) continue;
    dead.add(`${link}${meant(file, answers)}`);
  }
  return [...dead];
}
