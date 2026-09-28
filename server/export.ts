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

import { chmodSync, closeSync, cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, renameSync, rmSync, writeFileSync, writeSync } from "fs";
import { basename, dirname, join } from "path";
import { tmpdir } from "os";
import { ORIGIN, STATIC_PATH, IS_S3, BUCKET, BUCKET_PREFIX, APP_PATH } from "./config";
import { createPageStorage, createStaticStorage, type Storage } from "./storage";
import { parsePage, pageHtml, itemPage } from "./page";
import { buildSite, searchFiles, searchFileList, type Entry } from "./search";
import { COLLECTION_FILE, collectionProblems, loadCollection } from "./collection";
import { canonicalPath, escapeHtml } from "./utils";
import { Links } from "./links";
import { hidden } from "./listed";
import { yes } from "./markdown";
import { BASE_FILES, ROOT_FILES, baseFile } from "./base";
import { sitemapXml } from "./sitemap";
import { feedXml, FEED_FILE } from "./feed";

export type Exported = { pages: number; drafts: number; files: number; broken: number; problems: number };

// An address that has moved, as a file a static host can serve: it says so to
// a crawler (canonical) and takes a reader there (meta refresh). There is no
// server to answer 301 with, so this is the published flavour's version of it.
export function redirectHtml(to: string): string {
  const href = escapeHtml(encodeURI(to));
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">`
    + `<title>Moved</title><link rel="canonical" href="${href}">`
    + `<meta http-equiv="refresh" content="0; url=${href}">`
    + `</head><body><p>This page is now at <a href="${href}">${href}</a>.</p></body></html>\n`;
}

// Every key under a storage, depth first, but hidden ones (listed.ts). Names
// the site serves but lists nowhere (a leading `-`) are pages all the same, so
// they go.
async function walk(store: Storage, prefix = ""): Promise<string[]> {
  const { files, folders } = await store.list(prefix);
  const keys = files.filter((f) => !hidden(f.name)).map((f) => f.path);
  for (const folder of folders.filter((f) => !hidden(f.name))) {
    keys.push(...await walk(store, folder.path));
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

// The file an old address is written as, or null when it isn't one. It is
// the name a request for it looks up, decoded: `/old.html` is the file
// old.html, because that is what a static host (and serve.ts) opens for it,
// and `/old` or `/old/` is a folder with an index. A `.` or `..` segment is
// no address a browser sends — it would put the file beside dist/, not in it.
export function aliasFile(from: string): string | null {
  const trimmed = from.replace(/^\/+/, "");
  if (trimmed.split("/").some((segment) => segment === "." || segment === "..")) return null;
  if (trimmed.endsWith(".html")) return trimmed;
  const folder = trimmed.replace(/\/+$/, "");
  return folder ? `${folder}/index.html` : "index.html";
}

// Whether `path` under `out` is there spelt exactly as asked, segment by
// segment. A filesystem that normalises names (é as e + a combining accent)
// keeps the file under a spelling a request doesn't look up, and says nothing.
export function lands(out: string, path: string): boolean {
  let dir = out;
  for (const segment of path.split("/")) {
    if (!readdirSync(dir).includes(segment)) return false;
    dir = join(dir, segment);
  }
  return true;
}

// The whole index as one file, as search.json was before the parts, written an
// entry at a time rather than made as one string first (68 MB at 20,000
// pages): the same bytes as JSON.stringify(entries).
function writeWhole(path: string, entries: Entry[]): void {
  const fd = openSync(path, "w");
  try {
    writeSync(fd, "[");
    entries.forEach((entry, i) => writeSync(fd, (i ? "," : "") + JSON.stringify(entry)));
    writeSync(fd, "]");
  } finally {
    closeSync(fd);
  }
}

// Whether a process is still there: signal 0 asks without sending anything.
function running(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";   // there, but not ours to signal
  }
}

// What an export that was stopped left beside dist/, told from a running one's
// by the process in its name, goes — but for the site it had moved aside,
// when it was stopped between its two renames: with no dist/, that goes back.
function tidy(at: string, name: string, out: string, say: (line: string) => void): void {
  for (const kind of ["old", "next"]) {
    const prefix = `.${name}.${kind}-`;
    for (const left of readdirSync(at).filter((n) => n.startsWith(prefix))) {
      if (running(parseInt(left.slice(prefix.length)))) continue;
      if (kind === "old" && !existsSync(out)) {
        renameSync(join(at, left), out);
        say(`${out} was missing, left beside it as ${left} by an export that was stopped: it is back.`);
      } else {
        rmSync(join(at, left), { recursive: true, force: true });
      }
    }
  }
}

// Put a new site where the old one was: the old aside, the new in its place,
// then the old gone. Two renames, so dist/ is never part of one and part of
// the other; if the second fails, the old goes back (or, if another export's
// site took the place first, goes), and a run stopped between them has it put
// back by the next (tidy). A dist/ gone by the time it is moved (another
// export's, mid-swap) is nothing to move. A folder that can't be moved aside (a mount point)
// is emptied and the new site copied in instead — no longer at once, but
// still only once the new site is whole — and the reason it couldn't is the
// answer.
export function swapIn(next: string, out: string, old: string, rename: typeof renameSync = renameSync): string | null {
  if (existsSync(out)) {
    try {
      rename(out, old);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        for (const name of readdirSync(out)) rmSync(join(out, name), { recursive: true, force: true });
        cpSync(next, out, { recursive: true });
        rmSync(next, { recursive: true, force: true });
        return code ?? (e as Error).message;
      }
    }
  }
  try {
    rename(next, out);
  } catch (e) {
    if (existsSync(out)) rmSync(old, { recursive: true, force: true });
    else if (existsSync(old)) rename(old, out);
    throw e;
  }
  rmSync(old, { recursive: true, force: true });
  return null;
}

