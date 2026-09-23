// Where an item of a collection lives, and how an old address is compared.
//
// Pure string work, in a module of its own for the reason images.ts is: both
// ends need it. The server gives every item its address when it reads
// collection.json; the editor's collection pane works out the same addresses
// before and after a title changes, so that a renamed work can keep the one it
// had. Two rules that agreed nearly would alias an address nobody ever served,
// or miss the one that was — so the rule is written once and read from both.

// The only shape a slug ever has. Item addresses are built from titles, and a
// title may hold quotes, backticks, curly apostrophes and accents; a slug that
// kept any of those would be percent-encoded in the browser's request and
// compared against its unencoded self, which is how a gallery ends up serving
// the wrong painting with a 200. So: fold the accents, keep letters and
// digits, and let everything else be a dash.
export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function slugify(text: string): string {
  return text
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // Café Ölé → Cafe Ole
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// A name not yet taken: the base itself, then base-1, base-2, in the order
// they are asked for.
export function unique(base: string, taken: Set<string>): string {
  let name = base;
  for (let i = 1; taken.has(name); i++) name = `${base}-${i}`;
  taken.add(name);
  return name;
}

// The slugs of one collection's items, handed out in file order. An item's
// own `slug` wins when it says one (cleaned if it isn't one); otherwise its
// title; and a title with nothing usable in it (a work called "…") takes a
// number by position, which is stable as long as the item stays where it is.
// Two items that come out the same take -1, -2 after the first.
export function slugger(): (stated: string | null, title: string) => string {
  const taken = new Set<string>();
  let position = 0;
  return (stated, title) => {
    position++;
    const own = stated === null ? "" : SLUG.test(stated) ? stated : slugify(stated);
    return unique(own || slugify(title) || `item-${position}`, taken);
  };
}

// An address reduced to the one form aliases are compared in: decoded (the
// caller's job, decodePath), rooted, and without the trailing slash or .html
// that name the same place. A legacy address may hold anything a URL can
// carry — `/l"etoile-1976` — which is exactly why it is compared decoded.
export function aliasKey(path: string): string {
  const trimmed = path.replace(/\.html$/, "").replace(/\/+$/, "");
  return trimmed.startsWith("/") ? trimmed || "/" : `/${trimmed}`;
}

// An item's address: its folder, its slug, and the slash that makes it a
// folder with an index.
export const itemHref = (folder: string, slug: string) => `/${folder ? `${folder}/` : ""}${slug}/`;
