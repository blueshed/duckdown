import { join } from "path";

// What every site starts from and shouldn't have to keep a copy of: the base
// stylesheet and the search script. A site that has its own file of that name
// gets its own; a site that doesn't gets these, so upgrading duckdown upgrades
// the base. They sit in server/, which is there whether duckdown is installed
// as a dependency or vendored by bun create, so one fallback serves both. The
// seed site carries no copy: it reads them the way any site does.
const BASE_DIR = join(import.meta.dir, "base");

// Files a crawler or a browser asks for at the root, answered from static/.
// A list of two, on purpose: nothing else is worth a mechanism.
export const ROOT_FILES = ["robots.txt", "favicon.ico"];

export const BASE_FILES = ["site.css", "search.js"];

// The named file, or null when it isn't one of the base's.
export function baseFile(name: string): Bun.BunFile | null {
  return BASE_FILES.includes(name) ? Bun.file(join(BASE_DIR, name)) : null;
}
