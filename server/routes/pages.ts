import { createPageStorage } from "../storage";
import { pagesChanged } from "../nav";
import { fileRoutes } from "./files";

// The site's pages. A write here changes what the nav and the folder listings
// would say, so they are dropped and rebuilt on the next request.
export const handlePages = fileRoutes("/edit/pages/", createPageStorage(), pagesChanged);
