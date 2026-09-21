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
import { ORIGIN, STATIC_PATH } from "./config";
import { createPageStorage, createStaticStorage, type Storage } from "./storage";
import { parsePage, pageHtml } from "./page";
import { buildIndex } from "./search";
import { canonicalPath } from "./utils";
import { yes } from "./markdown";

export type Exported = { pages: number; drafts: number; files: number };

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

  // Start from empty: a page deleted since the last export should not survive
  // in the output, which is the whole site and not a pile of leftovers.
  rmSync(out, { recursive: true, force: true });

  const count: Exported = { pages: 0, drafts: 0, files: 0 };

  for (const key of await walk(pages)) {
    if (!key.endsWith(".md")) continue;   // pages/ holds pages
    const page = parsePage(key, await pages.read(key));
    if (yes(page.meta.draft)) { count.drafts++; continue; }
    // No edit link: there is no editor behind a folder of files.
    const { html } = await pageHtml(page, { origin, editHref: "" });
    put(outPath(key), html);
    count.pages++;
  }

  for (const key of await walk(files)) {
    put(join(STATIC_PATH, key), await files.readBytes(key));
    count.files++;
  }

  // The same index the served site answers at /search.json, as a file. A
  // published site has no server to ask, so the browser fetches this and does
  // the matching itself.
  put("search.json", JSON.stringify(await buildIndex(pages)));
  count.files++;

  say(`${count.pages} page(s) and ${count.files} file(s) written to ${out}/`);
  if (count.drafts) say(`${count.drafts} draft(s) left out.`);
  if (!origin) {
    say("DUCKDOWN_ORIGIN isn't set, so each page's canonical link is relative.\n"
      + "Set it to the site's address (https://example.com) to make them absolute.");
  }
  return count;
}

// Only when run, never on import: the tests call exportSite() directly.
if (import.meta.main) await exportSite({ out: process.argv[2] || "dist" });
