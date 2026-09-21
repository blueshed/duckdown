---
name: duckdown
description: Write and organise the content of a Duckdown site — markdown pages and their front matter (title, nav, toc, layout, css), callouts, [[wiki links]], folders and the navigation, styling through CSS variables, images, templates, who can sign in, and getting a change published. Use this whenever the user wants to add, edit, move or restyle pages on a duckdown site, write a post or a guide, change how the site looks, get something into the navigation, put images on a page, or add an editor — even when they don't say "duckdown", if the files live in a duckdown content folder (pages/, static/, templates/, users.json). Not for changing duckdown's own server or editor code.
license: MIT
metadata:
  author: blueshed
  version: "0.0.2"
---

# Writing a Duckdown site

Duckdown serves a folder of markdown as a website and gives it an editor in the browser at `/edit`. The content is plain files, so you can write them directly or through the editor — both end up in the same place.

## Find the content folder

It's the folder `DUCKDOWN_PATH` names in `.env`:

- a project made with `bun create blueshed/duckdown`: **`./site`**
- the duckdown repository itself: **`./.dev-site`**, a working copy of the seed site `tests/example`. Write there to change what the running site shows; change `tests/example` only to change what new copies and the tests start from.
- with `DUCKDOWN_BUCKET` set, the content is in S3: work through the editor, not the filesystem.

```
pages/        the site: every .md is a page, every folder can have an index.md
static/       served as-is at /static/ — site.css, theme.css, images/, favicon.ico
templates/    site.html wraps every page and links the stylesheets;
              layout: picks another
users.json    who can sign in (password hashes)
```

## Write a page

1. Create `pages/<path>.md`. It's served at `/<path>.html` (and at `/<path>`).
2. Start it with front matter — `key: value` lines, then a blank line:
   ```markdown
   title: About us
   toc: true

   # About us
   ```
3. Write GitHub-flavoured markdown. Duckdown adds, all optional:
   - callouts: `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`
   - links between pages: `[[page]]`, `[[page|label]]`, `[[page#heading]]` (relative, no `.html`)
   - `toc: true` for a contents list; every heading gets a `#` link
   - `{{pages}}` in a folder's `index.md` lists the pages beside it, newest first by `date:`
   - `draft: true` keeps a page off the site until it's ready (you can still read it signed in)

## What catches people out

- **A plain block of front matter may only use the keys duckdown reads** — `title`, `nav`, `toc`, `layout`, `css`, `description`, `date`, `draft`, or an `x-…` of your own. For any other key, fence it with `---` … `---`. (That's why prose starting "Update: closed Monday" keeps its first line.)
- **Only a folder's `index.md` is in the navigation**, labelled by its `nav:` (else its `title:`). To put "About" in the nav, write `pages/about/index.md`, not `pages/about.md`. Folders starting with `-` or `.` stay out of it, though their pages are still served. Drafts stay out too.
- **Styling is templates and stylesheets, nothing else.** `templates/site.html` links `static/site.css` (duckdown's base, drawn from variables) and `static/theme.css` (this site's look, which only says what differs — `:root { --accent: … }`). To restyle the site, edit `theme.css`. For one page, `css: poster` links `/static/poster.css` after them. For a *kind* of page, give it a template with `layout:` and let that template link what it needs.
- **In development (`DEBUG=1`) the navigation is rebuilt on every request**, so a folder's `index.md` written straight to disk shows up at once. In production it's cached and rebuilt when a page is saved or deleted through the editor, so files put there another way need a restart (`bun run stop`, then start again).
- **Whether a change is live depends on how the site is deployed**, and there are two ways. On a **served** site duckdown is running and a save at `/edit` is live at once. On a **published** site the pages were rendered to files by `bun run export` and a host is handing those out — editing markdown changes nothing anybody can see until the site is exported and deployed again. Look for a `DEPLOY.md`: a published site has one, and it says how. Never tell someone their change is live without knowing which kind of site it is.
- **`users.json` holds password hashes**, never passwords: a plain one won't sign in. Make a hash with `bun -e 'console.log(await Bun.password.hash("their-password"))'`.

## Check your work

Open the page on the running site (`bun run dev`, then http://localhost:8080), or in the editor, whose preview goes through the same renderer the site does — the same template, navigation and stylesheets (though it runs no scripts).

## Publishing

A **served** site needs nothing: duckdown is running, and a save is live.

A **published** site is a folder of files that someone has to write and send:

```sh
DUCKDOWN_ORIGIN=https://example.com bun run export     # into ./dist
```

Every page rendered the way the site renders it, at its one address, with
`static/` alongside; drafts are left out. Where `dist/` then goes is the site's
own business — its `DEPLOY.md` says, and on some sites a `git push` does the
whole of it. Don't invent a deployment step that isn't written down.

## Everything else

Read [reference.md](reference.md) for the details; it opens with a contents list. It covers front matter keys, the markdown syntax (callouts, wiki links, contents lists, raw HTML), how the navigation is built, styling and every CSS variable (with dark mode), the template's placeholders, static files and images, users, the editor, publishing, and troubleshooting.
