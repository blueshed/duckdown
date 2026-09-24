title: Collections
description: A folder of items — a gallery, a catalogue, a discography — kept as data in one file, and shown by pages you write once.
toc: true

# Collections

Some folders aren't a handful of pages you write. They're four hundred
paintings, each with a picture, a title and a caption, and the only thing that
differs between them is those three things. Writing four hundred markdown files
would be four hundred chances to get the template wrong.

A **collection** keeps two things apart:

- **The data** — `collection.json` in the folder: what every item is made of,
  and the items.
- **The pages that show it**, written in markdown like everything else. One
  page beside the data, the **each: page**, is the page every item gets, at
  `/<folder>/<slug>/`. Any page with `{{items}}` in it is an **overview** —
  and one collection can have as many as you like: by section, by year, by
  print, with no second copy of anything.

Every item with a page gets an entry in search and in the sitemap too.

Look at [the gallery](/gallery/) in this site, and at `pages/gallery/` — its
`collection.json`, its `item.md`, and its `index.md`.

## The file

```json
{
  "fields": [
    { "name": "src", "kind": "image", "label": "Picture" },
    { "name": "title", "label": "Title" },
    { "name": "caption", "kind": "long", "label": "Caption" },
    { "name": "year", "label": "Year" }
  ],
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
| `fields` | What an item is made of: each a `name`, a `kind` — `text`, `long`, `image` or `number` — and a `label` for the editor. Without it, an item is a picture in `src`, a `title` and a `caption` |
| `images` | Where the pictures are — a base URL, or `{ "src", "thumb", "suffix", "extension" }`. Without it, `/static/images/` |
| `labels` | A label for a value, shown in an overview's heading: `1961 - Early work` |
| `groups` | The sections, in order. Each has a `name`, an optional `label`, its `items`, and optionally `groups` of its own |

An **item** gives a value for its fields — you group by them and show them on
its page. The one field of kind `image` is the picture's filename. An item may
also say `slug` and `aliases`, which are duckdown's own. A key the fields don't
declare is a mistake duckdown tells you about, in the editor and in the export.

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
outside the folder it shows — or the page says which collection it means, in
its front matter. `/by-year.html` in this site is one page carrying:

```markdown
title: Gallery by year
collection: gallery

{{items by=year}}
```

How each work looks in the grid is a template too, named in the tag — the
overview's counterpart of the each: page's `layout:`. `/by-year.html` actually
says `{{items by=year template=tile}}`, and `templates/tile.html` is filled once
per work with the same placeholders an each: page takes:

```html
<a class="item" href="{{item-href}}">
  <img class="thumb" src="{{item-thumb}}" alt="{{item-title}}" loading="lazy">
  <span class="item-title">{{item-title}}</span>
  <span class="item-caption">{{item-caption}}</span>
</a>
```

Without `template=`, a work is a thumbnail and its title.

The groups come in the order their values first appear in the file. To
order them by value instead — years as numbers, anything else as words —
say so: `{{items by=year sort=asc}}` puts the oldest first, `sort=desc`
the newest. Items inside a group keep the file's order either way.


`{{groups}}` is the section menu — each group linking to its first item. On an
item's page the group being read is marked. It takes a collection name too
(`{{groups gallery}}`), so a home page can carry it.

All three work in a page's markdown and in a template. Inside a code span or a
fence they're printed as written, which is how this page shows them.

## The item page

`pages/gallery/item.md` is the page every work gets. It says `each: true` —
it serves the collection in its own folder — and the rest is an ordinary page:

```markdown
each: true
layout: item

<figure class="work">
  <img src="{{item-src}}" alt="{{item-title}}">
  <figcaption>{{item-caption}}</figcaption>
