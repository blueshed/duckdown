import { createPageStorage } from "../storage";
import { pagesChanged } from "../nav";
import { searchChanged } from "../search";
import { collectionsChanged } from "../collection";
import { addMeta, dropMeta, parseFrontMatter, yes } from "../markdown";
import { aliasKey } from "../slugs";
import { canonicalPath } from "../utils";
import { fileRoutes, type Mover } from "./files";

// The site's pages. A write here changes what the nav, the folder listings,
// the search index and a folder's collection.json would say, so all of them
// are dropped and rebuilt on the next request — collection.json lives under
// pages/ and is written through this same route. A new thing the site knows
// about itself is dropped here too.
const changed = () => {
  pagesChanged();
  searchChanged();
  collectionsChanged();
};

const refuse = (why: string) => new Response(why, { status: 400 });
const nameOf = (key: string) => key.slice(key.lastIndexOf("/") + 1);

// A page renamed or moved keeps its old address: it goes into the page's own
// aliases, so a link or a bookmark to it is a 301 to where it is now — the
// same rule the collection pane follows for an item whose title moves it.
// An alias that is the new address comes off (a page moved back), and a
// draft never had an address to keep. A folder's index.md is the folder, and
// an each: page and collection.json belong to their folder's collection, so
// none of those move on their own.
export const movePage: Mover = (from, to, source) => {
  if (!/[^/]\.md$/.test(from) || !/[^/]\.md$/.test(to)) return refuse("Only a page moves: a name ending .md");
  if (nameOf(from) === "index.md") return refuse(`${from} is its folder's page: moving it is moving the folder`);
  const { meta } = parseFrontMatter(source);
  if (meta.each) return refuse(`${from} is the page every item of its collection gets, and stays with the collection`);
  const here = aliasKey(canonicalPath(to));
  let body = dropMeta(source, "aliases", (alias) => aliasKey(alias) === here);
  if (yes(meta.draft)) return { body, kept: null };
  const old = canonicalPath(from);
  if (!(meta.aliases ?? []).some((alias) => aliasKey(alias) === aliasKey(old))) body = addMeta(body, "aliases", old);
  return { body, kept: old };
};

export const handlePages = fileRoutes("/edit/pages/", createPageStorage(), changed, undefined, movePage);
