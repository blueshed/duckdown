title: Themes
theme: duckdown
toc: true

# Themes

Themes let you style your site with CSS. No build tools, no config — just a CSS file.

## How it works

1. Create a file called `-theme.css` in your pages folder (in the editor: browse to the folder and press the theme button in the tree's header)
2. Set `theme: mytheme` in a page's front-matter
3. In `-theme.css`, set a few variables on `body.mytheme`

That's it.

## Set variables, not styles

The site's stylesheet, `static/site.css`, draws everything — text, links, code, tables, callouts, the navigation — from a handful of CSS variables. A theme only changes the ones it cares about:

```css
body.mytheme {
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
| `--note`, `--tip`, `--important`, `--warning`, `--caution` | The [[pages#callouts\|callout]] colours |

You can still write any CSS you like after that: the variables are just the easy part.

## Dark mode

The site follows each reader's light or dark setting. To adjust your theme for dark mode, set its variables again inside a media query:

```css
@media (prefers-color-scheme: dark) {
  body.mytheme {
    --accent: #f28fdf;
  }
}
```

## Themes cascade

A page gets the `-theme.css` of the top folder, then of each folder down to its own. A theme set at the top applies everywhere, and a folder can refine it:

```
pages/
├── -theme.css        ← every page
├── index.md
└── blog/
    ├── -theme.css    ← pages in blog/, after the one above
    └── first-post.md
```

> [!TIP]
> Since the top folder's `-theme.css` reaches every page, keep each theme's rules under its own `body.name`.

This site does exactly that, and you can read both files. `pages/-theme.css`
sets the `duckdown` theme for everything. `pages/blog/-theme.css` is read after
it, only for pages in [the blog](/blog/), and says just what's different there:
a warmer accent and a narrower column, for prose rather than documentation.
Neither file names the other; the only thing that decides the order is which
folder each one is in.

## Example

This page uses the `duckdown` theme. Here it is:

```css
body.duckdown {
  --accent: #147c99;
  --font-heading: Georgia, "Times New Roman", serif;
  --duck: var(--accent); /* the logo: see the Images guide */
}

@media (prefers-color-scheme: dark) {
  body.duckdown {
    --accent: #5cc1dc;
  }
}
```

## Where to find it in the editor

In the tree on the left, at the foot of the folder it themes — which is the
whole point of it. A theme isn't a page and doesn't open like one, so it's
listed quietly, below the pages, and opens in the pane *underneath* the page
you're reading rather than replacing it. Where it sits is what it says: this
folder, and everything under it.

Every folder without one offers to make one, from the button in the tree's
header. Stylesheets and templates are a different thing — they belong to no
folder, and they're in **Resources**.

## Live preview

Edit a theme with a page open and the preview restyles that page as you type,
your unsaved copy winning over the saved one. With no page open, the theme
takes the column to itself and the preview shows sample content — headings,
links, code, a table and a callout — under your theme's `body` class.
