import { createPageStorage } from "../storage";
import { pagesChanged } from "../nav";
import { searchChanged } from "../search";
import { fileRoutes } from "./files";

// The site's pages. A write here changes what the nav, the folder listings and
// the search index would say, so all three are dropped and rebuilt on the next
// request. A new thing the site knows about itself is dropped here too.
const changed = () => {
  pagesChanged();
  searchChanged();
};

export const handlePages = fileRoutes("/edit/pages/", createPageStorage(), changed);
