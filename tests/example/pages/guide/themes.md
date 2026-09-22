title: Styling your site
nav: Styling
toc: true

# Styling your site

Two files, both ordinary, neither magic: a **template** decides a page's shape
and what stylesheets it links, and a **stylesheet** in `static/` says how it
looks. That's the whole of it.

## The two stylesheets

A new site starts with these, and `templates/site.html` links both:

```html
<link href="/static/site.css" rel="stylesheet">
<link href="/static/theme.css" rel="stylesheet">
```

`site.css` is duckdown's base, and you needn't keep a copy: until you make
a file of that name in `static/`, duckdown serves its own, so upgrades reach you. It draws everything — text, links, code, tables,
callouts, the navigation — from a handful of CSS variables, so you rarely have
to touch it.

`theme.css` is yours. It comes second, so it only has to say what differs:

```css
:root {
  --accent: #b5179e;
  --font-body: Georgia, serif;
  --measure: 40rem;
}
```

| Variable | What it sets |
|----------|-------------|
| `--bg`, `--text` | The page's background and text |
| `--muted` | Quieter text: quotes, the navigation |
| `--accent` | Links, the page you're on in the navigation, the contents list |
| `--border`, `--surface` | Lines, and the background of code, table headings and the contents list |
| `--font-body`, `--font-mono` | Fonts for text and for code |
| `--font-heading` | Headings' font (they use `--font-body` unless you set it) |
| `--measure` | How wide the text runs |
| `--radius` | How round the corners are |
| `--note`, `--tip`, `--important`, `--warning`, `--caution` | The [[pages#callouts|callout]] colours |

Any other CSS may follow; the variables are just the easy part. Change a colour
through its variable rather than by restyling elements, and everything that
uses it — links, callouts, the navigation — changes together.

## Dark mode

The site follows each reader's light or dark setting. Set your variables again
inside a media query:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --accent: #f28fdf;
  }
}
```

## One page that has to look different

Put `css:` in its front matter and that stylesheet is linked after the others,
for that page alone:

```markdown
title: The poster
css: poster
```

[[/blog/one-page-that-looks-different|This page]] does it. The name is a plain
word — no slashes, no extension — so a page can't reach out of `static/`, and a
name with no file links nothing rather than breaking the page.

## A whole kind of page

A template can also take values from the page. Put `{{x-cover}}` in it, write
`x-cover: /static/images/one.jpg` in a page's front matter, and the page's value
goes in — escaped, and empty when the page doesn't say. One template can serve
a whole shelf of pages that differ in a picture and a link.

When a *kind* of page wants its own shape, give it a template. Copy
`templates/site.html`, change what you need, link whatever stylesheets that
kind should have, and name it from the pages' front matter:

```markdown
title: My first post
layout: post
```

[[/blog/a-post-with-its-own-layout|This post]] uses `templates/post.html`,
which drops the site navigation and adds the date at the foot. See
[[pages#a-pages-own-layout|A page's own layout]].

## Sharing a piece of markup

Two templates that share a header, a footer, or a sidebar don't have to paste
it into each. Put the markup in its own file — `templates/topbar.html` here,
holding the navigation and the search form — and write `{{include topbar}}`
where a template wants it. This page's own site wears `templates/site.html`,
which does exactly that: try View source and look for `<div class="topbar">`.

What the include pulls in can use `{{nav}}` and a page's `{{x-anything}}`
keys, because those are filled in afterward, over the whole merged page. An
include inside an include is left exactly as written — no loops. In the
editor, an unsaved `templates/topbar.html` shows in the preview of every page
whose template includes it, not only one that wears it directly.

## In the editor

**Resources** in the header has both: *css* lists the stylesheets in `static/`,
*templates* lists `templates/`. Pick one and it opens in a pane below the page
you're reading, so the page changes as you type — a stylesheet restyles the
preview straight away, and a template re-renders the page through your unsaved
copy.

With no page open, either takes the column to itself: a stylesheet previews on
sample content, a template on a sample page. That's how you write one from
nothing.
