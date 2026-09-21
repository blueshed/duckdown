title: Themes
toc: true

# Themes

Themes let you style your site with CSS. No build tools, no config — just a CSS file.

## How it works

Put a file called `-theme.css` in a folder under `pages/`. Every page in that
folder, and in every folder under it, is styled by it. That's the whole idea.

In the editor: browse to the folder and press the theme button in the tree's
header.

There's nothing to write on the pages themselves. A page doesn't opt in, and
can't forget to — which is the point, because the post you write next year
can't remember a line you wrote this year.

## Set variables, not styles

The site's stylesheet, `static/site.css`, draws everything — text, links, code, tables, callouts, the navigation — from a handful of CSS variables. A theme only changes the ones it cares about:

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
| `--note`, `--tip`, `--important`, `--warning`, `--caution` | The [[pages#callouts\|callout]] colours |

You can still write any CSS you like after that: the variables are just the easy part.

## Dark mode

The site follows each reader's light or dark setting. To adjust your theme for dark mode, set its variables again inside a media query:

```css
@media (prefers-color-scheme: dark) {
  :root {
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
> The top folder's file reaches every page, so put the site's look there and
> let each folder's file say only what differs. A folder's file doesn't have
> to undo the one above it — it just overrides the variables it cares about.

This site does exactly that, and you can read both files. `pages/-theme.css`
sets the look for everything. `pages/blog/-theme.css` is read after it, only
for pages in [the blog](/blog/), and says just what's different there: a
warmer accent and a narrower column, for prose rather than documentation.
Neither file names the other; the only thing deciding the order is which
folder each one is in.

## Example

This is `pages/-theme.css`, which styles the page you're reading:

```css
:root {
  --accent: #147c99;
  --font-heading: Georgia, "Times New Roman", serif;
  --duck: var(--accent); /* the logo: see the Images guide */
}

@media (prefers-color-scheme: dark) {
  :root {
    --accent: #5cc1dc;
  }
}
```

## One page that shouldn't follow its folder

A theme belongs to a folder, so it's the wrong tool for a single page. That's
what `css:` is for: `css: poster` in a page's front matter links
`/static/poster.css` after the themes, so it can override the same variables
for that page alone. See [[/blog/one-page-that-looks-different|the poster
page]].

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
links, code, a table and a callout — styled by what you're typing.
