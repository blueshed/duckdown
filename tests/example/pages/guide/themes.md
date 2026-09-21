title: Themes
theme: duckdown
toc: true

# Themes

Themes let you style your site with CSS. No build tools, no config — just a CSS file.

## How it works

1. Create a file called `-theme.css` in your pages folder (in the editor: **Resources → css**, then the theme button)
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

A `-theme.css` lives in `pages/` so the cascade can find it, but it isn't a page
— nobody reads it. So it isn't in the content tree on the left: it's in
**Resources → css**, under the stylesheets, where the editor lists every theme
that reaches the page you have open, in the order it applies them. The button
beside them makes one for the open page's folder when it hasn't got one yet.

## Live preview

When you edit `-theme.css` in the editor, the preview shows your changes on sample content — headings, links, code, a table and a callout — with your theme's `body` class, so you see exactly what it does.
