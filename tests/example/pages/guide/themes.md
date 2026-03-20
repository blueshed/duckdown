title: Themes
theme: duckdown

# Themes

Themes let you style your site with CSS. No build tools, no config — just a CSS file.

## How it works

1. Create a file called `-theme.css` in your pages folder
2. Set `theme: mytheme` in your page's front-matter
3. Your CSS targets `body.mytheme`

That's it.

## Example

Here's the theme you're looking at right now:

```css
body.duckdown {
  background: #51ABC4;
  color: #147C99;
  font-family: 'Georgia', serif;
}

body.duckdown h1 {
  text-transform: uppercase;
  letter-spacing: 2px;
}
```

And the page references it:

```markdown
title: My Page
theme: duckdown

# This gets the theme
```

## Per-folder themes

Each folder can have its own `-theme.css`. A blog section can look completely different from your homepage:

```
pages/
├── -theme.css        ← homepage theme
├── index.md
└── blog/
    ├── -theme.css    ← blog theme
    └── index.md
```

## Base styles

The file `static/site.css` is loaded on every page *before* the theme. Use it for resets and shared styles. The theme builds on top.

## Live preview

When you edit `-theme.css` in the editor, the CSS preview panel shows your changes applied to sample content — with the correct `body` class, so you see exactly what your theme does.
