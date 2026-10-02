// Where a translation stands against what it was made from — a rule the server
// (languages.ts for pages, collection.ts for a collection's items) and the
// editor's words pane both apply, so it is written once, here, and pure: the
// editor imports it, as it imports slugs.ts and images.ts.
//
//   fresh     — it says it was made from the source as it is now;
//   stale     — the source has changed since: needs retranslation;
//   unchecked — it doesn't say what it was made from (written by hand, or
//               before this was tracked), so nothing can be said;
//   own       — there is no source: a page of this language's own;
//   missing   — there is no translation yet.
export type Standing = "fresh" | "stale" | "unchecked" | "own" | "missing";

// `made` is what a translation says (`translated-from`), `now` the source's hash.
// A hash is read however it was typed, in capitals too.
export const judge = (made: string | undefined, now: string): "fresh" | "stale" | "unchecked" =>
  !made ? "unchecked" : made.toLowerCase() === now ? "fresh" : "stale";

// How each standing is said, to a person: in the editor, and by
// `duckdown translations status`.
export const SAYS: Record<Standing, string> = {
  fresh: "up to date",
  stale: "out of date",
  unchecked: "not checked",
  own: "has no original",
  missing: "not translated yet",
};
