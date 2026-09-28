import { createPageStorage } from "../storage";
import { searchIndex, searchParts, searchFile } from "../search";
import { conditional } from "../utils";

const pages = createPageStorage();

// The whole index, in one file. The base search.js fetches the index in parts
// now (below); this stays for a site's own search.js written before them. It
// is public on purpose: everything in it is already a page anyone can read,
// and drafts are not in it. Cached with the same lifetime as the nav.
export const handleSearch = async () =>
  Response.json(await searchIndex(pages), {
    headers: { "Cache-Control": "public, max-age=300" },
  });

// The index in parts (search.ts): /search/index.json, /search/words/<xy>.json
// and /search/pages/<n>.json, the same files the export writes. They name each
// other by number, and a save can renumber them, so a browser asks each time
// whether its copy is still the one (a 304 when it is) rather than keeping a
// word's shard from before the save beside a page from after it.
export async function handleSearchFile(req: Request): Promise<Response> {
  const body = searchFile(await searchParts(pages), new URL(req.url).pathname);
  if (body === null) return new Response("Not Found", { status: 404 });
  return conditional(req, body, { "Content-Type": "application/json;charset=utf-8", "Cache-Control": "no-cache" });
}
