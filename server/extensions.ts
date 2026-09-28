// Extensions: routes a site adds to duckdown's own. A form, an RSVP, anything
// that needs a server and would look wrong outside the site's own pages.
//
// An extension is a module whose default export takes the Site and returns
// Bun routes. The site declares it in its package.json, never in site/:
//
//   "duckdown": { "extensions": ["duckdown-forms", "./extensions/rsvp.ts"] }
//
// site/ can be a bucket its editors write to; what runs on the server changes
// only by a commit. Both servers take extensions: main.ts (served) and
// serve.ts (published), so a form on a published site is on the site's own
// host, with its stylesheets, pictures and links.
import type { BunRequest } from "bun";
import { join } from "path";
import { storageAt, type Storage } from "./storage";
import { parsePage, pageHtml } from "./page";
import { ORIGIN } from "./config";

// What an extension is given: the site, on disk or in a bucket (the same
// Storage the rest of duckdown reads, so the storage contract holds for it
// too), and the site's look.
export type Site = {
  storage: Storage;
  // A whole page: this markdown in the site's template, with its nav and
  // stylesheets. `key` is where the markdown is kept (relative wiki links
  // resolve from its folder); `path` is the address the page is served at,
  // for its canonical link.
  render(markdown: string, where: { key: string; path: string }): Promise<string>;
};

type Handler = (req: BunRequest) => Response | Promise<Response>;
export type Routes = Record<string, Response | Handler | Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", Handler>>>;
export type Extension = (site: Site) => Routes | Promise<Routes>;

export function siteFor(storage: Storage = storageAt(), origin = ORIGIN): Site {
  return {
    storage,
    render: async (markdown, { key, path }) => (await pageHtml(parsePage(key, markdown), { origin, path })).html,
  };
}

// An extension may not take a path duckdown or another extension already has:
// a server that won't start says why, where one route hiding another says
// nothing.
//
// A page is no route: the site's pages come through fetch, after every route,
// so an extension's address is its own and a page there is never shown for
// the methods the route answers (n177). A Response or a handler answers
// every method; a route of methods only those, so a GET to a POST-only form
// still reaches the page there. That is not checked against the pages. They
// change while the server runs (the editor, a bucket), and what an editor
// writes must never stop it; a check at start would miss every page written
// since. So the addresses, and their methods, are said as the server starts.
export async function withExtensions<T extends object>(own: T, site: Site, extensions: Extension[], say = console.log): Promise<T & Routes> {
  const routes: Record<string, unknown> = { ...(own as Record<string, unknown>) };
  const added: string[] = [];
  for (const extension of extensions) {
    for (const [path, route] of Object.entries(await extension(site))) {
      if (path in routes) throw new Error(`An extension's route ${path} clashes with one already there`);
      routes[path] = route;
      added.push(route instanceof Response || typeof route === "function" ? path : `${path} (${Object.keys(route).join(", ")})`);
    }
  }
  if (added.length) say(`extensions answer ${added.join(", ")}: a page at one of those addresses is never shown for the methods it answers`);
  return routes as T & Routes;
}

// The extensions a site's package.json declares, loaded. None declared, or no
// package.json (duckdown's own repository), is none. One that won't load
// stops the server: a site missing its forms would fail quietly.
export async function loadExtensions(root = process.cwd()): Promise<Extension[]> {
  const pkg = Bun.file(join(root, "package.json"));
  if (!(await pkg.exists())) return [];
  const declared: unknown = (await pkg.json()).duckdown?.extensions ?? [];
  if (!Array.isArray(declared) || !declared.every((name) => typeof name === "string")) {
    throw new Error(`package.json: "duckdown": { "extensions" } is a list of module names`);
  }
  const extensions: Extension[] = [];
  for (const name of declared as string[]) {
    let module: { default?: unknown };
    try {
      module = await import(Bun.resolveSync(name, root));
    } catch (e) {
      throw new Error(`Extension "${name}" (package.json) won't load: ${(e as Error).message}`);
    }
    if (typeof module.default !== "function") throw new Error(`Extension "${name}" has no default export to give the site to`);
    extensions.push(module.default as Extension);
  }
  return extensions;
}
