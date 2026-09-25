import { yes } from "./markdown";

// What counts as a page, said once. Every walk of pages/ asks these — the nav,
// {{pages}} and the feed, {{sitemap}}, search and sitemap.xml, the export — so
// they agree on drafts, - and . names, each: pages and the 404 page. What each
// walk does with the answer (and in what order) is its own.

// The page that answers every miss: served as one, never listed as a page.
export const NOT_FOUND = "404.md";

// A name nothing shows or publishes: the editor's own, a bucket's marker.
export const hidden = (name: string) => name.startsWith(".");

// A name nothing lists: hidden, or `-`, which is served (and exported) for
// anyone with its address and listed nowhere — not in the nav, {{pages}},
// {{sitemap}}, a feed, search or the sitemap.
export const unlisted = (name: string) => hidden(name) || name.startsWith("-");

// A key that may be a page: markdown, and not the 404 page.
export const pageKey = (key: string) => key.endsWith(".md") && key !== NOT_FOUND;

// A page a reader can open at its own address: not a draft (404 but to the
// editor), and not an each: page (it is its items, not a page).
export const readable = (meta: Record<string, string[]>) => !yes(meta.draft) && !meta.each;
