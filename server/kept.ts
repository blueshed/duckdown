import type { Storage } from "./storage";
import { DEBUG } from "./config";

// What the site knows about itself — the nav, each folder's listing, the
// sitemap, the search index, the collections, the feeds — is built from
// pages/ and kept until a page changes. In production every write comes
// through this server, and whatever writes calls siteChanged(), which drops
// the lot: one call, so a new write path can't forget one of them. In
// development (DEBUG=1) each is built per ask instead: pages are often written
// straight to disk there, by hand or by an agent, and a cache would keep them
// out until the next save in the editor. A build that fails isn't kept: the
// next ask tries again.

const drops: (() => void)[] = [];

export function siteChanged(): void {
  for (const drop of drops) drop();
}

// A build kept per key — a folder, or "" for one of the whole site. `dropped`
// goes with it: whatever else should start again when the pages do.
export function kept<T>(
  build: (pages: Storage, key: string, debug: boolean) => Promise<T>,
  dropped?: () => void,
): (pages: Storage, key: string, debug?: boolean) => Promise<T> {
  const held = new Map<string, Promise<T>>();
  drops.push(() => {
    held.clear();
    dropped?.();
  });
  return (pages, key, debug = DEBUG) => {
    if (debug) return build(pages, key, debug);
    const had = held.get(key);
    if (had) return had;
    const building = build(pages, key, debug).catch((e) => {
      if (held.get(key) === building) held.delete(key);   // not a newer one, made since
      throw e;
    });
    held.set(key, building);
    return building;
  };
}
