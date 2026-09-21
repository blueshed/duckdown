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

`site.css` is duckdown's base. It draws everything — text, links, code, tables,
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

## In the editor

**Resources** in the header has both: *css* lists the stylesheets in `static/`,
*templates* lists `templates/`. Pick one and it opens in a pane below the page
you're reading, so the page changes as you type — a stylesheet restyles the
preview straight away, and a template re-renders the page through your unsaved
copy.

With no page open, either takes the column to itself: a stylesheet previews on
sample content, a template on a sample page. That's how you write one from
nothing.
