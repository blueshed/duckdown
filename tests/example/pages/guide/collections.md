title: Collections
description: One file describes a folder of items — a gallery, a catalogue, a discography — and duckdown gives each one a page.
toc: true

# Collections

Some folders aren't a handful of pages you write. They're four hundred
paintings, each with a picture, a title and a caption, and the only thing that
differs between them is those three things. Writing four hundred markdown files
would be four hundred chances to get the template wrong.

A **collection** is `collection.json` beside a folder's `index.md`. It lists
the items; duckdown gives each one a page at `/<folder>/<slug>/`, an entry in
search and in the sitemap, and a place in `{{items}}` — the overview that
writes itself.

Look at [the gallery](/gallery/) in this site, and at
`pages/gallery/collection.json` beside it.

## The file

```json
{
  "layout": "item",
  "images": { "src": "/static/images/gallery/", "suffix": "_tn" },
  "labels": { "year": { "1961": "Early work" } },
  "groups": [
    {
      "name": "paintings",
      "label": "Paintings",
      "items": [
        {
          "src": "one.svg",
          "title": "First Light",
          "caption": "First Light, 1961. Ink on paper, 40 x 40 cm.",
          "year": "1961",
          "aliases": ["/first-light-1961"]
        }
      ],
      "groups": [
        { "name": "studies", "label": "Studies", "items": [] }
      ]
    }
  ]
}
```

| Key | What it does |
|-----|--------------|
| `layout` | The template every item wears: `templates/item.html`. Defaults to `item` |
| `images` | Where the pictures are — a base URL, or `{ "src", "thumb", "suffix", "extension" }`. Without it, `/static/images/` |
| `labels` | A label for a value, shown in an overview's heading: `1961 - Early work` |
| `groups` | The sections, in order. Each has a `name`, an optional `label`, its `items`, and optionally `groups` of its own |

An **item** says `src` (the picture's filename), `title`, `caption`, and
whatever else you want: `year`, `medium`, `catalogue`. Those extra keys are its
**fields** — you group by them and read them in the template.

> [!NOTE]
> The order of the items in the file is the order `{{prev}}` and `{{next}}`
> follow, right through the groups, and it wraps: the last item's next is the
> first.

## Addresses

An item lives at `/<folder>/<slug>/`. The slug comes from the title, cleaned
down to lowercase letters, digits and dashes — `L"Etoile 1976` becomes
`l-etoile-1976`, `Café Ölé` becomes `cafe-ole`. Two items of the same name get
`-1` and `-2`, in the order the file lists them. Give an item its own `slug` if
you'd rather choose.

If an item's address is already a page in that folder, the page wins and the
item can't be reached. Duckdown says so in the editor and in `bun run export`,
naming the item — rename it, or give it a slug of its own.

## Pictures

`src` is a filename; where it lives is said once:

```json
"images": {
  "src": "https://pictures.example.com/original/",
  "thumb": "https://pictures.example.com/thumbnails/",
  "suffix": "_tn",
  "extension": ".png"
}
```

- `src` — the base for the full-size picture. A plain string in place of the
  object means just this.
- `thumb` — the base for thumbnails, when they live somewhere else. Defaults to
  `src`.
- `suffix` — goes before the extension: `Anna.jpg` → `Anna_tn.jpg`. `_tn` unless
  you say otherwise.
- `extension` — when every thumbnail is a `.png` whatever the original was.

A gallery's originals are usually far too big for the site's own `static/`, so
they can sit in a bucket or on a CDN and the site links them. Nothing else
changes.

## Overviews

`{{items}}` in a page is the collection's groups, each a grid of thumbnails
linking to the item pages:

```markdown
{{items}}
```

`{{items by=<field>}}` regroups the same items by one of their fields — one
grid per distinct value, in the order the values first appear. An item whose
value is `skip` isn't shown at all, which is how a work stays out of the prints
list without leaving the collection:

```markdown
{{items by=year}}
```

Either form takes the name of a collection first, so an overview can live
outside the folder it shows. `/by-year.html` in this site is one page carrying:

```markdown
{{items gallery by=year}}
```

`{{groups}}` is the section menu — each group linking to its first item. On an
item's page the group being read is marked. It takes a collection name too
(`{{groups gallery}}`), so a home page can carry it.

All three work in a page's markdown and in a template. Inside a code span or a
fence they're printed as written, which is how this page shows them.

## The item template

`templates/item.html` is an ordinary template with a few more placeholders:

```html
<p class="back"><a href="/by-year.html#{{item-year}}">← {{group}}</a></p>
<figure class="work">
  <img src="{{item-src}}" alt="{{item-title}}">
  <figcaption>{{item-caption}}</figcaption>
</figure>
<nav class="item-nav">{{prev}}{{next}}</nav>
{{groups}}
```

| Placeholder | What it fills with |
|-------------|--------------------|
| `{{item-<field>}}` | Anything the item says, by name: `{{item-title}}`, `{{item-caption}}`, `{{item-year}}`. Escaped, and empty when unset |
| `{{item-src}}`, `{{item-thumb}}` | The picture and its thumbnail, as full URLs |
| `{{item-href}}` | The item's own address |
| `{{prev}}`, `{{next}}` | Links to the items either side, wrapping |
| `{{group}}` | The label of the group this item is in |
| `{{groups}}` | The section menu, this item's group marked |

An overview's headings carry the value as their `id` — `id="1961"` — so
`href="/by-year.html#{{item-year}}"` in the template takes a reader back to the
place they came from. A value with spaces in it is turned into a slug for the
`id`, so keep the values you link to simple.

`{{title}}`, `{{description}}`, `{{url}}`, `{{nav}}` and the rest are there as
on any page: an item is a page.

## Old addresses

Moving a gallery onto duckdown changes every address. `aliases` keeps the old
ones working — a request for one is a **301** to where the item lives now:

```json
{ "title": "First Light", "aliases": ["/first-light-1961", "/old/first-light"] }
```

A page can do the same in its front matter, one line each:

```markdown
title: Moved
aliases: /old-place
aliases: /older-place.html
```

Aliases are matched on the decoded address, so an old slug holding a quote, a
backtick or a curly apostrophe still works. `bun run export` writes each one as
a small redirect page, so a published site keeps them too.

## Styling

`{{items}}` gives you plain classes — `.collection`, `.group`, `.items`,
`.item`, `.thumb`, `.item-title` — and `{{groups}}` gives `.groups`. All of it
is drawn from the variables in `site.css`, so `theme.css` reaches it:

```css
:root {
  --thumb: 12rem;      /* how big a thumbnail is */
  --thumb-gap: 1.5rem; /* how far apart */
}
```

## What catches people out

- **`collection.json` lives in `pages/`**, beside the folder's `index.md`, not
  in `static/`. It's written through the editor like any other file in there,
  and saving it is what drops the caches.
- **The folder still needs an `index.md`** — that's the page at `/gallery/`,
  the thing in the navigation, and where you'd put `{{items}}`.
- **An item has no markdown.** Everything it says is a field, and the template
  decides how it looks. If an item needs prose, it wants to be a page.
- **`skip` is duckdown's word**: as a field's value it means "not in that
  overview", and `{{item-<field>}}` fills as nothing for it.
