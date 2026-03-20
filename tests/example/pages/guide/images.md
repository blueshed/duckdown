title: Images
theme: duckdown

# Images

Images live in `static/images/` and are served at `/static/images/`.

## Adding images

### From the editor

1. Click **Images** in the header bar
2. Browse or create folders
3. Click **Upload** to add files
4. Click an image to select it
5. Click **Copy Markdown** to get the syntax

Paste it into your page:

```markdown
![My photo](/static/images/my-photo.jpg)
```

### With HTML

For more control, use an `<img>` tag:

```html
<img id="hero" src="/static/images/hero.svg" alt="Hero image">
```

Then style it in your theme:

```css
#hero {
  width: 300px;
  margin: 2em auto;
  display: block;
}
```

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

## Supported formats

Upload any web-compatible image format:

| Format | Best for |
|--------|----------|
| `.svg` | Logos, icons, illustrations |
| `.png` | Screenshots, graphics with transparency |
| `.jpg` | Photos |
| `.gif` | Simple animations |
| `.webp` | Modern format, smaller files |
