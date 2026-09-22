#!/usr/bin/env bun

// Write the whole site out as files.
//
//   bun run export            into ./dist
//   bun run export ./out      somewhere else
//
// The same renderer the site and the preview use, so an exported page is the
// page — its template, its navigation, its {{pages}} listing, its stylesheets.
// What it can't have is anything that needs a server: no /edit, no view log,
// and a `draft: true` page is left out rather than hidden behind a login.
//
// It reads through the storage layer, so it exports a folder on disk or a
// live bucket, whichever this environment is pointed at.

import { mkdirSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { ORIGIN, STATIC_PATH, IS_S3, BUCKET, BUCKET_PREFIX, APP_PATH } from "./config";
import { createPageStorage, createStaticStorage, type Storage } from "./storage";
import { parsePage, pageHtml } from "./page";
import { buildSite } from "./search";
import { canonicalPath, decodePath } from "./utils";
import { yes } from "./markdown";
import { BASE_FILES, ROOT_FILES, baseFile } from "./base";
import { sitemapXml } from "./sitemap";

export type Exported = { pages: number; drafts: number; files: number; broken: number };

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

// Every relative href and src on every page that points at nothing in the
// site, as "page -> link". `known` is every file the export wrote. Links with a
// scheme, and bare #fragments, are somebody else's to check; so are the
// editor's own addresses, which exist on a served site and are no mistake.
const EDITOR = /^\/(edit|login|logout)(\/|$)/;

export function brokenLinks(pages: Map<string, string>, known: Set<string>): string[] {
  const broken: string[] = [];
  for (const [from, html] of pages) {
    for (const m of html.matchAll(/\s(?:href|src)=(?:"([^"]*)"|'([^']*)')/g)) {
      const link = unescapeHtml(m[1] ?? m[2]!);
      if (link === "" || link.startsWith("#") || /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(link)) continue;
      const { pathname } = new URL(link, `http://site/${from}`);
      const file = (decodePath(pathname) ?? pathname).slice(1);
      // A file, a folder's index, or a folder named without its slash.
      if (EDITOR.test(pathname)) continue;
      if (!known.has(file) && !known.has(`${file}index.html`) && !known.has(`${file}/index.html`)) {
        broken.push(`${from} -> ${link}`);
      }
    }
  }
  return broken;
}

// Every key under a storage, depth first. Folders the site serves but keeps
// out of the navigation (a leading `-`) are pages all the same, so they go.
async function walk(store: Storage, prefix = ""): Promise<string[]> {
  const { files, folders } = await store.list(prefix);
  const keys = files.map((f) => f.path.replace(/^\//, ""));
  for (const folder of folders) {
    keys.push(...await walk(store, folder.path.replace(/^\//, "")));
  }
  return keys;
}

// Where a page's one address becomes a file: `/` and `/blog/` are folders with
// an index, and `/about.html` is itself. Nothing is written twice, so the site
// has no second address for a search engine to find.
export function outPath(key: string): string {
  const url = canonicalPath(key);
  return (url.endsWith("/") ? `${url}index.html` : url).slice(1);
}

export async function exportSite(o: {
  out: string;
  origin?: string;
  pages?: Storage;
  files?: Storage;
  say?: (line: string) => void;
  strict?: boolean;   // a broken link is a failure, not just a report
}): Promise<Exported> {
  const out = o.out;
  // Trailing slash off, wherever it came from: canonicalPath supplies the
  // leading one, and "https://example.com//" is a different URL.
  const origin = (o.origin ?? ORIGIN).replace(/\/$/, "");
  const pages = o.pages ?? createPageStorage();
  const files = o.files ?? createStaticStorage();
  const say = o.say ?? console.log;

  const put = (path: string, body: string | Uint8Array) => {
    const full = join(out, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  };

  // Render first, wipe after: a run that finds nothing to publish (a folder
  // that isn't there, a bucket that is empty) must not take a good dist with
  // it, nor report success and let a deploy go green on an empty site.
  const rendered = new Map<string, string>();
  const count: Exported = { pages: 0, drafts: 0, files: 0, broken: 0 };

  for (const key of await walk(pages)) {
    if (!key.endsWith(".md")) continue;   // pages/ holds pages
    const page = parsePage(key, await pages.read(key));
    if (yes(page.meta.draft)) { count.drafts++; continue; }
    // No edit link: there is no editor behind a folder of files.
    const { html } = await pageHtml(page, { origin, editHref: "" });
    rendered.set(outPath(key), html);
  }
  if (!rendered.size) {
    const where = IS_S3 ? `s3://${BUCKET}/${BUCKET_PREFIX}` : APP_PATH;
    throw new Error(`No pages to export: nothing readable under pages/ in ${where}`
      + (count.drafts ? ` (${count.drafts} draft(s) left out)` : "")
      + `. Is DUCKDOWN_PATH set? ${out} was left as it was.`);
  }
  count.pages = rendered.size;

  // Start from empty: a page deleted since the last export should not survive
  // in the output, which is the whole site and not a pile of leftovers.
  rmSync(out, { recursive: true, force: true });
  const written = new Set<string>();
  const write = (path: string, body: string | Uint8Array) => { put(path, body); written.add(path); };

  for (const [path, html] of rendered) write(path, html);

  const statics = new Set<string>();
  for (const key of await walk(files)) {
    write(join(STATIC_PATH, key), await files.readBytes(key));
    statics.add(key);
    count.files++;
  }
  // The base a site didn't keep its own copy of, as the served site falls back
  // to it, and the two files crawlers look for at the root.
  for (const name of BASE_FILES) {
    if (statics.has(name)) continue;
    write(join(STATIC_PATH, name), new Uint8Array(await baseFile(name)!.arrayBuffer()));
    count.files++;
  }
  for (const name of ROOT_FILES) {
    if (!await files.exists(name)) continue;
    write(name, await files.readBytes(name));
    count.files++;
  }

  // The same index the served site answers at /search.json, as a file. A
  // published site has no server to ask, so the browser fetches this and does
  // the matching itself.
  const { entries, pages: listed } = await buildSite(pages);
  write("search.json", JSON.stringify(entries));
  count.files++;
  // A sitemap needs absolute addresses, so it needs the origin.
  if (origin) {
    write("sitemap.xml", sitemapXml(listed, origin));
    count.files++;
  }

  const broken = brokenLinks(rendered, written);
  count.broken = broken.length;
  for (const line of broken) say(`broken link: ${line}`);

  say(`${count.pages} page(s) and ${count.files} file(s) written to ${out}/`);
  if (count.drafts) say(`${count.drafts} draft(s) left out.`);
  if (!origin) {
    say("DUCKDOWN_ORIGIN isn't set, so each page's canonical link is relative.\n"
      + "Set it to the site's address (https://example.com) to make them absolute.\n"
      + "It also decides whether sitemap.xml is written: it needs absolute addresses.");
  }
  if (broken.length && o.strict) throw new Error(`${broken.length} broken link(s), and --strict is on.`);
  return count;
}

// bun run export [--strict] [out]. Says what went wrong and answers the exit
// code, so a build stops on it; DUCKDOWN_STRICT=1 is --strict for a platform
// that runs the script for you.
export async function main(argv: string[], env: Record<string, string | undefined> = process.env): Promise<number> {
  try {
    await exportSite({
      out: argv.find((a) => !a.startsWith("--")) || "dist",
      strict: argv.includes("--strict") || env.DUCKDOWN_STRICT === "1",
    });
    return 0;
  } catch (e) {
    console.error((e as Error).message);
    return 1;
  }
}

// Only when run, never on import: the tests call these directly.
if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
