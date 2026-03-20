title: Writing Pages
theme: duckdown

# Writing Pages

Every `.md` file in the `pages/` folder becomes a page on your site.

## Front-matter

Pages start with metadata — key-value pairs before your content:

```markdown
title: My Page
theme: duckdown
nav: About

# Your content here
```

| Key | What it does |
|-----|-------------|
| `title` | Sets the page title in the browser tab |
| `theme` | Adds a CSS class to `<body>` for styling |
| `nav` | Adds this page to the site navigation |

A blank line separates front-matter from your markdown.

## Markdown

Duckdown uses GitHub Flavored Markdown. Here's a quick reference:

### Text

**Bold text** is wrapped in `**double asterisks**`.

*Italic text* uses `*single asterisks*`.

~~Strikethrough~~ uses `~~double tildes~~`.

### Links

```markdown
[Link text](https://example.com)
```

[Visit Bun](https://bun.sh) — it's fast.

### Lists

- First item
- Second item
  - Nested item
- Third item

1. Ordered first
2. Ordered second

### Task lists

- [x] Create a site
- [x] Write some pages
- [ ] Deploy to production

### Code

Inline `code` with backticks.

```javascript
// Fenced code block
function greet(name) {
  return `Hello, ${name}!`;
}
```

### Tables

| Feature | Status |
|---------|--------|
| Markdown | Done |
| Themes | Done |
| Images | Done |

### Blockquotes

> Duckdown makes it easy to build
> simple, beautiful websites.

## Folders

Organise pages in folders. Each folder can have its own `index.md`:

```
pages/
├── index.md          → /index.html
├── about.md          → /about.html
└── blog/
    ├── index.md      → /blog/index.html
    └── first-post.md → /blog/first-post.html
```

## Navigation

Any `index.md` with a `nav:` key automatically appears in the site navigation. That's it — no config files, no menus to maintain.
