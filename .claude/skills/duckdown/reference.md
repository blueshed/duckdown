# Duckdown reference

1. [The content folder](#the-content-folder)
2. [Pages and URLs](#pages-and-urls)
3. [Front matter](#front-matter)
4. [Markdown](#markdown) — headings and contents lists, callouts, wiki links, images, raw HTML
5. [Navigation](#navigation)
6. [Themes and the stylesheet](#themes-and-the-stylesheet) — the variables, dark mode, the cascade
7. [The site template](#the-site-template)
8. [Static files and images](#static-files-and-images)
9. [Users](#users)
10. [The editor](#the-editor)
11. [Troubleshooting](#troubleshooting)

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
│   ├── -theme.css        theme rules for every page
│   ├── about.md          /about.html    (and /about)
│   └── blog/
│       ├── index.md      /blog/          — in the nav
│       ├── -theme.css    theme rules for blog pages, after the root's
│       └── first-post.md /blog/first-post.html
├── static/
│   ├── site.css          the stylesheet every page loads
│   ├── favicon.ico
│   └── images/
├── templates/
│   └── site.html         wraps every page
└── users.json            who can sign in
```

## Pages and URLs

- Every `pages/**/*.md` is a page at the same path with `.html`, or without an extension: `pages/blog/first-post.md` is `/blog/first-post.html` and `/blog/first-post`.
- `pages/index.md` is `/`, and a folder is served by its index: `/blog`, `/blog/` and `/blog/index.html` all reach `pages/blog/index.md`. The shortest is the page's canonical address — what the nav links to and what the page declares — so write links that way. A page of the same name wins over a folder (`blog.md` before `blog/index.md`).
- Names may contain spaces (`About us.md` is `/About%20us.html`), but lowercase-with-dashes names make tidier URLs.
- A folder whose name starts with `-` (say `-drafts/`) is left out of the navigation; its pages are still served to anyone with the URL. Names starting with `.` aren't listed in the editor.
- A page that doesn't exist is a plain 404.

## Front matter

`key: value` lines at the very top of a page, then a blank line.

| Key | What it does |
|-----|-------------|
| `title` | The page's `<title>`; `duckie` if absent. A folder's `index.md` title is also its nav label, unless it has a `nav` |
| `theme` | Put on `<body>` as a class, so a theme's `body.name { … }` rules apply |
| `nav` | In a folder's `index.md` only: its label in the navigation |
| `toc` | `true` (or `yes`) adds a contents list under the page's title |
| `layout` | `post` wraps the page in `templates/post.html`, falling back to `site.html` |
| `description` | The page's description, for `<meta name="description">` and `og:description` |
| `date` | Orders a folder's `{{pages}}` listing, newest first, and is shown beside the link (ISO: `2026-09-19`) |
| `draft` | `true` keeps the page off the site, the nav and listings; signed in to the editor, you still see it |

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

GitHub-flavoured markdown: headings, emphasis, `~~strikethrough~~`, links, lists, `- [x]` task lists, tables, fenced code (shown plain — no syntax highlighting), quotes and bare URLs, which become links.

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

`.md` on the end is optional. Without a `|label`, the link reads as you wrote it (`[[/index]]` shows "/index"). Links aren't checked: one to a page that doesn't exist is a 404. (Inside a table cell, write the `|` as `\|`, as above.)

### Images

```markdown
![A duck](/static/images/logo.svg)

<img src="/static/images/logo.svg" alt="A duck" width="120">
```

Markdown images take the width of the text at most; use HTML to size one.

**Colouring an SVG with CSS.** An SVG shown with `![…](…)` or `<img>` is sealed off: the page's CSS can't recolour it. Use it as a mask instead — an empty element on the page, painted by CSS:

```html
<span id="logo" role="img" aria-label="duckdown"></span>
```

```css
#logo {
  display: block;
  width: min(320px, 100%);
  aspect-ratio: 1;
  background: var(--duck, currentColor);        /* a theme can set --duck */
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

### Not supported

Maths (`$x^2$` stays as written), emoji shortcodes, and syntax highlighting in code blocks. Duckdown carries no library for them, but a site can: add KaTeX or MathJax (maths) or highlight.js or Prism (code) to `templates/site.html`, and the pages stay plain markdown. The editor's preview runs no scripts, so the result shows on the site rather than in the preview.

## Navigation

- Built from every folder's `index.md`: the root's first, then each folder's, depth first, folders in alphabetical order.
- Each entry's label is the page's `nav:`, else its `title:`; an `index.md` with neither, or one marked `draft: true`, isn't listed. Folders starting with `-` or `.` are skipped, with everything inside them.
- Plain pages (`about.md`) are never listed: give a page a folder (`about/index.md`) to put it in the navigation.
- Order follows folder names, not labels: to control it, name folders so they sort (`1-about/` with `nav: About`), remembering the name is in the URL.
- The link for the page being viewed gets `aria-current="page"`; failing that, its section's link (the nearest folder above it with an `index.md`, never the root) gets `aria-current="true"`. The stylesheet underlines either.
- In development (`DEBUG=1`) it's built on every request, so pages written straight to disk appear immediately. In production it's built once and rebuilt whenever a page is saved or deleted through the editor; files placed there any other way need a restart.

The template receives it as:

```html
<nav><ul class="nav">
<li><a href="/">Home</a></li>
<li><a href="/blog/index.html" aria-current="true">Blog</a></li>
</ul></nav>
```

## Themes and the stylesheet

### The stylesheet

`static/site.css` loads on every page. It draws everything — text, links, code, tables, callouts, the contents list, the navigation — from CSS variables:

| Variable | What it sets |
|----------|-------------|
| `--bg`, `--text` | The page's background and text |
| `--muted` | Quieter text: quotes, the navigation |
| `--accent` | Links, the navigation's current page, the contents list |
| `--border`, `--surface` | Lines, and the background of code, table headings and the contents list |
| `--font-body`, `--font-mono` | Fonts for text and for code |
| `--font-heading` | Headings' font; unset, they use `--font-body` |
| `--measure` | How wide the text runs (`46rem`) |
| `--radius` | Corner roundness (`6px`) |
| `--note`, `--tip`, `--important`, `--warning`, `--caution` | Callout colours |

It follows each reader's light or dark setting (`prefers-color-scheme`), with its own dark values for the colours.

### A theme

1. Choose a name, and set `theme: mytheme` on the pages that should wear it.
2. In a `-theme.css` (in the editor: **New → Theme**), set variables on `body.mytheme`:

```css
body.mytheme {
  --accent: #b5179e;
  --font-heading: Georgia, "Times New Roman", serif;
  --measure: 40rem;
}

@media (prefers-color-scheme: dark) {
  body.mytheme {
    --accent: #f28fdf;
  }
}
```

Any other CSS may follow; setting variables is just the easy, reliable part. Change a colour through its variable rather than by restyling elements, so everything that uses it — links, callouts, the navigation — changes together.

### The cascade

A page gets the `-theme.css` of the top of `pages/`, then of each folder down to its own, in that order, inlined in a `<style>` after `site.css`. So the top folder's file reaches every page — keep each theme's rules under its own `body.name` — and a folder can refine what's above it.

### Hooks for extra CSS

`ul.nav` and `a[aria-current]` (navigation) · `nav.toc`, `.toc-h2`, `.toc-h3` (contents list) · `.callout.note` … `.callout.caution` and `.callout-title` · `a.wikilink` · `h2 > a` (a heading's self-link).

In the editor, opening a `-theme.css` previews it on sample content — navigation, headings, a link, code, a callout, a table — with the class of the first `body.name { … }` rule in the file.

## The site template

`templates/site.html` wraps every page. Each placeholder is replaced once (the first time it appears):

| Placeholder | Becomes |
|-------------|---------|
| `{{title}}` | The page's `title`, else `duckie` |
| `{{theme}}` | The page's `theme`, else nothing — use it as `<body class="{{theme}}">` |
| `{{description}}` | The page's `description` as `<meta name="description">` and `og:description`, or nothing |
| `{{url}}` | The page's one canonical address — use it as `<link rel="canonical" href="{{url}}">` |
| `{{date}}` | The page's `date` as a `<time>`, written out (`21 September 2026`), or nothing |
| `{{nav}}` | The navigation (above), or nothing |
| `{{theme_css}}` | `<style>` with the page's theme cascade, or nothing |
| `{{edit}}` | An "Edit this page" link to the editor — only for whoever is signed in |
| `{{content}}` | The page's rendered markdown |

A page's `layout:` chooses the template (`layout: post` → `templates/post.html`), falling back to `site.html`; the name must be a plain word. Values go in escaped, and a `$` in a page is safe. Without a template, duckdown uses a bare built-in one (title and content only).

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{title}}</title>
  <link href="/static/site.css" rel="stylesheet">
  {{theme_css}}
</head>
<body class="{{theme}}">
  {{nav}}
  {{content}}
</body>
</html>
```

## Static files and images

- Everything in `static/` is served at `/static/…`, typed by its extension.
- Keep images in `static/images/`, in folders if you like; refer to them from pages as `/static/images/…`.
- The editor's **Images** sidebar lists them with thumbnails, makes folders (**New**) and uploads files (**Upload**, several at once). Clicking one shows it, with **Copy Markdown** for the `![name](/static/images/…)` line, names encoded.

## Users

`users.json` in the content folder maps each sign-in name to a password hash:

```json
{
  "admin": "$argon2id$v=19$m=65536,t=2,p=1$…"
}
```

- Make a hash with `bun -e 'console.log(await Bun.password.hash("their-password"))'` and paste it in. A plain password in the file won't sign anyone in.
- The login form's "email" field is just the name as written in the file.
- A new project starts with `admin` / `admin`: replace it before the site goes anywhere.
- Signing in lasts seven days. Production needs `COOKIE_SECRET` set in the environment.
- With no `users.json`, nobody can sign in (the server logs it); with a broken one, the login page says it can't be read.

## The editor

- At `/edit`. Signing in lands there; `/login` when already signed in goes straight there; the home page's "Login to edit" link does the same.
- **Content** (left): the site's pages — folders and `.md` files; click to open, `..` to go up. Only pages: a `-theme.css` lives in `pages/` so the cascade finds it, but it is styling, so it's in Resources instead. Two buttons in its header make a **new page** and a **new folder** (`folder/index.md`, titled with the folder's name). Neither ever overwrites — it says when a name is taken.
- **Editing** (middle): Save or ⌘⏎. The button lights up while there are unsaved changes, flashes green for "Saved", and red for "Not saved" (the notice says why). The bin deletes the page, after asking.
- **Resources** (right sidebar, from the header): what a page is composed with, in three tabs.
  - *images* — browse and upload, and copy a markdown link for one.
  - *css* — the stylesheets in `static/`, and below them the `-theme.css` files that reach the page you have open, in the order they cascade. A button makes a new stylesheet, and another makes a theme for the open page's folder when it hasn't one.
  - *templates* — the files in `templates/`, and a button for a new one.
- **Editing a resource**: picking one closes the sidebar and opens it in a second pane *below* the page, with the same header — name, unsaved dot, delete, Save, and a close button. The page in the middle stays where it is, so you can click through pages and watch one stylesheet against each. It's transient: closing the pane leaves nothing behind.
- **Preview** (right): the page as the site will show it — `site.css`, the theme cascade, wiki links resolved from the page's folder — sandboxed, so no scripts run. For a `.css` file, sample content styled by it.
- **Header**: *Resources* (the sidebar), *View* (the page on the site), *Logout*.
- **Deleting always asks first**, wherever it is — a stylesheet or a template is as easy to lose as a page, and there's no undo behind any of them.
- Anything that fails shows in a red notice at the foot of the screen until dismissed.

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| A page isn't in the navigation | Not a folder's `index.md`; no `nav`/`title`; its folder starts with `-`; or, in production only, written to disk after the nav was built (save a page in the editor, or restart) |
| A line like `author: Peter` shows up in the page | It isn't a key duckdown reads: fence the block with `---` to keep it as metadata |
| A page is "not found" although the file is there | `draft: true` — sign in to the editor to read it, or take the line out to publish |
| A theme doesn't apply | The page's `theme:` doesn't match the `body.name` in the CSS; or the `-theme.css` isn't in the page's folder or one above it |
| An SVG ignores the theme's colours | It's shown with `<img>` or `![…]`, which CSS can't reach into: use it as a mask (above) |
| An SVG shows nothing at all | It isn't valid XML — check with `xmllint --noout file.svg`; a `--` inside a comment is the usual culprit |
| A folder's page isn't found | Give the folder an `index.md`: `/blog` is served by `pages/blog/index.md` |
| A `[[wiki link]]` goes to the wrong place | It's relative to the page's folder: start it with `/` to go from the top |
| Nobody can sign in | `users.json` needs hashes, not passwords; or it's missing (see the server log) |
| Edits don't show on the running site (duckdown repo) | The site runs from `.dev-site`, not the seed `tests/example` |


## Three sizes of override

| | changes | good for |
|---|---|---|
| `theme: name` | a few CSS variables, via `-theme.css` on `body.name` | a section that reads differently |
| `css: name` | links `/static/name.css` after the theme | one page that has to look unusual |
| `layout: name` | the whole page shape — `templates/name.html` | posts, landing pages, print |

A layout's name must be a plain word, so a page can't reach out of `templates/`,
and a name with no file falls back to `site.html` rather than failing. The seed
site ships `templates/post.html` and one post that uses it.

A placeholder may be used more than once: a title belongs in `<title>` and
again in `og:title`, and both are filled.
