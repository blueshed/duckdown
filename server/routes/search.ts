import { createPageStorage } from "../storage";
import { searchIndex } from "../search";

const pages = createPageStorage();

// The whole index, in one file, for the browser to search. It is public on
// purpose: everything in it is already a page anyone can read, and drafts are
// not in it. Cached with the same lifetime as the nav.
export const handleSearch = async () =>
  Response.json(await searchIndex(pages), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
