# Duckdown reference

1. [The content folder](#the-content-folder)
2. [Pages and URLs](#pages-and-urls)
3. [Front matter](#front-matter)
4. [Markdown](#markdown) — headings and contents lists, callouts, wiki links, images, raw HTML
5. [Navigation](#navigation)
6. [Collections](#collections) — a folder of items written once, in collection.json
7. [Styling](#styling) — the variables, dark mode, one page, a kind of page
8. [The site template](#the-site-template)
9. [Static files and images](#static-files-and-images)
10. [Users](#users)
11. [The editor](#the-editor)
12. [Search](#search)
13. [Publishing](#publishing)
14. [Troubleshooting](#troubleshooting)

## The content folder

`.env` says where the site is:

| Setting | Meaning |
|---------|---------|
| `DUCKDOWN_PATH=./site` | The content folder on disk (`./site` in a new project; `./.dev-site` in the duckdown repo) |
| `DUCKDOWN_SEED=./tests/example` | Duckdown repo only: the first run copies this into `DUCKDOWN_PATH` when that folder is missing |
| `DUCKDOWN_BUCKET`, `DUCKDOWN_PREFIX` | Content in S3 (bucket, key prefix) instead of on disk |

```
<content folder>/
├── pages/
│   ├── index.md          /              (also /index.html)
│   ├── about.md          /about.html    (and /about)
│   ├── blog/
│   │   ├── index.md      /blog/          — in the nav
│   │   └── first-post.md /blog/first-post.html
│   └── gallery/
│       ├── index.md      /gallery/
│       └── collection.json  a folder of items: each one a page at /gallery/<slug>/
├── static/
│   ├── site.css          duckdown's base, drawn from CSS variables
│   ├── theme.css         this site's own look, linked after it
│   ├── favicon.ico
│   └── images/
├── templates/
│   └── site.html         wraps every page and links the stylesheets
├── reports/              optional: what the site's own tasks leave for its editors (see The editor)
└── users.json            who can sign in
```

## Pages and URLs

- Every `pages/**/*.md` is a page at the same path with `.html`, or without an extension: `pages/blog/first-post.md` is `/blog/first-post.html` and `/blog/first-post`.
- `pages/index.md` is `/`, and a folder is served by its index: `/blog`, `/blog/` and `/blog/index.html` all reach `pages/blog/index.md`. The shortest is the page's canonical address — what the nav links to and what the page declares — so write links that way. A page of the same name wins over a folder (`blog.md` before `blog/index.md`).
- Names may contain spaces (`About us.md` is `/About%20us.html`), but lowercase-with-dashes names make tidier URLs.
- A folder whose name starts with `-` (say `-drafts/`) is left out of the navigation; its pages are still served to anyone with the URL. Names starting with `.` aren't listed in the editor.
- A page that doesn't exist is a plain 404 — unless the site has `pages/404.md`, which is then the answer (with a 404 status). `bun run export` writes it as `404.html`, the file a static host serves for a miss. It stays out of the navigation, `{{pages}}` listings, search and the sitemap. The seed has one to copy.
- `robots.txt`, `favicon.ico` and `apple-touch-icon.png` in `static/` are also answered at the site's root (`/robots.txt`), where crawlers and phones look, and exported there too, as well as at `/static/…`. `apple-touch-icon.png` is the picture a phone puts on its home screen: a square PNG, 180×180 is plenty. An iPhone asks for it under several names (`-precomposed`, `-120x120`…) and every one of them answers with it, so one file is all a site needs; `<link rel="apple-touch-icon" href="/static/apple-touch-icon.png">` in a template says so too. A person in the editor sets both from one picture in **Resources → icon**; a session can write the two files itself.

## Front matter

`key: value` lines at the very top of a page, then a blank line.

| Key | What it does |
|-----|-------------|
| `title` | The page's `<title>`; `duckie` if absent. A folder's `index.md` title is also its nav label, unless it has a `nav` |
| `nav` | In a folder's `index.md` only: its label in the navigation |
| `toc` | `true` (or `yes`) adds a contents list under the page's title |
| `layout` | `post` wraps the page in `templates/post.html`, falling back to `site.html` |
| `description` | The page's description, for `<meta name="description">` and `og:description` |
| `image` | The picture on the card a shared link shows (`og:image`): `images/cover.jpg` (under `static/`), a site path (`/static/images/cover.jpg`) or a full URL. An item's own picture is its card without saying so; an each: page may name another (`image: {{item-detail}}`) |
| `date` | Orders a folder's `{{pages}}` listing, newest first, and is shown beside the link (ISO: `2026-09-19`) |
| `order` | In a folder's `index.md` only: a whole number, for where that folder sits among its siblings in the navigation and `{{sitemap}}` |
| `draft` | `true` keeps the page off the site, the nav and listings; signed in to the editor, you still see it |
| `aliases` | An address this page used to answer at; a request for it is a 301 to this page. Repeat the line for more than one |
| `each` | This page is the page every item of a collection gets, not a page of its own: `each: true` in a folder that has a `collection.json` (see Collections) |
| `feed` | In a folder's `index.md` only: `feed: true` gives the folder an Atom feed at `/<folder>/feed.xml` of its dated pages — see [A feed](#a-feed) |
| `collection` | The collection a bare `{{items}}` or `{{groups}}` on this page means, when it isn't the page's own folder's: `collection: gallery` |

- A plain block may hold **only those keys**, or one starting `x-` (your own). At the first line that isn't one, the block ends and everything from there is content — so prose opening `Update: closed on Monday` keeps its first line, and a mistyped key appears on the page instead of vanishing.
- For other keys, fence the block and put anything in it:

```markdown
---
title: My Page
author: Peter
tags: shop, opening
---
```

- Keys are case-insensitive. A key given twice keeps both values; duckdown uses the first. A fence nobody closes isn't front matter at all: the page keeps every line.

## Markdown

GitHub-flavoured markdown: headings, emphasis, `~~strikethrough~~`, links, lists, `- [x]` task lists, tables (a wide one scrolls sideways in a box of its own on a narrow screen), fenced code (shown plain — no syntax highlighting), quotes and bare URLs, which become links.

### Headings and contents lists

Every heading gets an id — its text in lower case with dashes (`## Getting started` is `#getting-started`; a repeat becomes `-1`, `-2`) — and links to itself, so readers can copy a link to any section.

`toc: true` puts a contents list of the page's `##` and `###` headings just after its first `#` heading (or at the top of a page without one). A page with no `##` or `###` headings gets no list.

### Callouts

GitHub's alert syntax: a quote that opens with a marker becomes a titled, coloured box.

```markdown
> [!NOTE]
> Useful information that readers should know.

> [!WARNING]
>
> The text may also follow a blank quote line.
```

The five markers are `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` and `[!CAUTION]`, in any case. The marker must open the quote; any other quote stays a plain quote. Their colours are theme variables (`--note` … `--caution`).

### Links between pages

| You write | It links to |
|-----------|-------------|
| `[[themes]]` | `themes.html` in the same folder as this page |
| `[[themes\|the Themes guide]]` | The same, labelled "the Themes guide" |
| `[[/index]]` | `/index.html` — a leading `/` starts from the top of the site |
| `[[images#adding-images]]` | A heading on another page |
| `[[#callouts]]` | A heading on this page |

`.md` on the end is optional. Without a `|label`, the link reads as you wrote it (`[[/index]]` shows "/index"). On a served site links aren't checked: one to a page that doesn't exist is a 404. (`bun run export` does check them.) (Inside a table cell, write the `|` as `\|`, as above.)

### Images

```markdown
![A duck](/static/images/logo.svg)

<img src="/static/images/logo.svg" alt="A duck" width="120">
```

Markdown images take the width of the text at most; use HTML to size one.

**Say what the picture shows.** The words in `![…]` (or `alt="…"`) are what a screen reader says instead of the picture, and what shows if it doesn't load: "Hermit crab in a whelk shell", not "image" or the file name. A picture that is only decoration — a flourish, or a thumbnail whose title is printed right beside it — gets empty words, `![](…)` or `alt=""`, so it isn't read out at all.

**Colouring an SVG with CSS.** An SVG shown with `![…](…)` or `<img>` is sealed off: the page's CSS can't recolour it. Use it as a mask instead — an empty element on the page, painted by CSS:

```html
<span id="logo" role="img" aria-label="duckdown"></span>
```

```css
#logo {
  display: block;
  width: min(320px, 100%);
  aspect-ratio: 1;
  background: var(--duck, currentColor);        /* theme.css can set --duck */
  -webkit-mask: url(/static/images/logo.svg) center / contain no-repeat;
  mask: url(/static/images/logo.svg) center / contain no-repeat;
}
```

Drawn parts take the background; transparent parts stay transparent (the duck's eye and wing are holes). Leaving it `currentColor` makes it follow the text, dark mode included. That's the home page's logo. A mask gives one colour: for a multi-coloured drawing, paste the `<svg>` into the page and style its parts. `<use href="file.svg#id">` only works in Firefox — don't rely on it.

When writing an SVG by hand, remember it's XML: a comment may not contain `--`, so notes mentioning a CSS variable belong in a CSS comment inside `<style>`. An invalid file renders as nothing at all.

### Raw HTML

HTML in a page is passed through as written, scripts included, on the published site. The editor's preview is sandboxed: it shows the HTML but runs no scripts.

### Listing a folder

`{{pages}}` in a page lists the pages beside it — newest first by `date:`, each with its `description:` — as `<ul class="pages">`. A folder's `index.md`, drafts, files starting with `-` and anything that isn't `.md` are left out. It's how a blog index keeps itself.

`{{sitemap}}` is the same made recursive, for a page a reader can read: every page on the site as nested `<ul class="sitemap">`, the site's front page first, each folder labelled by its index's `title:` and linked to it, pages newest first as `{{pages}}` has them, and folders after them by name. Drafts, `404.md`, folders starting with `-` or `.`, and folders with nothing to show are left out. Like `{{pages}}` it stays as written inside code, so a page can document it, and it works in an export. Put it in a `pages/sitemap.md` (which stays out of the nav, since only folders' indexes are in it) and link that from the 404 page.

### A feed

`feed: true` in a folder's `index.md` (the root's too, at `/feed.xml`) lets a reader follow the folder in a feed reader: `/<folder>/feed.xml`, Atom, the pages `{{pages}}` lists there, newest first — but only those with a `date:` a machine can read (`2026-09-21`, or with a time: `2026-09-21T10:30:00Z`), because a feed is what's new. Each entry is the page's title, address, date, `description:` as its summary, and the whole rendered page. Drafts never go in. `{{feed}}` in the template is the `<link rel="alternate">` that lets a browser find it (the seed's templates have it; an older site adds it beside `{{description}}`). The export writes `feed.xml` only when `DUCKDOWN_ORIGIN` is set — its addresses must be absolute — and without it `{{feed}}` is empty, so nothing links to a feed that wasn't written.

### Not supported

Maths (`$x^2$` stays as written), emoji shortcodes, and syntax highlighting in code blocks. Duckdown carries no library for them, but a site can: add KaTeX or MathJax (maths) or highlight.js or Prism (code) to `templates/site.html`, and the pages stay plain markdown. The editor's preview runs no scripts, so the result shows on the site rather than in the preview.

## Navigation

- Built from every folder's `index.md`: the root's first, then each folder's, depth first, folders in alphabetical order.
- Each entry's label is the page's `nav:`, else its `title:`; an `index.md` with neither, or one marked `draft: true`, isn't listed. Folders starting with `-` or `.` are skipped, with everything inside them.
- Plain pages (`about.md`) are never listed: give a page a folder (`about/index.md`) to put it in the navigation.
- Order follows each folder's `order:` (a whole number, on its own `index.md`) — folders that set it come first, lowest first; folders that don't come after, in alphabetical order by name, so a site that never sets it sees no change. `{{sitemap}}` follows the same order, so the two never disagree.
- The link for the page being viewed gets `aria-current="page"`; failing that, its section's link (the nearest folder above it with an `index.md`, never the root) gets `aria-current="true"`. The stylesheet underlines either.
- In development (`DEBUG=1`) it's built on every request, so pages written straight to disk appear immediately. In production it's built once and rebuilt whenever a page is saved or deleted through the editor; files placed there any other way need a restart.

The template receives it as:

```html
<nav><ul class="nav">
<li><a href="/">Home</a></li>
<li><a href="/blog/index.html" aria-current="true">Blog</a></li>
</ul></nav>
```

## Collections

Some folders aren't pages you write one at a time: a gallery of four hundred
works, a catalogue, a discography. A **collection** is two things, kept apart:

- **The data**: `collection.json` in the folder — what every item is made of
  (its `fields`), and the items themselves, in groups.
- **The pages that show it**, written in markdown like any other page. An
  **each: page** beside the data is the page every item gets, at
  `/<folder>/<slug>/`. An **overview** is any page with `{{items}}` in it. One
  collection can have several overviews — by section, by year, by print —
  without a second copy of anything, which is why the data never names a
  template.

Every item with a page also gets an entry in search and the sitemap and a file
in the export.

**Making one** is three files in the folder — write them in this order:

```text
pages/works/collection.json   the data: fields, then groups of items
pages/works/item.md           each: true  — the page every item gets
pages/works/index.md          {{items}}   — the overview
```

```json
{
  "fields": [
    { "name": "src", "kind": "image" },
    { "name": "title" },
    { "name": "caption", "kind": "long" }
  ],
  "images": "/static/images/works/",
  "groups": [
    { "name": "Paintings", "items": [
      { "src": "battersea.jpg", "title": "Battersea", "caption": "Wax crayon on paper, 1961." }
    ] }
  ]
}
```

```markdown
each: true
title: {{item-title}}

<figure>
  <img src="{{item-src}}" alt="{{item-title}}">
  <figcaption>{{item-caption}}</figcaption>
</figure>

{{prev}} {{next}}
```

```markdown
title: Works

# Works

{{items}}
```

Then check it: `bun run export` names everything wrong with the file — a key
the fields don't declare, a slug that collides with a page, an each: page that
isn't in the collection's folder — and `--strict` fails on them. An
`{{item-…}}` or `by=` naming a field that isn't declared is said in the log as
the page renders.
The thumbnails are `battersea_tn.jpg` beside the originals unless `images` says
otherwise (see Pictures).

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
      "groups": [{ "name": "studies", "label": "Studies", "items": [] }]
    },
    { "name": "prints", "label": "Prints", "items": [] }
  ]
}
```

| Key | What it does |
|-----|--------------|
| `fields` | What an item is made of: `name`, `kind` (`text`, `long`, `image` or `number`; `text` if unsaid) and an optional `label` for the editor. A bare `"year"` is a text field. Unsaid, an item is `src` (the picture), `title` and `caption` |
| `images` | Where the pictures are: a base URL, or `{ "src", "thumb", "suffix", "extension" }`. Defaults to `/static/images/` |
| `labels` | Per field, a label for a value: an overview's heading reads `1961 - Early work` |
| `groups` | The sections, in order: `name`, optional `label`, `items`, and optionally `groups` of their own |

An item says a value for any of the fields, and optionally `slug` and
`aliases`, which are duckdown's own. The one field of kind `image` is the
picture: a filename, resolved against `images`, and what the thumbnails are
made from. The kinds say what the editor offers for a field; every value is
kept as written (a `number` field may still say `skip`).

Duckdown checks the file against its fields and says what doesn't fit — in the
log, the editor's message line, and `bun run export` (`--strict` fails on it):
an item using a key that isn't declared, a second image field, a kind it
doesn't know. A page or template asking for `{{item-yaer}}` or
`{{items by=yaer}}` is said in the log too. Anything the file isn't shaped like
is skipped rather than believed.

`"layout"` in `collection.json` (0.4's way of naming the item template) makes
no pages any more, and is said as a problem: write the each: page beside it
(`item.md`, `each: true`, `layout: <that template>`) and take `layout` out.

### Order, slugs and addresses

- The order of the items in the file, right through the groups, is the order
  `{{prev}}` and `{{next}}` follow. It **wraps**: the last item's next is the
  first.
- An item's slug comes from its title, folded to `[a-z0-9-]`: `L"Etoile 1976` →
  `l-etoile-1976`, `Café Ölé` → `cafe-ole`. Quotes, backticks and curly
  apostrophes never survive into an address, because a slug that kept one would
  arrive percent-encoded and never match. A title with nothing usable in it
  gets `item-<n>` by position; two of the same name get `-1`, `-2`, in file
  order. An item may state its own `slug`, which must be of that shape.
- `/gallery/first-light`, `/gallery/first-light/` and
  `/gallery/first-light/index.html` all reach the item, as they would a folder.
  An address the collection doesn't hold is a plain 404 — never the nearest
  item to it.
- If an item's address is already a page in that folder, the **page wins** and
  the item can't be reached. Duckdown says so in the editor's message line and
  in `bun run export` (where `--strict` fails on it), naming the item.

### Pictures

The image field holds a filename; where the pictures live is said once for the
collection. A gallery's originals are usually far too big for the site's own
`static/`, so they can sit in a bucket or on a CDN:

```json
"images": {
  "src": "https://pictures.example.com/original/",
  "thumb": "https://pictures.example.com/thumbnails/",
  "suffix": "_tn",
  "extension": ".png"
}
```

`thumb` defaults to `src`; `suffix` goes before the extension (`Anna.jpg` →
`Anna_tn.jpg`) and is `_tn` unless you say otherwise; `extension` replaces the
original's, for a collection whose thumbnails are all `.png`. A plain string in
place of the object is just `src`. An item with no picture has no thumbnail,
rather than a link to a folder.

### The item page: an each: page

`pages/gallery/item.md` (any name but `index.md`) says `each: true`, and
serves the collection in its own folder: an item lives at its folder and its
slug, so the each: page sits beside the data. A folder has one.

```markdown
each: true
layout: item
title: {{item-title}}

<figure class="work">
  <img src="{{item-src}}" alt="{{item-title}}">
  <figcaption>{{item-caption}}</figcaption>
</figure>
```

Every item's page is that page with these filled in for the item — in its
body, in its `title:` and `description:`, and in the template its `layout:`
names:

| Placeholder | Becomes |
|-------------|---------|
| `{{item-<field>}}` | The item's value for that field: `{{item-title}}`, `{{item-caption}}`, `{{item-year}}`. Escaped, empty when unset or `skip` |
| `{{item-<image field>}}`, `{{item-thumb}}` | The picture and its thumbnail, as full URLs |
| `{{item-href}}`, `{{item-slug}}` | The item's own address, and its slug |
| `{{prev}}`, `{{next}}` | Links to the items either side, wrapping |
| `{{group}}` | The label of the group this item is in |
| `{{groups}}` | The section menu, this item's group marked |

The each: page itself is never a page: `/gallery/item` is a 404 (or the item
of that name), and it is in no listing, search or sitemap. Without `title:` an
item page's title is the item's `title`; without `description:`, its
`caption`. The body can be empty and the template do everything — or the body
can be all of it, in `site.html`. It is markdown, so `![{{item-title}}]({{item-src}})`
works too. The editor previews it as the first item's page.

A collection with no each: page has no item pages: its overviews show the
thumbnails without links.

`{{title}}`, `{{description}}`, `{{url}}`, `{{nav}}`, `{{edit}}` and the rest
fill as on any page — an item **is** a page. `{{edit}}` opens the
`collection.json` it is written in.

A template the item pages wear might carry the rest:

```html
<p class="back"><a href="/by-year.html#{{item-year}}">← {{group}}</a></p>
{{content}}
<nav class="item-nav">{{prev}}{{next}}</nav>
{{groups}}
```

### Overviews

| Placeholder | What it becomes |
|-------------|-----------------|
| `{{items}}` | The collection's groups, each a grid of thumbnails linking to the item pages |
| `{{items by=<field>}}` | One grid per distinct value of that field, in the order the values first appear |
| `{{items by=<field> sort=asc}}` (or `desc`) | The same, with the groups ordered by value: years as numbers, the rest as words. Items inside a group keep the file's order |
| `{{items template=<name>}}` | Each item drawn with `templates/<name>.html` instead of the built-in thumbnail — combines with the rest: `{{items by=year template=tile}}` |
| `{{items <collection>}}`, `{{items <collection> by=<field>}}` | The same for a collection named in the tag |
| `{{groups}}`, `{{groups <collection>}}` | The section menu: each group linking to its first item, the current one marked |

A bare tag means the collection the page's `collection:` names, or else the
page's own folder's (on an item's page, the item's own). So `pages/works/index.md`
needs nothing, and `pages/prints.md` says:

```markdown
title: Prints
collection: works

{{items by=prints sort=asc}}
```

**How an item looks in an overview is a template, as how it looks on its own
page is.** The each: page's `layout:` names the template an item's page wears;
`template=` names the one an item wears in a grid — `templates/tile.html`,
filled for each item with the same placeholders:

```html
<a class="item" href="{{item-href}}">
  <img class="thumb" src="{{item-thumb}}" alt="" loading="lazy">
  <span class="item-title">{{item-title}}</span>
  <span class="item-caption">{{item-caption}}</span>
</a>
```

Duckdown still does the going round — a template never loops — and the groups'
sections and headings around the items stay its own. Without `template=`, an
item is that thumbnail and title without the caption. A template that isn't
there is said in the log and the built-in one stands in.

An item whose field is the string `skip` is left out of `{{items by=…}}`
altogether — that's how a work stays out of the prints list without leaving the
collection.

All of them work in a page's markdown and in a template, and stay as written
inside a code span or fence so a page can document them. A tag naming a folder
with no `collection.json` fills as nothing and says so in the log.

Each heading carries the value as its `id` — `id="1961"`, `id="paintings"` — so
a template can link back to the place a reader came from. A value with spaces
in it is slugified for the `id`, so keep linked values simple.

### Old addresses

`aliases` on an item, or in a page's front matter, keeps an address that has
moved working: a request for it is a **301** to where the thing lives now.

```json
{ "title": "First Light", "aliases": ["/first-light-1961", "/old/first-light"] }
```

```markdown
title: Moved
aliases: /old-place
aliases: /older-place.html
```

Renaming or moving a page in the editor (**Rename or move**, in its header)
adds its old address to its `aliases` for you, and takes off an alias that is
its new address (a page moved back). A draft keeps none: it never had an
address. A folder's `index.md` and an each: page don't move on their own.
Moving a file by hand, outside the editor, add the line yourself.

They are matched on the **decoded** address, so an old slug holding a quote or
a curly apostrophe still answers. `bun run export` writes each alias as a small
redirect page (canonical link plus meta refresh) under the decoded name, so a
published site keeps them too: `/older-place.html` as the file
`older-place.html`, `/old-place` as `old-place/index.html`. An alias that is
already a page is left alone and said, and one with a `.` or `..` segment is
left out and said. So is one the machine running the export can't write under
that name (Windows refuses `"`; a segment over 255 bytes fails anywhere) or
keeps under another spelling: the published site couldn't answer there, and
`--strict` fails on it. The served site answers every alias whatever its name.

### Editing one in the editor

A collection doesn't have to be edited as JSON. In `/edit`, `collection.json`
sits in the tree beside the pages of its folder, with a grid icon; open a
folder's index page and its collection opens beneath it by itself. What the
pane does:

- **Starting one**: the grid icon in the tree's header asks for a folder name
  and writes `collection.json` (picture, title and caption fields, pictures
  under `static/images/<folder>/`), an each: page `item.md`, and an `index.md`
  with `{{items}}` if the folder has none — then opens it with the pane below.
- **The works** are pictures in their groups (a work with no picture field is
  its title in a box). Click one and its properties open in a drawer from the
  left, over the tree, so the preview stays in view: the picture itself, then
  one input per declared field, labelled as the file labels it (a `long` one is
  a text box; with no `fields` in the file, title and caption), and move and
  remove at the foot. Click another work to show that one; Escape puts the
  drawer away. A new work is chosen as it is added.
  Every other key on an item — `slug`, `aliases`, anything undeclared — is kept
  exactly where it was found, and so is everything around the groups
  (`fields`, `images`, `labels`).
- **Renaming keeps the old address.** When an edit moves a work's address (its
  slug comes from its title), the old one goes into its `aliases` — a 301 to
  the new one — and the message line says so. Only an address the file had
  when you opened it: a work added this sitting was never published. Renaming
  back takes the alias out again.
- **Order**: drag a work by its picture, within its group or into another, or
  use the up and down controls beside the chosen one. Groups move with theirs.
- **Groups**: add one, add a subgroup inside one, rename it (the heading edits
  `label` when the group has one, `name` when it hasn't), or remove it.
- **Pictures**: drop one on a group's last tile (the picture with a plus), or
  click it to choose one. The original is written where `images` says its pictures live (into the
  image field) and a 128px thumbnail beside it, named by the collection's own
  `suffix` and `extension` — the new work then needs its fields filled in. Dropping a
  picture **on a work's picture** replaces it in place, under the same file
  name, so the work keeps its address and every link to it goes on working:
  that is the chosen work's picture, in its drawer (click it to choose one).
- A collection whose pictures live off the site (a bucket, a CDN) says so and
  offers no way to add one: the editor can only write the site's own
  `static/images/`. Name the item and put the file there yourself.

Every change writes the whole file at once and the preview redraws with it.
**Undo** (⌘Z, or the header's arrows) steps back through every change made
since the pane opened, and **Redo** (⇧⌘Z) forward again; each step is written.
Beyond that, **Earlier versions** has the file as it was before each sitting.

Moving or removing works can shift a `-1`/`-2` or `item-<n>` address, and
nothing is kept for those: give a work that matters its own `slug`.

### Styling

`{{items}}` emits `.collection`, `.group`, `.items`, `.item`, `.thumb` and
`.item-title`; `{{groups}}` emits `.groups`; the seed's each: page and item template use
`.work` and `.item-nav`. All of it is drawn from the variables, so `theme.css`
reaches it:

```css
:root {
  --thumb: 12rem;      /* how big a thumbnail is */
  --thumb-gap: 1.5rem; /* how far apart */
}
```


## Styling

### The stylesheet

`static/site.css` loads on every page. It draws everything — text, links, code, tables, callouts, the contents list, the navigation — from CSS variables:

| Variable | What it sets |
|----------|-------------|
| `--bg`, `--text` | The page's background and text |
| `--muted` | Quieter text: quotes, the navigation |
| `--accent` | Links, the navigation's current page, the contents list |
| `--border`, `--surface` | Lines, and the background of code, table headings and the contents list |
| `--field-border` | The search box's edge — darker than `--border`, because a box you type in has to be seen (3:1) |
| `--font-body`, `--font-mono` | Fonts for text and for code |
| `--font-heading` | Headings' font; unset, they use `--font-body` |
| `--measure` | How wide the text runs (`46rem`) |
| `--radius` | Corner roundness (`6px`) |
| `--note`, `--tip`, `--important`, `--warning`, `--caution` | Callout colours |

It follows each reader's light or dark setting (`prefers-color-scheme`), with its own dark values for the colours. Every pair it draws text with passes WCAG AA (4.5:1) in both, and duckdown's tests keep it so — a theme that changes a colour should check its own (any contrast checker, text on `--bg` and on `--surface`).

Its rules sit in a cascade layer, `@layer base`; the variables don't. A theme's rules aren't in a layer, so they win by coming later, however plain the selector: `h1 { … }` in `theme.css` restyles every heading without having to out-specify anything.

It also honours a reader's *reduce motion* setting — every animation and transition stops, a theme's included. A theme that animates something should do it inside `@media (prefers-reduced-motion: no-preference) { … }` anyway, as the seed's wobbling duck does.

### The site's look

`templates/site.html` links two stylesheets:

```html
<link href="/static/site.css" rel="stylesheet">
<link href="/static/theme.css" rel="stylesheet">
```

`site.css` is duckdown's base. `static/theme.css` is the site's own, read
second, so it only has to say what differs. Nothing goes on the pages — every
page has both because the template links both.

```css
:root {
  --accent: #b5179e;
  --font-heading: Georgia, "Times New Roman", serif;
  --measure: 40rem;
}

@media (prefers-color-scheme: dark) {
  :root {
    --accent: #f28fdf;
  }
}
```

Any other CSS may follow; setting variables is just the easy, reliable part. Change a colour through its variable rather than by restyling elements, so everything that uses it — links, callouts, the navigation — changes together.

### One page, and one kind of page

`css: poster` in a page's front matter links `/static/poster.css` after the
template's own, for that page alone. The name is a plain word, so a page can't
reach out of `static/`, and a name with no file links nothing rather than
breaking the page.

For a *kind* of page, give it a template: `layout: post` wraps it in
`templates/post.html`, and that template links whatever that kind needs. Then
no page has to remember anything beyond its `layout:`.

### Hooks for extra CSS

`ul.nav` and `a[aria-current]` (navigation) · `nav.toc`, `.toc-h2`, `.toc-h3` (contents list) · `.callout.note` … `.callout.caution` and `.callout-title` · `a.wikilink` · `h2 > a` (a heading's self-link).

In the editor, a stylesheet opens from **Resources → css** in a pane below whatever page you're reading, so the page restyles as you type. With no page open it previews on sample content: navigation, headings, a link, code, a callout, a table.

## The site template

`templates/site.html` wraps every page. Each placeholder is replaced wherever it appears:

| Placeholder | Becomes |
|-------------|---------|
| `{{title}}` | The page's `title`, else `duckie` |
| `{{description}}` | The page's `description` as `<meta name="description">` and `og:description`, and the card a shared link shows: `og:title`, `og:type` (`article` for a page with a `date:`, else `website`), `og:url`, and with an `image:` (or an item's picture) `og:image` and `twitter:card`. The URL and the picture are absolute, so an export without `DUCKDOWN_ORIGIN` leaves them out. A template that writes its own `og:` tags will have them twice: take its own out |
| `{{url}}` | The page's one canonical address — use it as `<link rel="canonical" href="{{url}}">` |
| `{{date}}` | The page's `date` as a `<time>`, written out (`21 September 2026`), or nothing |
| `{{nav}}` | The navigation (above), or nothing |
| `{{feed}}` | `<link rel="alternate" type="application/atom+xml">` for the feed of the folder the page is in, or nothing when that folder has none |
| `{{css}}` | `<link>` for the page's `css:`, or nothing |
| `{{edit}}` | An "Edit this page" link to the editor — only for whoever is signed in |
| `{{x-anything}}` | The page's own `x-anything:` front-matter value, escaped, or nothing when the page doesn't set it |
| `{{include name}}` | `templates/name.html`, pulled in — see below |
| `{{content}}` | The page's rendered markdown |

A page can pass values to its template with `x-` keys: a template with `<img src="{{x-cover}}">` and `<a href="{{x-buy}}">` serves every album, each page saying `x-cover: /static/images/one.jpg` and `x-buy: …`, instead of one template copied per page. Text written in a page is never filled in, only the template's.

`{{include name}}` pulls `templates/name.html` into a template — the seed's own top bar (the nav and the search form) is `templates/site.html` saying `{{include topbar}}` rather than every template pasting the markup in. It's resolved once, before everything else is filled, so what it pulls in can use `{{nav}}`, a page's `{{x-anything}}`, and the rest; what it pulls in is not itself scanned for another `{{include}}` — a template can print the tag in a code span to document it without duckdown expanding it there. A name that isn't a plain word, or names a file that isn't there, fills as nothing. In the editor, an unsaved `templates/name.html` shows in the preview of any page whose template includes it, the same as it would if the page wore it directly.

A page's `layout:` chooses the template (`layout: post` → `templates/post.html`), falling back to `site.html`; the name must be a plain word. Values go in escaped, and a `$` in a page is safe. Without a template, duckdown uses a bare built-in one (title and content only).

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{title}}</title>
  <link href="/static/site.css" rel="stylesheet">
  {{css}}
</head>
<body>
  <a class="skip" href="#content">Skip to content</a>
  {{nav}}
  <main id="content">
    {{content}}
  </main>
</body>
</html>
```

Keep the page's own content in `<main>`, and — when there's a nav before it — the skip link first in `<body>`: the first thing a keyboard reaches, invisible until it has focus, so a reader doesn't tab through the whole nav on every page. `site.css` styles `.skip`. Set `lang` to the language the site is written in.

## Static files and images

- Everything in `static/` is served at `/static/…`, typed by its extension, with an ETag so a browser that has a file is told so, and kept for five minutes.
- `static/site.css` and `static/search.js` are duckdown's base. A site needn't keep copies: with no file of that name they are served and exported from duckdown itself, so upgrading duckdown upgrades them. To change one, make a file of that name — it wins, and is yours from then on; put a site's own look in `theme.css` instead and keep upgrading.
- Keep images in `static/images/`, in folders if you like; refer to them from pages as `/static/images/…`.
- The editor's **Resources** drawer, *images* tab, shows them as a grid of pictures, makes folders (the folder button) and uploads files (**Upload**, several at once). Clicking one shows it, with **Copy Markdown** for the `![name](/static/images/…)` line, names encoded.

## Users

`users.json` in the content folder maps each sign-in name to a password hash:

```json
{
  "admin": "$argon2id$v=19$m=65536,t=2,p=1$…"
}
```

- In the editor, **Editors** (in the header) lists who can sign in and adds one, sets a password, or removes one. Every editor can do all of it; nobody can remove themselves, and the environment's admin (below) is changed only in the environment. A new password is at least 8 characters.
- From a terminal: `duckdown user list`, `duckdown user add <name>`, `duckdown user passwd <name>`, `duckdown user remove <name>` (a vendored site: `bun server/cli.ts user …`). It asks for the password; it never takes one as an argument.
- A new password, or removing someone, signs out every session they had — within a few seconds when done from the terminal while the server runs.
- By hand, a hash is `bun -e 'console.log(await Bun.password.hash("their-password"))'`. A plain password in the file won't sign anyone in.
- The login form's "email" field is just the name as written in the file.
- A new project starts with `admin` / `admin`: replace it before the site goes anywhere. A deployment sets `DUCKDOWN_ADMIN_PASSWORD` (and `DUCKDOWN_ADMIN_USER`, else `admin`) instead, which writes that user at every start.
- Signing in lasts seven days. Production needs `COOKIE_SECRET` set in the environment.
- With no `users.json`, nobody can sign in (the server logs it); with a broken one, the login page says it can't be read.

## The editor

- At `/edit`. Signing in lands there; `/login` when already signed in goes straight there; the home page's "Login to edit" link does the same.
- **Where you are** is said once, by the trail at the top left: the site, the folders down to the one the tree is showing, and the page open in it. Every crumb but the last goes there. Opening a page takes the tree to its folder. Below it the editor is one tray of compartments: the tree, what you're changing, and the preview.
- **The tree** (left): the site's folders and pages, and nothing else — everything a page is composed with lives outside `pages/`. Click a folder to go into it; the trail takes you back up. A folder's `collection.json` is listed there too, with a grid icon, and opens as the collection pane rather than as JSON. Three buttons in the header make a **new page**, a **new folder** (`folder/index.md`, titled with the folder's name) and a **new collection** (see [Editing one in the editor](#editing-one-in-the-editor)). None ever overwrites — each says when a name is taken.
- **Editing** (middle): Save or ⌘⏎. The button lights up while there are unsaved changes, flashes green for "Saved", and red for "Not saved" (the notice says why). The bin deletes the page, after asking.
- **Resources** (a drawer over the preview, from the header): what a page is composed with, in three tabs, the site's icon, and a fifth to read.
  - *images* — the pictures as a grid; browse and upload, and copy a markdown link for one.
  - *css* — the stylesheets in `static/`, the ones a page names with `css:`. Themes aren't here: they belong to a folder, and the tree is where the folders are.
  - *templates* — the files in `templates/`, and a button for a new one.
  - *icon* — the site's icon, shown as a phone's home screen and a light and a dark tab bar show it. **Choose a picture…** takes any picture (an SVG too): the editor cuts its middle square and writes `static/apple-touch-icon.png` (180px, on white, since a phone blacks out transparency) and `static/favicon.ico` (48px, a PNG under that name, which every browser reads), keeping what each replaced in their history. A template's own `<link rel="icon">` or `apple-touch-icon` naming another file wins over both, so the tab names any template that has one and what it links; to use the icon set there, take those lines out (a link to `/favicon.ico` or `/static/apple-touch-icon.png` is the same file and fine).
  - *reports* — the site's `reports/` folder: whatever a task of the site's own (a usage report, say) writes there for its editors, folders newest first. A markdown report opens rendered, in a tab of its own; nothing here is edited, served, exported or seeded, and only a signed-in editor can read it. duckdown writes there only when someone runs `duckdown report` (below).
  - A visitor report for a site whose server logs views (`DUCKDOWN_LOG=1`): feed its log to `duckdown report` — piped (`railway logs | duckdown report`) or as a saved file (`duckdown report site.log`) — and it writes `reports/<month>/<day>.md`: views by readers and by crawlers, the most read pages, addresses that weren't there (worth an `aliases:` line), and the sites that sent readers. It counts exactly the lines it is given, and names no reader.
- **Editing a resource** (a stylesheet or a template, from Resources): it opens in a pane *below* the page, with the same header — name, unsaved dot, delete, Save, and a close button. The page stays where it is, so you can click through pages and watch one stylesheet against each. It's transient: closing the pane leaves nothing behind.
- **Editing a collection** (from the tree, or offered under a folder's index page): the same pane, holding the folder's works rather than a file's text — see [Editing one in the editor](#editing-one-in-the-editor). It shares the slot with a resource: the column holds the page and one thing beneath it, so opening a stylesheet closes the collection and the other way about.
- **The middle column holds whatever is open**, and each pane closes, the page included. Two split it; one fills it. With no page open, a stylesheet or template has the column to itself — which is how you write one from scratch.
- **Preview** (right): what you'd see. With a page open, the page as the site will show it, rendered by the same code — its own template and the stylesheets it links, the navigation, the `{{pages}}` listing, wiki links resolved from the page's folder — sandboxed, so no scripts run. A template open in the pane below is used in place of the saved one when it's the one this page wears, so you watch the page change as you write it; a stylesheet goes straight into the preview's head as you type, after the saved one, so it wins. A link on the page that a reader would follow to nothing — no page, no work, no old address, no file in `static/`, or a draft — is named in the message line (`Links that lead nowhere a reader can go: …`), and the line goes once the link is put right.
- **With no page open**, whatever you're composing with gets a sample page of its own: for a stylesheet, a bit of everything `site.css` styles; for a template, a sample page put through it, with the site's real navigation. So a template or a stylesheet can be written with nothing else on screen.
- **On a phone** (below 768px) the columns stack and the preview has none: the header's **Preview** (an eye) lays it over the page, full height, and **Edit** (or Escape) goes back, the page as it was.
- **Header**: the trail, then *Publish* (when the site publishes from here), *Resources*, *Editors* and *Help* (a cheat sheet for writing and for the editor, the part that fits what is open first) — each a drawer over the preview, one at a time, that leaves the page in view and closes with Escape — *View* (the page on the site), *Logout*.
- **Deleting always asks first**, wherever it is — a page, a stylesheet, a template, a work in a collection — and nothing deleted is gone. **Earlier versions** (the clock in every pane's header) is a place rather than a dialog: the versions list where the tree was — *Now*, then what the file was before each sitting of saves, newest first, the last 30 — and the trail says which you're looking at. The middle shows that version read-only, with the lines that differ from now marked, and the preview renders a page as it was, so you see a version before you bring it back. **Restore** puts it back and keeps what it replaces; the ✕, *Now* or a crumb takes you back, and nothing unsaved is lost while you look. **Deleted** (at the top of the page tree, and of each resource list) is the same place for deleted files. They live in the site's `.history/` folder, beside `pages/` and outside everything the site serves or exports — a site kept in git ignores it (`site/.history/`). The collection pane also has **Undo** and **Redo** for its own changes while it is open.
- **Rename or move** (the folder-arrow in the page's header) gives a page a new name or folder: type its new place (`blog/new-name`; `.md` is added). Unsaved changes are saved first, the old address goes into its `aliases`, and its Earlier versions go with it. It won't move onto a page that exists, a folder's `index.md` or an each: page, or change only a name's case.
- When writing files directly (not through the editor), no version is kept: that is git's job.
- Anything that fails shows in a red notice at the foot of the screen until dismissed; news that isn't a failure (a renamed work keeping its old address) shows there in the accent colour.

## Search

Readers search in the browser. duckdown builds one entry per page and one per
section of it — `url`, `title`, `section`, `description`, `date` and the words
of that section, cut at each heading — and
hands the lot over at `/search.json`; `bun run export` writes the same thing to
`dist/search.json`, so search works on a published site with no server.

- **Every non-draft page is in it**, found the same way the navigation walks
  the folders. There is nothing to register and no index to rebuild by hand.
- **A result takes the reader to the place.** A section's `url` ends `#its-id`,
  the id the page's own heading has (read out of the rendered page, so they
  can't disagree), and the seed's `search.js` shows "Page – Section", shows at
  most three sections of one page, and adds a text fragment (`:~:text=`) so a
  browser that supports it scrolls to and marks the words. Some browsers that
  can't find the words also give up on the heading, so `search.js` (which is on
  every page) scrolls to the heading itself once the page has loaded, if
  nothing else has. Words match where a word starts, so `train` is not found in
  `constraints`. Long pages want real headings, and the result list scrolls
  inside its panel.
- **Drafts are left out.** A result leading to a 404 is worse than no result.
  So is the 404 page.
- **`title` ranks above a section's heading, which ranks above `description`,
  which ranks above the body**, and every
  word of the query has to appear somewhere. A page with a good `title:` and
  `description:` is a page that can be found — which is the practical reason to
  write a description.
- **The matching is the site's own code**, `static/search.js` in the seed,
  included by `templates/site.html` along with a `.search` form. Both are
  editable in the editor. A site that wants search copies them; one that
  doesn't, doesn't.

## Publishing

duckdown deploys two ways. Which one a site is decides whether an edit is live
the moment it's saved, so it's worth knowing before telling anyone a change is
done.

|  | **served** | **published** |
|---|---|---|
| What runs | duckdown | any static host |
| Where the site is | a folder or an S3 bucket | the files `bun run export` writes |
| Editing | at `/edit`, from any browser | locally, then deploy the output |
| A save is live | at once | once it's exported and deployed |
| Needs | `COOKIE_SECRET`, a password, `users.json` | nothing: no login to guard |

```sh
DUCKDOWN_ORIGIN=https://example.com bun run export     # into ./dist
```

- Every page at its one canonical address: `/` and `/blog/` as `index.html`,
  `about.md` as `about.html`. Nothing written twice.
- `static/` copied alongside, bytes and all, with the base files (`site.css`, `search.js`) the site has no copy of; `robots.txt`, `favicon.ico` and `apple-touch-icon.png` (and its `-precomposed` copy) also at the root.
- `sitemap.xml` at the root, from the same list of pages as search (no drafts, no 404 page), with `<lastmod>` from a page's `date:`. It needs `DUCKDOWN_ORIGIN`, being absolute addresses; the export says so when it is missing. The served site answers `/sitemap.xml` too. To point crawlers at it, add `Sitemap: https://example.com/sitemap.xml` to `robots.txt`.
- Links are checked: every relative `href` and `src` that points at nothing in the site is reported as `page -> link`. It reports and carries on; `bun run export --strict` (or `DUCKDOWN_STRICT=1`) makes it a failure, for a deploy that should stop. Other sites, `#fragments` and the editor's own addresses are left alone.
- An export that finds no pages at all — `DUCKDOWN_PATH` unset or wrong, an empty bucket — fails, and leaves `dist/` as it was, rather than publish an empty site and go green.
- Drafts left out rather than hidden — there's no login to hide them behind.
- `{{edit}}` empty, and `{{url}}` from `DUCKDOWN_ORIGIN`, because there's no
  request to take an origin from. Without it the canonical links are relative.
- `dist/` is cleared once there is something to replace it with, so a page deleted since the last export doesn't
  survive in the output.
- It reads through the storage layer, so it will export a live bucket as
  readily as a folder — a served site can be snapshotted without moving its
  content first.

**One address, either way.** Set `DUCKDOWN_ORIGIN` to the site's address
(`https://www.example.com`) and both kinds of site keep to it: a request
under another name — the bare domain when the address is www — is a 301 to
it, path and query kept, and the platform's own `*.up.railway.app` address
and localhost still show the site but answer `noindex` with `robots.txt`
closed, so it is never indexed under a name that isn't its own. Unset, every
name is served. On a served site, set it only once the domain's certificate
is issued: before that, everything would move to an address that can't
answer.

**Publishing from the editor.** A published site kept in git (the scaffold's
layout: the site in `site/`, Railway building from the repository) can be
published from the editor on the machine where it is edited. Set
`DUCKDOWN_REMOTE=git` in that machine's `.env`, and the header gets
**Publish**, with a count of what is waiting:

- **Publish** runs the export's checks, then commits `site/` — only `site/`,
  never `users.json`, `.history/` or `reports/`, and nothing else you have
  staged — with your message (or one naming what changed) and an
  `Edited-by:` line, and pushes it. The platform rebuilds from the push. A
  problem the checks find is shown with what was published; with
  `DUCKDOWN_STRICT=1` it stops the publish instead.
- **Pull** brings in what was published from somewhere else. Edits here that
  aren't committed yet are committed first. A file changed on both sides
  keeps this copy's version, and the published one goes into that file's
  **Earlier versions**, where Restore brings it back. A change outside
  `site/` that collides is left for git.
- If Publish says the published site has moved on, Pull, then Publish again.
- From a terminal: `duckdown publish [message]` and `duckdown pull` (a
  vendored site: `bun server/cli.ts publish …`) do the same.
- It uses this machine's git: its identity, its credentials, its signing.
  The branch needs an upstream (`git push -u` once).

Where the output goes is otherwise the site's own business, not duckdown's:
its README.md or CLAUDE.md says how it's deployed — read whichever it has.
Don't invent a deployment step that isn't written down.

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| A page isn't in the navigation | Not a folder's `index.md`; no `nav`/`title`; its folder starts with `-`; or, in production only, written to disk after the nav was built (save a page in the editor, or restart) |
| A line like `author: Peter` shows up in the page | It isn't a key duckdown reads: fence the block with `---` to keep it as metadata |
| A page is "not found" although the file is there | `draft: true` — sign in to the editor to read it, or take the line out to publish |
| A stylesheet doesn't apply | The template doesn't link it (check `templates/site.html`), or a page's `css:` names a file that isn't in `static/` |
| An SVG ignores the stylesheet's colours | It's shown with `<img>` or `![…]`, which CSS can't reach into: use it as a mask (above) |
| An SVG shows nothing at all | It isn't valid XML — check with `xmllint --noout file.svg`; a `--` inside a comment is the usual culprit |
| A folder's page isn't found | Give the folder an `index.md`: `/blog` is served by `pages/blog/index.md` |
| An item of a collection is "not found" | Its slug isn't what you think: it comes from the title, cleaned to `[a-z0-9-]`. Open `{{items}}` and follow the link, or give the item a `slug` |
| An item's page is a page you wrote | A page in that folder has the same address, and a page always wins. Duckdown names the item in the preview and in `bun run export` |
| `{{items}}` shows nothing | No `collection.json` in that folder (the server log says so) — on a page elsewhere, say `collection: <folder>` — or every item's field is `skip` |
| The thumbnails aren't links, and every item is "not found" | The collection has no each: page: a page in its folder saying `each: true` |
| `{{item-year}}` is empty on every item | The field isn't declared, or is spelt differently — the log names it |
| A `[[wiki link]]` goes to the wrong place | It's relative to the page's folder: start it with `/` to go from the top |
| Nobody can sign in | `users.json` needs hashes, not passwords; or it's missing (see the server log) |
| Edits don't show on the running site (duckdown repo) | The site runs from `.dev-site`, not the seed `tests/example` |
| Edits don't show on the deployed site | It's a published site: the markdown changed, the files it serves didn't. Export and deploy (see its README.md or CLAUDE.md) |

## Three sizes of override

Two, both naming a file you wrote.

| | changes | good for |
|---|---|---|
| `css: name` | links `/static/name.css` after the template's own | one page that has to look unusual |
| `layout: name` | the whole page shape — `templates/name.html` | posts, landing pages, print |

A layout's name must be a plain word, so a page can't reach out of `templates/`,
and a name with no file falls back to `site.html` rather than failing. The seed
site ships `templates/post.html` and one post that uses it.

A placeholder may be used more than once: a title belongs in `<title>` and
again in `og:title`, and both are filled.
