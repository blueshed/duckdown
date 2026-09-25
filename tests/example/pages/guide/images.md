title: Images

# Images

Images live in `static/images/` and are served at `/static/images/`.

## Adding images

### From the editor

1. Click **Resources** in the header bar
2. Stay on the **images** tab
3. Browse, or make a folder with the folder button
4. Click **Upload** to add files
5. Click an image to select it
6. Click **Copy Markdown** to get the syntax

Paste it into your page:

```markdown
![My photo](/static/images/my-photo.jpg)
```

The words in the brackets start as the file's name. Replace them with what the
picture shows — "A hermit crab in a whelk shell" — because they are what a
screen reader says instead of it, and what shows if it doesn't load. A picture
that is only decoration gets none: `![](/static/images/flourish.svg)`.

### With HTML

For more control, use an `<img>` tag:

```html
<img id="hero" src="/static/images/hero.svg" alt="A duck on a pond at sunrise">
```

Then style it in your theme:

```css
#hero {
  width: 300px;
  margin: 2em auto;
  display: block;
}
```

## Colouring an SVG with CSS

An SVG shown with `![…](…)` or `<img>` keeps its own colours: the page's CSS can't reach inside it. To colour a logo or icon from your theme, use the drawing as a **mask** and let CSS paint the shape.

Put an empty element where the image goes:

```html
<span id="logo" role="img" aria-label="duckdown"></span>
```

and in `static/theme.css`, give it a size, a colour, and the SVG as its mask:

```css
#logo {
  display: block;
  width: min(320px, 100%);
  aspect-ratio: 1;
  background: var(--duck, currentColor);
  -webkit-mask: url(/static/images/logo.svg) center / contain no-repeat;
  mask: url(/static/images/logo.svg) center / contain no-repeat;
}
```

The drawn parts take the `background`, and anything transparent in the file stays transparent — the duck's eye and wing are holes, so the page shows through them. Because the colour is ordinary CSS, it can be a variable:

```css
body.duckdown {
  --duck: var(--accent);
}
```

Left as `currentColor`, it simply follows the text, so it turns light in dark mode by itself. That's how the duck on the home page works.

> [!NOTE]
> A mask paints the whole shape one colour. For a picture with several colours, paste the `<svg>…</svg>` straight into the page and style its parts with CSS. (`<use href="file.svg#id">` reads nicely but only works in Firefox, so it isn't worth using.)

## Organising images

Create folders to keep things tidy:

```
static/images/
├── logo.svg
├── blog/
│   ├── post-1-hero.jpg
│   └── post-2-hero.jpg
└── team/
    ├── alice.jpg
    └── bob.jpg
```

Reference them with the full path:

```markdown
![Alice](/static/images/team/alice.jpg)
```

## Pictures for smaller screens

A photo uploaded here is also kept at narrower widths — 480, 960 and 1600
pixels — and a page offers them, so a phone downloads the size it needs
rather than the original. Nothing to write: `![…](…)` works as before.
Pictures put in `static/images/` by other means get theirs from
`duckdown images`.

## Supported formats

Upload any web-compatible image format:

| Format | Best for |
|--------|----------|
| `.svg` | Logos, icons, illustrations |
| `.png` | Screenshots, graphics with transparency |
| `.jpg` | Photos |
| `.gif` | Simple animations |
| `.webp` | Modern format, smaller files |

## The site's icon

The picture on a browser tab, and on a phone's home screen when someone adds
the site there, is set in **Resources → icon**. Choose any picture — a logo, a
photo, an SVG — and both icons are made from its middle square: the phone's
on white, the tab's as it is. The tab shows it on a light and a dark tab bar,
so a drawing that disappears on one is easy to spot.
