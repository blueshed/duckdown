import { join } from "path";

// What every site starts from and shouldn't have to keep a copy of: the base
// stylesheet and the search script. A site that has its own file of that name
// gets its own; a site that doesn't gets these, so upgrading duckdown upgrades
// the base. They sit in server/, which is there whether duckdown is installed
// as a dependency or vendored by bun create, so one fallback serves both. The
// seed site carries no copy: it reads them the way any site does.
const BASE_DIR = join(import.meta.dir, "base");

// Files a crawler or a browser asks for at the root, answered from static/.
// A short list, on purpose: nothing else is worth a mechanism.
export const ROOT_FILES = ["robots.txt", "favicon.ico", "apple-touch-icon.png"];

// An iPhone putting a site on its home screen, or an app drawing a link's
// preview, asks the root for the icon under several names — plain,
// -precomposed, and sized (-120x120, -180x180-precomposed) — whatever the page
// says in its <link rel="apple-touch-icon">. One picture answers them all:
// static/apple-touch-icon.png, which iOS scales.
const TOUCH_ICON = /^apple-touch-icon(-\d+x\d+)?(-precomposed)?\.png$/;

// The file in static/ a root address is answered from, or null.
export function rootFile(path: string): string | null {
  if (ROOT_FILES.includes(path)) return path;
  return TOUCH_ICON.test(path) ? "apple-touch-icon.png" : null;
}

export const BASE_FILES = ["site.css", "search.js"];

// The named file, or null when it isn't one of the base's.
export function baseFile(name: string): Bun.BunFile | null {
  return BASE_FILES.includes(name) ? Bun.file(join(BASE_DIR, name)) : null;
}
