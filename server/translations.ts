import type { Storage } from "./storage";
import { DEBUG } from "./config";
import { kept } from "./kept";
import { translationRows, type Row } from "./languages";
import { collectionRows } from "./collection";

// Where every translation of the site stands — each page's, and each item of
// each collection's — for whoever is keeping them up to date: the export lists
// the ones that have fallen behind, and the editor marks them in its tree. A
// page is named in the default's tree ("about.md"); an item by its collection
// ("works/collection.json#first-light"). Kept like the nav, and dropped with it
// when a page changes (kept.ts).
const standings = kept(async (pages, _, debug) => [...await translationRows(pages, debug), ...await collectionRows(pages, debug)]);

export const translationStandings = (pages: Storage, debug = DEBUG): Promise<Row[]> => standings(pages, "", debug);
