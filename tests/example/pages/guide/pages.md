title: Writing Pages
theme: duckdown
toc: true

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
| `nav` | In a folder's `index.md`: its label in the site navigation |
| `toc` | `toc: true` adds a list of the page's contents under its title |
| `layout` | `layout: post` wraps the page in `templates/post.html` |
| `description` | Fills in the page's description for search engines and links shared online |
| `date` | Used to order a folder's [[#listing-a-folder\|listing]], newest first |
| `draft` | `draft: true` keeps the page off the site until you're ready |

A blank line separates front-matter from your markdown.

Those are the keys duckdown reads, and a plain block at the top of a page may only use them — so a page that opens "Update: the shop is closed on Monday" keeps its first line instead of losing it to metadata. For keys of your own, fence the block:

```markdown
---
title: My Page
author: Peter
tags: shop, opening
---

# My Page
```

Anything goes between the `---` lines. Duckdown still reads the keys it knows and ignores the rest.

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

## Headings and contents

Every heading can be linked to: point at it and a `#` appears. Its link is the heading in lower case, with dashes for spaces — this section is `#headings-and-contents`.

Put `toc: true` in a page's front-matter and a list of its contents (its `##` and `###` headings) appears under its title, like the one at the top of this page.

## Callouts

Start a quote with `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` or `[!CAUTION]` to make it stand out:

```markdown
> [!TIP]
> Press ⌘⏎ to save.
```

> [!NOTE]
> Useful information that readers should know.

> [!TIP]
> Press ⌘⏎ to save.

> [!IMPORTANT]
> Something readers need to know to succeed.

> [!WARNING]
> Something that needs their attention right away.

> [!CAUTION]
> The risks of doing something.

It's the same syntax GitHub uses, so the text reads the same there too.

## Links between pages

Put a page's name in double brackets to link to it, without writing the `.html`:

| You write | It links to |
|-----------|-------------|
| `[[themes]]` | A page in the same folder: [[themes]] |
| `[[themes\|the Themes guide]]` | The same, with your own words: [[themes\|the Themes guide]] |
| `[[/index]]` | From the top of the site: [[/index]] |
| `[[images#adding-images]]` | A heading on another page: [[images#adding-images]] |
| `[[#callouts]]` | A heading on this page: [[#callouts]] |

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

A folder is served by its index, so `/blog`, `/blog/` and `/blog/index.html` all reach `pages/blog/index.md`.

## Listing a folder

Put `{{pages}}` in a folder's `index.md` and it lists the pages beside it — newest first by their `date:`, with each one's `description:` under the link:

```markdown
title: Blog
nav: Blog

# Blog

{{pages}}
```

That's a blog index that writes itself: drafts stay out, and a new post appears the moment you save it.

## Drafts

`draft: true` keeps a page to yourself. It's left out of the navigation and out of listings, and anyone visiting it gets "not found" — except you, while you're signed in to the editor, so you can read it in place before publishing.

## Navigation

Every folder's `index.md` appears in the site navigation, labelled by its `nav:` key, or by its `title:` if it has no `nav:`. Other pages don't: to put a page in the navigation, give it a folder of its own (`about/index.md` rather than `about.md`). That's it — no config files, no menus to maintain.

The navigation marks the page you're on, or the section it's in.

## Maths and highlighted code

Duckdown doesn't render maths or colour code blocks, and it doesn't carry the libraries that do. Both are a `<script>` in `templates/site.html` away — KaTeX or MathJax for maths, highlight.js or Prism for code — and your pages stay plain markdown. The editor's preview runs no scripts, so you'll see the result on the site rather than in the preview.
