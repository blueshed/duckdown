import { createPageStorage } from "../storage";
import { pagesChanged } from "../nav";
import { searchChanged } from "../search";
import { collectionsChanged } from "../collection";
import { fileRoutes } from "./files";

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

export const handlePages = fileRoutes("/edit/pages/", createPageStorage(), changed);
