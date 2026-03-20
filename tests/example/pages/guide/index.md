title: Getting Started
theme: duckdown
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

You'll see three panels:

| Panel | Purpose |
|-------|---------|
| **Left** | Browse your pages and files |
| **Center** | Edit markdown or CSS |
| **Right** | Live preview with your theme |

## 4. Save your changes

Edit the markdown, then press **⌘⏎** (or click **Save**). The preview updates instantly.

## Next steps

- [Writing Pages](/guide/pages.html) — learn about markdown and front-matter
- [Themes](/guide/themes.html) — style your site
- [Images](/guide/images.html) — add images to your pages
