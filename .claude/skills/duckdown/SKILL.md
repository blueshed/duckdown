---
name: duckdown-authoring
description: Create and manage content for Duckdown static sites. Use when the user asks about writing markdown pages, front-matter metadata, themes, navigation, templates, images, or site structure. Not for server/client development.
license: MIT
metadata:
  author: blueshed
  version: "0.0.1"
---

# Duckdown Content Authoring

Duckdown is a markdown-based CMS. You write `.md` files with front-matter metadata, and the server renders them as HTML pages with your theme and navigation.

## Pages

Pages live in the `pages/` directory. Each `.md` file becomes an HTML page:

```
pages/
├── index.md          → /index.html (homepage)
├── about.md          → /about.html
├── blog/
│   ├── index.md      → /blog/index.html
│   └── first-post.md → /blog/first-post.html
└── docs/
    ├── index.md      → /docs/index.html
    └── getting-started.md → /docs/getting-started.html
```

## Front-Matter

Every page can start with key-value metadata before the content. A blank line separates front-matter from the body:

```markdown
title: My Page Title
theme: mytheme
nav: My Nav Label

# Page content starts here

This is the body of the page.
```

### Supported keys

| Key | Purpose | Example |
|-----|---------|---------|
| `title` | Page title (used in `<title>` tag) | `title: About Us` |
| `theme` | CSS class added to `<body>` | `theme: duckdown` |
| `nav` | Label shown in site navigation | `nav: About` |

- Keys are case-insensitive (`Title:` and `title:` are the same)
- A key can appear multiple times to create an array of values
- If no `nav` key is present, `title` is used for navigation

## Navigation

Navigation is auto-generated from `index.md` files. Any `index.md` with a `nav` or `title` front-matter key gets a navigation entry.

```
pages/
├── index.md          # nav: Home
├── about/
│   └── index.md      # nav: About
└── blog/
    └── index.md      # nav: Blog
```

This generates:

```html
<nav>
  <ul class="nav">
    <li><a href="/index.html">Home</a></li>
    <li><a href="/about/index.html">About</a></li>
    <li><a href="/blog/index.html">Blog</a></li>
  </ul>
</nav>
```

Folders starting with `.` or `-` are excluded from navigation.

## Themes

A theme is a CSS file named `-theme.css` placed alongside pages. It applies to all pages in that directory:

```
pages/
├── index.md
├── -theme.css        ← applies to pages in this folder
└── blog/
    ├── index.md
    └── -theme.css    ← applies to blog pages only
```

The theme CSS is injected into the page via a `<style>` tag. Use `body.classname` selectors to scope your styles, matching the `theme:` front-matter value:

```css
/* -theme.css */
body.duckdown {
  background: #51ABC4;
  color: #147C99;
  font-family: 'Georgia', serif;
}

body.duckdown h1 {
  border-bottom: 2px solid currentColor;
}
```

```markdown
title: My Page
theme: duckdown

# This heading gets the border
```

## Site Template

The site template lives at `templates/site.html` and wraps every rendered page. It uses `{{placeholder}}` substitution:

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

### Template placeholders

| Placeholder | Replaced with |
|-------------|--------------|
| `{{title}}` | The page's `title:` front-matter value, or "duckdown" |
| `{{theme}}` | The page's `theme:` front-matter value (body class) |
| `{{content}}` | The rendered markdown HTML |
| `{{nav}}` | Auto-generated navigation from `index.md` files |
| `{{theme_css}}` | Contents of `-theme.css` wrapped in `<style>` tags |

## Static Files

Static assets live in the `static/` directory and are served at `/static/`:

```
static/
├── site.css          → /static/site.css
├── favicon.ico       → /static/favicon.ico
└── images/
    └── logo.svg      → /static/images/logo.svg
```

`static/site.css` is the base stylesheet loaded by the site template. Theme CSS builds on top of it.

## Images

Images live in `static/images/`. Reference them in markdown:

```markdown
![Alt text](/static/images/photo.jpg)

<!-- Or use HTML for more control -->
<img id="logo" src="/static/images/logo.svg" alt="Logo">
```

The editor has an image browser (click "Images" in the header) that lets you:
- Browse and navigate image folders
- Upload new images
- Click an image to copy its markdown syntax to clipboard

## Markdown

Duckdown uses GitHub Flavored Markdown (GFM):

### Basic formatting

```markdown
# Heading 1
## Heading 2
### Heading 3

**bold** and *italic* and ~~strikethrough~~

[Link text](https://example.com)

![Image alt](/static/images/photo.jpg)
```

### Lists

```markdown
- Unordered item
- Another item
  - Nested item

1. Ordered item
2. Another item

- [x] Completed task
- [ ] Pending task
```

### Tables

```markdown
| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |
```

### Code

````markdown
Inline `code` in a sentence.

```javascript
// Fenced code block
function hello() {
  console.log("Hello!");
}
```
````

### HTML

Raw HTML is passed through:

```markdown
<div class="custom">
  <img id="hero" src="/static/images/hero.svg" alt="Hero">
</div>
```

## Users

Authentication is managed via `users.json` in the content root:

```json
{
  "admin": "password123",
  "editor": "editorpass"
}
```

Each key is a username, each value is the password. Login at `/login` to access the editor at `/edit`.

## Directory Structure

A complete duckdown site:

```
my-site/
├── pages/
│   ├── index.md          # Homepage
│   ├── -theme.css        # Theme for root pages
│   ├── about.md          # /about.html
│   └── blog/
│       ├── index.md      # /blog/index.html (adds to nav)
│       ├── -theme.css    # Blog-specific theme
│       └── my-post.md    # /blog/my-post.html
├── static/
│   ├── site.css          # Base stylesheet
│   ├── favicon.ico
│   └── images/
│       └── logo.svg
├── templates/
│   └── site.html         # Page template
└── users.json            # Auth credentials
```

## Editor

The editor is at `/edit`. It provides:

- **File browser** (left) — navigate pages, create new files
- **Editor** (center) — edit markdown or CSS with ⌘⏎ to save
- **Preview** (right) — live preview with your actual theme applied
- **Image browser** — upload and insert images (click "Images" in header)

The preview renders exactly what the published site shows — same CSS, same theme, same template.