</figure>
```

Its body, its `title:` and `description:`, and the template its `layout:`
names all take these:

| Placeholder | What it fills with |
|-------------|--------------------|
| `{{item-<field>}}` | The item's value for that field: `{{item-title}}`, `{{item-caption}}`, `{{item-year}}`. Escaped, and empty when unset |
| `{{item-src}}`, `{{item-thumb}}` | The picture and its thumbnail, as full URLs — `src` being this collection's image field |
| `{{item-href}}` | The item's own address |
| `{{prev}}`, `{{next}}` | Links to the items either side, wrapping |
| `{{group}}` | The label of the group this item is in |
| `{{groups}}` | The section menu, this item's group marked |

This site's `templates/item.html` carries the frame around it:

```html
<p class="back"><a href="/by-year.html#{{item-year}}">← {{group}}</a></p>
{{content}}
<nav class="item-nav">{{prev}}{{next}}</nav>
{{groups}}
```

An overview's headings carry the value as their `id` — `id="1961"` — so
`href="/by-year.html#{{item-year}}"` takes a reader back to the place they came
from. A value with spaces in it is turned into a slug for the `id`, so keep the
values you link to simple.

`{{title}}`, `{{description}}`, `{{url}}`, `{{nav}}` and the rest are there as
on any page: an item is a page. Its title is the item's `title` unless the
each: page says `title:`; its description, the `caption`.

The each: page itself is not a page — `/gallery/item` is a 404 — and without
one, a collection has no item pages at all: its overviews show the works
without links. In the editor, the preview of an each: page is the page of the
first item.

## Editing one in the editor

You don't have to write the JSON. In the editor, `collection.json` is in the
tree beside the folder's pages, with a grid icon; and opening a folder's index
page brings its collection up beneath it by itself, so you edit the works and
watch the overview redraw next to them.

- **Starting one**: the grid icon at the top of the tree asks for a folder
  name, and writes the data, an `item.md` for the works' pages, and an
  `index.md` showing them — then opens it, ready for pictures.
- **The fields** are edited where they sit, one box per field the file
  declares. Anything else on an item — a `slug`, its `aliases` — is left
  exactly as it was.
- **Renaming a work** changes its address, because the slug comes from the
  title — so the old address goes into its `aliases` and keeps leading there,
  and the message line tells you. A work you added this sitting was never
  published, so it gets none.
- **Order**: drag a work by its picture, inside its group or into another one,
  or use the up and down arrows. Groups move with theirs.
- **Groups**: add one, add a subgroup inside one, rename it, remove it.
- **A picture**: drop one on a group, or click *Drop a picture here* to choose
  it. Duckdown puts the original where this collection's `images` says its
  pictures live, writes a 128px thumbnail beside it under the collection's own
  naming rule, and adds the work — then give it a title and a caption.
- **Replacing a picture**: drop a new one on the work's own picture. It is
  written under the same file name, so the work keeps its address and
  everything that links to it goes on working.

Every change writes the whole file, which is what drops the caches, so the
preview and the site follow at once.

> [!TIP]
> **Undo** (⌘Z, or the arrow in the pane's header) takes back the last change,
> and keeps going back for as long as the pane is open; **Redo** (⇧⌘Z) goes
> forward again. After that, the clock in the header — **Earlier versions** —
> has the file as it was before each sitting, and puts any of them back.

Two things the pane can't do for you. A collection whose pictures live off the
site — a bucket, a CDN — says so and offers no way to add one: the editor can
only write this site's own `static/images/`, so name the item and put the file
where it belongs yourself. And moving or removing works can shift an address
ending `-1` or `-2`; give a work that matters a `slug` of its own.

## Old addresses

Moving a gallery onto duckdown changes every address. `aliases` keeps the old
ones working — a request for one is a **301** to where the item lives now:

```json
{ "title": "First Light", "aliases": ["/first-light-1961", "/old/first-light"] }
```

A page can do the same in its front matter, one line each (renaming a page in
the editor writes the line for you):

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

- **`collection.json` lives in `pages/`**, beside the folder's pages, not
  in `static/`. It's written through the editor like any other file in there,
  and saving it is what drops the caches.
- **The folder still needs an `index.md`** — that's the page at `/gallery/`,
  the thing in the navigation, and where you'd put `{{items}}`.
- **An item has no markdown of its own.** Everything it says is a field; the
  each: page decides how it looks, for all of them at once. If one item needs
  prose, it wants to be a page.
- **The data never names a template.** A second way of showing the works is a
  second page, not a change to the file.
- **`skip` is duckdown's word**: as a field's value it means "not in that
  overview", and `{{item-<field>}}` fills as nothing for it.