export async function exportSite(o: {
  out: string;
  origin?: string;
  pages?: Storage;
  files?: Storage;
  say?: (line: string) => void;
  strict?: boolean;   // a broken link is a failure, not just a report
  lands?: typeof lands;
  rename?: typeof renameSync;
}): Promise<Exported> {
  const out = o.out;
  // Trailing slash off, wherever it came from: canonicalPath supplies the
  // leading one, and "https://example.com//" is a different URL.
  const origin = (o.origin ?? ORIGIN).replace(/\/$/, "");
  const pages = o.pages ?? createPageStorage();
  const files = o.files ?? createStaticStorage();
  const say = o.say ?? console.log;

  // Render into a folder beside dist/, a page at a time, and swap it in once
  // the site is whole: a run that fails part-way, or finds nothing to publish
  // (a folder that isn't there, a bucket that is empty), must not take a good
  // dist with it, nor report success and let a deploy go green on an empty
  // site. Beside it, so the swap is a rename; and what a run that was stopped
  // left there goes first. Each run's folders are its own, named for its
  // process and unique in it (.dist.next-<pid>-…, .dist.old-<pid>-…), so two
  // exports at once never write into one folder or clear the other's.
  const [at, name] = [dirname(out), basename(out)];
  mkdirSync(at, { recursive: true });
  tidy(at, name, out, say);
  const next = mkdtempSync(join(at, `.${name}.next-${process.pid}-`));
  chmodSync(next, 0o777 & ~process.umask());   // mkdtemp's is its owner's alone; dist/ is for a web server to read
  const old = join(at, `.${name}.old-${basename(next).slice(`.${name}.next-`.length)}`);

  const put = (path: string, body: string | Uint8Array) => {
    const full = join(next, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  };
  const written = new Set<string>();
  const write = (path: string, body: string | Uint8Array) => { put(path, body); written.add(path); };

  // Each page goes to disk as it is made, and only its links stay, kept small
  // (links.ts): every page carries the whole nav, so held as HTML or as link
  // objects the pages were most of an export's memory (n167).
  const made = new Set<string>();   // the pages' files
  const links = new Links();
  const page = (path: string, html: string) => {
    write(path, html);
    made.add(path);
    links.add(path, html);
  };
  const count: Exported = { pages: 0, drafts: 0, files: 0, broken: 0, problems: 0 };
  const problems: string[] = [];
  const moved: { from: string; to: string }[] = [];
  const feeds: string[] = [];   // folders whose index says feed: true
  let broken: string[];
  let unmoved: string | null;

  try {
    for (const key of await walk(pages)) {
      // A folder's collection is a folder of pages: every item rendered at its
      // own address, through the same pageHtml the site and the preview use. A
      // feature that skipped the export wouldn't be a duckdown feature.
      if (key === COLLECTION_FILE || key.endsWith(`/${COLLECTION_FILE}`)) {
        const folder = key.slice(0, Math.max(key.length - COLLECTION_FILE.length - 1, 0));
        problems.push(...await collectionProblems(pages, folder));
        const collection = (await loadCollection(pages, folder))!;
        // No each: page, no item pages: the data is shown only by its overviews.
        for (const item of collection.each ? collection.items : []) {
          const { html } = await pageHtml(itemPage({ collection, item }), { origin, editHref: "", item: { collection, item } });
          page(outPath(item.key), html);
          for (const alias of item.aliases) moved.push({ from: alias, to: item.href });
        }
        continue;
      }
      if (!key.endsWith(".md")) continue;   // pages/ holds pages
      const parsed = parsePage(key, await pages.read(key));
      if (parsed.meta.each) continue;   // written as its items, above
      if (yes(parsed.meta.draft)) { count.drafts++; continue; }
      // No edit link: there is no editor behind a folder of files.
      const { html } = await pageHtml(parsed, { origin, editHref: "" });
      page(outPath(key), html);
      for (const alias of parsed.meta.aliases ?? []) moved.push({ from: alias, to: canonicalPath(key) });
      if (yes(parsed.meta.feed) && (key === "index.md" || key.endsWith("/index.md"))) feeds.push(key.slice(0, -"index.md".length));
    }
    if (!made.size) {
      const where = IS_S3 ? `s3://${BUCKET}/${BUCKET_PREFIX}` : APP_PATH;
      throw new Error(`No pages to export: nothing readable under pages/ in ${where}`
        + (count.drafts ? ` (${count.drafts} draft(s) left out)` : "")
        + `. Is DUCKDOWN_PATH set? ${out} was left as it was.`);
    }
    count.pages = made.size;

    // Old addresses, as redirect pages. Written under the name the request
    // arrives as once it is decoded, so `/l"etoile-1976` is a folder called
    // `l"etoile-1976` holding an index.html: this server finds it, and so does
    // any host that maps a path to a file. A name a page already holds is left
    // alone and said — the page is the thing at that address. So is a name this
    // filesystem refuses (Windows won't take `"`; nowhere takes a segment of
    // 256 bytes, or a folder where a file already is) or keeps under another
    // spelling: the published site can't answer at that address, and an owner
    // who isn't told finds out from a reader's 404.
    for (const { from, to } of moved) {
      const path = aliasFile(from);
      if (path === null) {
        problems.push(`alias ${from} climbs out of the site with . or .. — left out`);
        continue;
      }
      if (made.has(path)) {
        problems.push(`alias ${from} is already a page — left as it is`);
        continue;
      }
      try {
        put(path, redirectHtml(to));
      } catch (e) {
        problems.push(`alias ${from} can't be written here as ${path} (${(e as NodeJS.ErrnoException).code ?? (e as Error).message}) — left out`);
        continue;
      }
      if (!(o.lands ?? lands)(next, path)) {
        problems.push(`alias ${from} was written, but this filesystem spells ${path} another way — a request for it won't find it`);
        continue;
      }
      written.add(path);
      count.files++;
    }

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
    // The icon's other plain name, as a file of its own: a static host has no
    // rule to answer it with. (serve.ts answers the sized names too.)
    if (await files.exists("apple-touch-icon.png")) {
      write("apple-touch-icon-precomposed.png", await files.readBytes("apple-touch-icon.png"));
      count.files++;
    }

    // The index the browser searches, in the parts the served site answers
    // with (search.ts): a published site has no server to ask, so the browser
    // fetches the files its search needs and does the matching itself.
    const { entries, pages: listed } = await buildSite(pages);
    for (const [path, body] of searchFileList(searchFiles(entries))) {
      write(path, body);
      count.files++;
    }
    // And the whole index as one file, as before the parts, for a search.js
    // from then: a reader's browser may still hold duckdown's, and a site may
    // have its own copy. To go once no browser can have the old one.
    writeWhole(join(next, "search.json"), entries);
    written.add("search.json");
    count.files++;
    // A sitemap needs absolute addresses, so it needs the origin; so does a feed.
    if (origin) {
      write("sitemap.xml", sitemapXml(listed, origin));
      count.files++;
      for (const folder of feeds) {
        write(`${folder}${FEED_FILE}`, (await feedXml(pages, folder.replace(/\/$/, ""), origin, true))!);
        count.files++;
      }
    } else if (feeds.length) {
      say(`${feeds.map((f) => `/${f}${FEED_FILE}`).join(", ")} not written: a feed needs DUCKDOWN_ORIGIN for its addresses.`);
    }

    broken = links.broken(written);
    // The whole site is written: it takes dist/'s place.
    unmoved = swapIn(next, out, old, o.rename);
  } catch (e) {
    rmSync(next, { recursive: true, force: true });
    throw e;
  }
  if (unmoved) say(`${out} couldn't be moved aside (${unmoved}), so it was emptied and the new site copied in.`);

  count.broken = broken.length;
  for (const line of broken) say(`broken link: ${line}`);
  // A collection that can't have the addresses it asks for, said here as well
  // as in the log: the export is where a site owner finds out before a reader.
  count.problems = problems.length;
  for (const line of problems) say(`collection: ${line}`);

  say(`${count.pages} page(s) and ${count.files} file(s) written to ${out}/`);
  if (count.drafts) say(`${count.drafts} draft(s) left out.`);
  if (!origin) {
    say("DUCKDOWN_ORIGIN isn't set, so each page's canonical link is relative.\n"
      + "Set it to the site's address (https://example.com) to make them absolute.\n"
      + "It also decides whether sitemap.xml is written: it needs absolute addresses.");
  }
  if ((broken.length || problems.length) && o.strict) {
    throw new Error(`${broken.length} broken link(s) and ${problems.length} collection problem(s), and --strict is on.`);
  }
  return count;
}

// What would stop this site publishing cleanly, found the way the export finds
// it — by doing the whole export, into a folder thrown away after: each broken
// link, each collection problem, or why there was nothing to export at all.
// Publishing (remote.ts) asks before every push.
export async function checkSite(run: typeof exportSite = exportSite): Promise<string[]> {
  const out = mkdtempSync(join(tmpdir(), "duckdown-check-"));
  const said: string[] = [];
  try {
    await run({ out, say: (line) => said.push(line) });
    return said.filter((line) => line.startsWith("broken link: ") || line.startsWith("collection: "));
  } catch (e) {
    return [(e as Error).message];
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
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
