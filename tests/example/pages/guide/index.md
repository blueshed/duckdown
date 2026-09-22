title: Getting Started
nav: Guide

# Getting Started

Welcome! Let's create your first duckdown site.

## 1. Create your site

```sh
bun create blueshed/duckdown my-site
cd my-site
```

This gives you a ready-to-run project with a `site/` folder for your content.

## 2. Start the server

```sh
bun run dev
```

Open [http://localhost:8080](http://localhost:8080) to see your site.

## 3. Edit your content

Go to [http://localhost:8080/edit](http://localhost:8080/edit) and log in with `admin` / `admin`.

You'll see three columns:

| Column | What's in it |
|--------|--------------|
| **Left** | Your content: the folders and pages of your site |
| **Middle** | Whatever you have open. A page; underneath it, a stylesheet or template you're composing with; or just one of those, filling the column |
| **Right** | What you'd see — the page as the site will render it, or, with no page open, a sample page for whatever you're editing |

**Resources**, in the header, is the other half of the left column: the images,
stylesheets and templates that don't belong to any one folder. Pick one and it
opens below your page, so you watch the page change while you edit it.

## 4. Save your changes

Edit the markdown, then press **⌘⏎** (or click **Save**). The preview updates as you type; saving is what puts it on the site.

## Next steps

- [Writing Pages](/guide/pages.html) — learn about markdown and front-matter
- [Styling](/guide/themes.html) — templates and stylesheets
- [Images](/guide/images.html) — add images to your pages
- [Collections](/guide/collections.html) — one file describes a folder of items, and each gets a page
