# Duckdown

A markdown CMS built with **Bun 1.4.2** (server) and **Railroad** (UI).

## Architecture

`server/main.ts` is **resources and routes** — nothing else. Import your resources (HTML, handlers), wire them to routes. Each handler lives in its own module. You read `main.ts` and immediately know every URL the app handles and where to find the code.

```ts
// server/main.ts — resources and routes, nothing else
import homepage from "./edit/index.html";

Bun.serve({
  routes: {
    "/health":          new Response("OK"),   // a platform's healthcheck
    "/edit":            homepage,
    "/edit/styles.css": editorCss,   // Bun.file — also styles /login
    "/login":           { GET: handleLoginGet, POST: handleLoginPost },
    "/logout":          { POST: handleLogout },
    "/edit/pages/*":     handlePages,
    "/edit/templates/*": handleTemplateFiles,
    "/edit/static/*":    handleStaticFiles,
    "/edit/mark/":       handleMark,
    "/search.json":      handleSearch,       // the index; the browser matches
    "/sitemap.xml":      handleSitemap,      // the same index, for crawlers
    "/edit/browse/*":    handleBrowse,
    "/static/*":         handleStatic,
  },
  fetch: handleSite,
  error: handleError,   // failures speak: logged, and a line the editor can show
});
```

Adding a new route: one import, one line. The route file is self-contained.

## Project Structure

```
duckdown/
├── server/
│   ├── main.ts            # Entry point — resources and routes
│   ├── config.ts           # Env vars (DUCKDOWN_PATH, PORT, DEBUG, etc.)
│   ├── storage.ts          # Storage abstraction (local filesystem / S3) + dev seed
│   ├── auth.ts             # JWT auth, login/logout handlers
│   ├── markdown.ts         # Front-matter parser + Bun.markdown
│   ├── nav.ts              # The site nav, cached until the editor changes a page
│   ├── pid.ts              # Pid file: written at startup, removed on exit; stopServer()
│   ├── stop.ts             # bun run stop
│   ├── log.ts              # The view log: what was read, never who
│   ├── search.ts           # The index readers search, cached like the nav; page and item aliases
│   ├── sitemap.ts          # sitemap.xml from that index
│   ├── collection.ts       # collection.json (the data) + its each: page (the page every item gets)
│   ├── history.ts          # Earlier versions: what a save replaced, what a delete removed
│   ├── images.ts           # Where a collection's pictures are, and what a thumbnail is called (both ends read it)
│   ├── slugs.ts            # An item's slug and address, and how aliases compare (both ends read it)
│   ├── base.ts             # Where the base files are (server/base/) and the root files
│   ├── base/               # site.css, search.js: served and exported when a site has none of its own
│   ├── init.ts             # scaffold(root, {vendored}): what both ways in write (see below)
│   ├── cli.ts              # bin `duckdown`: the server, or `duckdown init`
│   ├── serve.ts            # The published flavour's server: a dist/ folder, nothing else
│   ├── hosts.ts            # One site, one address: which names move to DUCKDOWN_ORIGIN, which are noindex
│   ├── scaffold.ts         # Says so when `bun create` left a half-scaffold
│   ├── page.ts             # A page, rendered: markdown in its template
│   ├── export.ts           # bun run export — the whole site as files
│   ├── links.ts            # The links a page makes, and which lead nowhere (the export and the preview ask)
│   ├── utils.ts            # Shared helpers: paths, escaping, dates, a pass outside code
│   ├── routes/
│   │   ├── files.ts        # fileRoutes() — GET/PUT/DELETE over one folder
│   │   ├── pages.ts        # /edit/pages/* — file CRUD, via fileRoutes
│   │   ├── site-files.ts   # /edit/templates/* and /edit/static/*, via fileRoutes
│   │   ├── mark.ts         # /edit/mark/  — the preview, through page.ts
│   │   ├── browse.ts       # /edit/browse/* — image browser + upload
│   │   ├── collection.ts   # /edit/collection/* — a collection's pictures (upload + thumbnail), and its problems
│   │   ├── static.ts       # /static/* — site static files
│   │   ├── search.ts       # /search.json — the whole index, for the browser
│   │   ├── sitemap.ts      # /sitemap.xml
│   │   ├── site.ts         # fetch fallback — the site, through page.ts
│   │   └── error.ts        # error handler — log it, answer 500 with a line to show
│   └── edit/               # Editor client (served at /edit)
│       ├── index.html      # Entry HTML (Bun auto-bundles .tsx + .css)
│       ├── app.tsx          # Railroad app root
│       ├── store.ts         # Signals + actions (shared state)
│       ├── api.ts           # fetch wrapper: failures speak; a 401 goes to /login
│       ├── notice.ts        # the one line: a failure (speak), news (tell), hush
│       ├── styles.css       # Editor styles (light/dark theme-aware)
│       ├── login.html       # Login page (HTMLRewriter; styled by /edit/styles.css)
│       └── components/
│           ├── Browser.tsx   # File/folder navigator
│           ├── Editor.tsx    # Textarea editor with save/delete
│           ├── Preview.tsx   # Live markdown preview
│           ├── CssPreview.tsx # CSS preview in iframe
│           ├── Header.tsx    # Top bar (view site, resources, logout)
│           ├── ImageBrowser.tsx # Resources sidebar: images, css, templates
│           ├── ResourceList.tsx # One tab of it: the css or template files
│           ├── ResourcePane.tsx # A resource open below the page
│           ├── CollectionPane.tsx # A folder's collection.json, edited as works
│           ├── PreviewFrame.tsx # The sandboxed iframe, in one place
│           ├── TemplatePreview.tsx # A sample page through the draft template
│           ├── PaneHeader.tsx   # The one header both panes wear
│           ├── NewDialog.tsx    # Name a new page, folder, collection, stylesheet, template
│           ├── ConfirmDialog.tsx # Confirm action dialog
│           ├── History.tsx   # Earlier versions of a file, and what was deleted: Restore
│           ├── Notice.tsx    # Shows that line (role=alert for a failure, status for news)
│           └── Icon.tsx      # Lucide icons (lucide-static SVG strings)
├── tests/                  # see Testing below
│   ├── example/            # Seed site data (pages, static, templates, a gallery collection)
│   ├── setup.ts            # Preload: env + happy-dom, before any module loads
│   ├── helpers.ts          # The in-process server, signIn(), waitFor()
│   ├── server.test.ts      # HTTP against the in-process server
│   ├── export.test.ts      # bun run export, onto a scratch folder
│   ├── search.test.ts      # plainText, the index, its cache, and the aliases from that walk
│   ├── collection.test.ts  # collection.json: slugs, overviews, aliases, collisions
│   ├── history.test.ts     # History: once a sitting, the limit, what was deleted
│   ├── editor.test.tsx     # The editor's code in happy-dom, against that server
│   ├── units.test.ts       # pid, config, storage, auth, error handler
│   ├── s3.test.ts          # S3Storage via Bun's S3 client + fake-s3.ts
│   ├── markdown.test.ts    # Front-matter, rendering, nav, themes
│   ├── process.test.ts     # Real subprocesses: pid lock, SIGTERM, seeding
│   ├── serve.test.ts       # serveDist(): traversal, redirects, 404.html, what is logged
│   ├── setup-script.test.ts # both scaffold modes on scratch folders, and `bun run export` in each
│   └── compose.yml         # MinIO for manual S3 runs (bun run dev:s3)
├── bunfig.toml             # Test preload + the 100% coverage threshold
├── create/                 # `bun create blueshed/duckdown`: calls the scaffold, keeps code and tests
├── package.json
├── tsconfig.json
├── .env                    # Local dev config
├── .env.s3                 # MinIO/S3 config
├── .dev-site/              # Dev working copy of tests/example (gitignored, made on first run)
├── duckdown.pid            # Running server's pid (gitignored)
├── feature.md              # Feature checklist
├── todo.jsonl              # Open work — the ledger (see below)
└── CLAUDE.md
```

## Todo

`todo.jsonl` is the ledger of open work — check it first and keep it current. One self-contained JSON object per line: `n`, `status` (open / fixed / not fixed), `severity`, `area`, `file`, `summary`, `detail`, plus a dated `note` once an item is worked on.

## Stack

- **Runtime/Server:** Bun 1.4.2 (`Bun.serve()`)
- **UI Framework:** Railroad (`@blueshed/railroad`) — signals, JSX, routes
- **Bundling:** Bun's built-in HTML imports (no Vite, no Webpack)
- **Markdown:** `Bun.markdown` (built-in GFM renderer)
- **Storage:** Local filesystem or `Bun.S3Client` (built-in, swappable via env)
- **Auth:** JWT (HS256) via `crypto.subtle`, cookie-based
- **Icons:** Lucide (`lucide-static` named SVG-string exports, via `<Icon name="..." />`)
- **Database:** `bun:sqlite` (built-in, available for future use)

## Bun HTML Imports

Bun bundles frontend assets automatically via HTML imports. No manual `Bun.build()` needed.

```ts
import homepage from "./edit/index.html";

Bun.serve({
  routes: { "/edit": homepage },
  development: true, // HMR, source maps, re-bundle on each request
});
```

The HTML file references source files directly. Bun handles transpilation and bundling:

```html
<link rel="stylesheet" href="./styles.css" />
<script type="module" src="./app.tsx"></script>
```

### Dev vs Production

- `development: true` — HMR, source maps, no minification, re-bundles per request
- `development: false` — caches bundles, minifies, adds Cache-Control/ETag headers

## Bun Routes

```ts
routes: {
  "/edit": homepage,                    // HTML import (auto-bundled)
  "/health": new Response("OK"),        // Static response
  "/api/items": { GET, POST, PUT, DELETE }, // Per-method handlers
  "/api/items/:id": handler,            // Dynamic params — req.params.id
  "/files/*": handler,                  // Wildcard (see note below)
},
fetch(req) { ... },                     // Catch-all fallback
```

**Wildcard note (still true as of Bun 1.4.2):** `req.params["*"]` is empty. Parse the URL instead:

```ts
function after(req: BunRequest, prefix: string): string {
  return new URL(req.url).pathname.slice(prefix.length);
}
```

## Railroad

Package: `@blueshed/railroad`, from npm (`^0.11.0`). Signals + JSX + routes — real DOM, no virtual DOM.

Railroad ships two Claude Code skills, installed in `.claude/skills/`: **`railroad`** (the checklist of failure modes that actually bite — use it whenever writing railroad JSX) and **`bun-route`** (scaffolding HTML routes, and `Bun.WebView` tests). They're copies, pinned to the installed version: after upgrading railroad, refresh them with `cp -r node_modules/@blueshed/railroad/.claude/skills/* .claude/skills/`. The notes below are the duckdown-specific ones.

### TSX Config (tsconfig.json)

```json
{
  "compilerOptions": {
    "jsx": "react",
    "jsxFactory": "createElement",
    "jsxFragmentFactory": "Fragment"
  }
}
```

### Components

```tsx
import { createElement, signal, effect, when, list } from "@blueshed/railroad";

// Components are functions that return DOM nodes
function Greeting({ name }: { name: string }) {
  return <div>Hello {name}</div>;
}

// Reactive state with signals
const count = signal(0);
function Counter() {
  return <button onclick={() => count.update(n => n + 1)}>Count: {count}</button>;
}
```

### Key Patterns

- **`signal(value)`** — reactive state, auto-updates DOM when changed
- **`computed(fn)`** — derived signal from other signals
- **`effect(fn)`** — side-effect that re-runs when dependencies change, returns dispose
- **`when(sig, truthy, falsy?)`** — conditional rendering, swaps on truthiness transitions only
- **`list(sig, keyFn, render)`** — keyed list rendering with DOM diffing. **`render` gets a signal per row, not the item** (railroad 0.11): `row$.map(r => r.name)` for text, `row$.peek()` in handlers. Reading it as the item left the file list empty in 0.0.2's upgrade.
- **Function children** — `{() => expr}` is a reactive text node (0.11 removed `text()`)
- **`batch(fn)`** — group updates into a single flush
- **`effect(fn)` may return a cleanup**, run before its next run and when it's disposed: the place to clear a timer (Preview's debounce).
- **Build conditional panels with `when()`**, not by swapping prebuilt nodes: a component made when it's shown starts from the current state (an iframe attached as its `srcdoc` changes can keep the old document).

**`when()` renders on a microtask, not in the `mount()` call.** Straight after mounting, a branch whose condition is already true is not in the DOM yet — a synchronous `querySelector` for it comes back null. Await a tick (the tests' `waitFor`) before looking. Transitions after that are synchronous. This looks exactly like "`when()` ignores an initially-true condition", which it doesn't, and chasing that wastes an hour.

Don't wrap signal updates in a bare `catch {}`: a render error inside `.set()` throws back to the caller, and an empty catch hides it.

## Running

```sh
bun install
bun run dev        # Development with HMR
bun run start      # Production
bun run stop       # Stop the server this folder's pid file names
bun run dev:s3     # Start MinIO + run with S3 storage
bun run s3:up      # Start MinIO alone (s3:down stops it, s3:logs follows it)
bun run serve      # Hand out ./dist: the published flavour's server (SITE_DIR, PORT)
bun run setup      # What bun create runs after cloning
bun run test       # Run tests; fails below 100% line/function coverage
bun run check      # TypeScript check
bun run export     # Write the whole site to ./dist as plain files
```

The server writes its pid to `duckdown.pid` (`DUCKDOWN_PID` moves it; set it empty to turn it off) and removes it on exit. `bun run stop` (`server/stop.ts` → `stopServer()` in `pid.ts`) SIGTERMs it and waits for it to go; it signals only a process whose command line names `main.ts` (a stale file's number may since belong to something else), clears a stale pid file, and says what it did. That includes a server the desktop app's preview pane started. A second server started while the first is alive stops with a message rather than failing on the port. Tests give each server they spawn its own pid file.

## Storage

Swappable via env vars. Set `DUCKDOWN_BUCKET` to use S3, otherwise local filesystem.

```sh
# Local dev: edit a copy, never the seed — the first run copies DUCKDOWN_SEED
# to DUCKDOWN_PATH when that folder doesn't exist (delete it to start over)
DUCKDOWN_PATH=./.dev-site
DUCKDOWN_SEED=./tests/example

# S3 / MinIO — an empty bucket is seeded from DUCKDOWN_SEED on the first run
DUCKDOWN_BUCKET=my-bucket
DUCKDOWN_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minio
S3_SECRET_ACCESS_KEY=minio123
```

## Auth

JWT (HS256) stored in an HttpOnly cookie. Configure via env:

```sh
COOKIE_SECRET=your-secret    # HMAC signing key
COOKIE_NAME=duckie_token     # Cookie name
```

Users stored in `users.json` in the content directory, passwords hashed with `Bun.password`. A deployment sets `DUCKDOWN_ADMIN_PASSWORD` (and optionally `DUCKDOWN_ADMIN_USER`) instead of committing a hash: `ensureAdmin()` writes it at startup, so a seeded site never carries the example's `admin`/`admin` onto the internet.

Signed out, a page load of a protected route is redirected to `/login?next=…`; a fetch (no `text/html` in `Accept`) gets a 401. The editor sends every request through `edit/api.ts`, which turns a 401 into a trip to the login page and back. `/edit` itself is an HTML import and can't be guarded server-side, so the editor's first request does it. Signing in lands on `/edit` unless `next` says otherwise (and `/login` when already signed in goes straight there). Logout is POST-only and refuses `Sec-Fetch-Site: cross-site`.

## The view log

`DUCKDOWN_LOG=1` prints one line per page view (`server/log.ts`, called from the
site route, which wraps every answer so a 404 counts too). It records what was
read and how much — path, status, duration, the referring host when it is
another site, a crawler flag — and deliberately records nothing that identifies
a reader: no IP, no user agent, no cookie, no session. Keep it that way. An IP
is personal data, and the moment one is logged the site needs a lawful basis, a
privacy notice and a retention policy.

## Failures speak

Nothing fails silently. In the editor, every request goes through `api(what, url, init?, allow?)`: a failed one speaks — `speak()` in `edit/notice.ts` shows it (the `Notice` alert) and logs it — naming what was attempted ("Couldn't save hello.md: 500 …"); `allow` lists statuses the caller handles itself (New's 412). A request that never arrives resolves to `Response.error()`, so callers check `res.ok` and need no `catch`. `app.tsx` speaks for anything uncaught. The same line carries news — `tell()`, not red, `role=status` — for the rare thing the editor did on your behalf that you'd want to know (a renamed work kept its old address); it is not a second channel for failures. On the server, `routes/error.ts` logs what a handler throws and answers 500 with a line (the detail only in development). No bare `catch {}`: if a failure is deliberately survived (a theme that won't load), log why.

## Pages: markdown and themes

`renderMarkdown(source, path)` in `markdown.ts` is Bun.markdown (GFM, heading ids and self-links, wiki links) plus three passes over its HTML: callouts (`> [!NOTE]` …), `<x-wikilink>` → `<a>`, and the contents list for `toc: true`. `path` is where the page lives, for relative wiki links: the site passes it, and so does the preview (`PUT /edit/mark/?path=`). Keep new syntax opt-in and readable as plain markdown.

When a content feature changes (syntax, front matter, themes, navigation, the editor), update the authoring skill — `.claude/skills/duckdown/` (`SKILL.md`, `reference.md`) — and the seed site's guide pages (`tests/example/pages/guide/`) with it: the skill is what a session writing a site's content reads.

Styling is templates and stylesheets, and nothing else. `templates/site.html` links `static/site.css` (duckdown's base, everything drawn from CSS variables) and `static/theme.css` (this site's look, saying only what differs). There is no `theme:` key, no class on `<body>`, and no per-folder cascade: every page is styled because the template links the files, so a page can't opt in and can't forget to. Style new things through the variables so `theme.css` reaches them. For one page, `css:` links a stylesheet after the template's own; for a kind of page, `layout:` picks a template that links what that kind needs.

Search happens in the browser. `search.ts` builds one entry per readable page and one per section of it — url (a section's ends `#id`, read out of the rendered HTML so it can't disagree with the page), title, section, description, date, and that section's words — and the whole thing goes over as `/search.json` (served) or `dist/search.json` (published). Nothing on the server searches: a few dozen pages is a few dozen kilobytes, and a linear scan of that in the browser beats asking anyone. Drafts are left out, because a result that 404s is worse than no result, and `server/base/search.js` is ordinary site code a site can fork by having its own. It ranks title > heading > description > body, shows at most three sections of a page, and links `url#id:~:text=…` (a text fragment, with `-` encoded), which a browser may honour, ignore, or (some Chromium builds) honour by giving up on the id as well — so `search.js` scrolls to the heading itself on `load` when the reader is still at the top. Every field matches at the start of a word, and `.search-results` scrolls inside its panel. The sitemap doesn't take its addresses from the sections: `buildSite()` returns the entries and a page list, from one walk and one cache. The index is cached exactly like the nav, and `routes/pages.ts` drops both on a write. That one walk also collects the aliases — an address a page or an item used to answer at — so `aliasTarget()` costs nothing extra and expires with the index.

What the site knows about itself lives in `nav.ts`: the nav, each folder's `{{pages}}` listing, and `{{sitemap}}` (the same walk, recursive: `folderEntries()` is what both are made from, so they agree on drafts, `-` folders and order). In production both are built once and dropped by `pagesChanged()` whenever the pages route writes or deletes, because every write goes through the server — a new write path to pages must call it too. With `DEBUG=1` they're built per request instead, so pages written straight to disk (by hand, or by a session using the authoring skill) show up at once.

`collection.ts` is a folder of pages duckdown writes, and it keeps **data** and
**presentation** apart, because one collection is shown more than one way.
The data is `pages/<folder>/collection.json`: declared `fields` (`{name, kind,
label}`, kinds `text`/`long`/`image`/`number`, one `image` field — the picture)
and groups (and subgroups) of items; an item key the fields don't declare is a
problem. The presentation is markdown: the **each: page** in the same folder
(any `.md` but `index.md` whose front matter says `each: true`) is the page
every item gets at `/<folder>/<slug>/` — found by `eachPageIn()` when the
collection loads, rendered once and kept on `Collection.each`, never served,
listed or searched as a page itself — and any page with `{{items}}` is an
overview (`collection: <name>` names the collection its bare tags mean). No
each: page, no item pages: overviews show unlinked thumbnails. A file with no
`fields` has `PLAIN` ones (`src` the picture, `title`, `caption`), the same
three the pane adds items as; a `layout` in the data (0.4's item template)
is a problem that says to write the each: page. It is
read through the storage layer like everything else, so it works on disk and
in a bucket, and it is cached exactly like the nav — `routes/pages.ts` calls
`collectionsChanged()` beside `pagesChanged()` and `searchChanged()`, because
collection.json and its each: page live under `pages/` and are written through
that same route. With `DEBUG=1` it is read per request.

Items flow through the same three callers as every page. `itemAt(pages, name)`
splits an address into a folder and a slug, asks that one collection, and
answers null for anything it doesn't hold (or when it has no each: page) —
never a nearest match, which is what served the wrong painting on the site
this came from. `routes/site.ts` calls it when no `.md` answers (an each: page
answers as a miss), `export.ts` calls it while walking (a `collection.json` in
the walk renders every item into `dist/`), and both then go through
`itemPage()` + `pageHtml()` with the item in `PageOptions.item`: `itemBody()`
is the each: page's html filled for the item, `itemMeta()` its front matter.
`search.ts` meets the same file in its own walk and emits an entry and a
`PageRef` per item, so items are in `/search.json` and `sitemap.xml` for free.
The preview renders an overview like any page and returns
`collectionProblems()` beside the html, which is how the editor's Notice hears
that a slug collides with a page.

`CollectionPane.tsx` edits that file as what it is: groups of items, each an
input per field the file declares (`fields`, as the server parses them: a line
for text and number — values stay strings, a number may say `skip` — a box for
long) and the `image` field as the picture; a file with no `fields` gets
`PLAIN` from the server, and one with no image field adds items as empty rows.
It keeps the **raw** JSON, not the parsed
`Collection` — a parsed one has slugs and resolved URLs in it, and writing
that back would be writing duckdown's reading of the file rather than the file
— so every key it doesn't show survives a change untouched. Each change
replaces the model and writes the whole file through `/edit/pages/`, serialised
through one promise chain, which is the write path that drops all three caches;
`collectionChanged()` then has the preview render again. The one thing it can't
do through the folders the editor already has is put a picture where `images`
says pictures go: `routes/collection.ts` does that (`POST` writes the original
and a 128px thumbnail named by `thumbName()`, `GET` answers `{fields, images,
uploads, problems}`), and `server/images.ts` holds `imageUrl()`/`thumbName()` so the
pane and the renderer resolve the same two URLs. A collection whose `images`
base is outside `static/images/` is read-only for pictures and says so.
`LocalStorage.write()` writes beside the file and renames onto it, because a
pane that writes on every change makes a torn read something you watch happen.
A committed field edit that moves an item's address (a title is its slug) adds
the old address to that item's `aliases` — only an address the file had when
the pane opened it, never one a live item now answers at — and takes off an
alias that is its address again; the news is told once the write lands. The
pane works the addresses out with `server/slugs.ts`, the server's own rule.
"New collection" in the tree (`createCollection()` in store.ts) writes
`collection.json`, an `item.md` each: page and, if the folder has none, an
`index.md` with `{{items}}`, each create-only, then opens the index with the
pane below it.

Slugs are addresses, not titles (`server/slugs.ts`, read by the server and
the pane alike): `slugify()` folds accents and keeps
`[a-z0-9-]`, `SLUG` is the shape every slug has, duplicates take `-1`/`-2` in
file order and a title with nothing usable in it takes `item-<n>`. Aliases —
`aliases` on an item, repeatable front matter on a page — are collected by
`buildSite()` and matched by `aliasTarget()` on the **decoded** path
(`decodePath()` runs first), because a legacy address may hold a quote or a
curly apostrophe; the site answers 301, and the export writes a redirect page
under the decoded name — or says it can't, when the filesystem refuses that
name or keeps it under another spelling (`lands()`), rather than crashing or
publishing an address that won't answer.

`{{items}}`, `{{items <collection>}}`, `{{items by=<field>}}` and `{{groups}}`
are filled by `fillCollections()`, over the page's body (outside `<code>`, like
`{{pages}}`) and again over the template, before `{{content}}`;
`{{item-<field>}}`, `{{prev}}`, `{{next}}` and `{{group}}` are filled by
`fillItem()` in the each: page's body and in the template, and in its `title:`
and `description:` unescaped (`itemText()`). Markdown percent-encodes braces in
a link's address, so `fillItem()` fills `%7B%7Bitem-x%7D%7D` too. A field a
page asks for that isn't declared is said once in the log. `{{items
template=<name>}}` draws each item with `templates/<name>.html` through that
same `fillItem()` — the overview's counterpart of the each: page's `layout:`;
`page.ts` supplies the reader (`itemTemplate()`, which honours an unsaved
draft), because templates are the site's and `collection.ts` only sees pages. Templates stay flat:
placeholders and generated HTML, never a loop. `SKIP` ("skip") is the one value
duckdown reads rather than shows — out of `{{items by=…}}`, and empty in
`{{item-<field>}}` so a template's `href="…#{{item-index}}"` lands at the top.

The editor edits three folders, each its own route built by `fileRoutes()`
(`routes/files.ts`): `pages/`, `templates/` and `static/`. Each is rooted in its
own folder, so none can reach across them — and `users.json` sits at the site
root, in none of them, which is why the hashes stay out of the editor. Keep it
that way when adding a section.

Nothing the editor writes is lost. `fileRoutes()` keeps what a save replaces
and what a delete removes in `.history/<section>/<key>/<time>` (`history.ts`),
at the site root beside `users.json` — outside every folder the site serves,
exports or lists, and through the storage layer. A save keeps one only when
none is newer than `QUIET` (ten minutes), so a sitting of edits — the
collection pane writes on every change — leaves one version, the file as it
was before; a delete or a restore always keeps one; `KEEP` (30) per file. The
same routes answer `?versions`, `?version=<id>`, `?deleted` and
`POST ?restore=<id>`, and the editor shows them as Earlier versions (the clock
in `PaneHeader`) and Deleted (atop the tree and each resource list).
`POST ?move=<to>` renames, for a section that passes `fileRoutes()` a `Mover`
(only pages do: templates and stylesheets are named by pages): never onto a
file that exists or to a change of case alone, the versions follow
(`History.move()`), and the page as it was is kept at the new name. The pages'
`movePage()` adds the old address to the page's `aliases` (`addMeta()`/
`dropMeta()` in markdown.ts edit front matter lines in place), except for a
draft, and refuses a folder's `index.md` and an each: page; the editor's
Rename or move (`moveFile()`) saves first and tells the address it kept. A new
write path that bypasses `fileRoutes()` bypasses the history too — the
collection route's picture uploads do, deliberately. The collection pane also
keeps its own undo stack: every change is a whole new file, so undo writes the
previous one.

Front matter takes only the keys duckdown reads (`KEYS` in `markdown.ts`) or an `x-` extension, unless the block is fenced with `---`, which takes anything: a page opening "Update: closed Monday" keeps its first line. Add a key there and in the skill's reference together.

The editor's two right-hand columns each hold whatever is open. The middle one
holds the page and, beneath it, either a resource or a folder's collection —
one slot, so opening either closes the other; each closes, two split the
column, one fills it. Below 768px the three columns stack, the tree capped and
scrolling and the preview standing down: there is no room to show a page beside
the thing you are changing it with. The preview column shows what you'd see: the page as the site
renders it, or, with no page open, a sample page for whatever you're composing
with (sample content for a stylesheet, a sample page put through a template).
Every branch is a `when()` built as it's shown, and they're mutually exclusive,
so at most one is an element at a time.

`export.ts` is the third caller of `pageHtml()`, after the site route and the
preview: it walks `pages/`, renders each page — and each item of any
`collection.json` it meets, plus a redirect page per alias — and writes it at
its one canonical address (`/` and `/blog/` as `index.html`, `about.md` as
`about.html`), then copies `static/`. Drafts are left out rather than hidden,
`{{edit}}` is empty, and `{{url}}` takes its origin from `DUCKDOWN_ORIGIN`
because there is no request to read it from. It reads through the storage
layer, so it exports a folder on disk or a live bucket. A new placeholder or a
new thing a page can say has to work here too — if it needs a request, it
can't go in `pageHtml`.

`page.ts` turns a page into a document: its markdown inside the template `layout:` asks for, with the nav, the `{{pages}}` listing, the page's `css:` and the rest filled in, every value escaped. `routes/site.ts` and `routes/mark.ts` both go through it — `parsePage()` first, so the site can 404 a `draft:` before the expensive part, then `pageHtml()`. That is why the editor's preview is a preview and not a likeness: same template, same nav. The preview may pass an unsaved template as `draft`, used in place of the saved one when it is the one the page wears, and `pageHtml` reports which template it settled on.

A folder is served by its `index.md` (`/blog`, `/blog/`, `/blog/index.html`), and `draft: true` is 404 unless the reader is signed in. `plainName()` guards both `layout:` and `css:`: a page names a file in a folder it must not climb out of.

Paths: storage keys are real names. The server decodes the URL path (`after()`); the editor builds URLs with `urlPath()` (each segment encoded). Never interpolate a name into a URL raw.

## Two ways in, one scaffold

`server/init.ts` exports `scaffold(root, { vendored })`, which writes everything a site needs around the code: `site/` (index, theme.css, the seed's template, users.json), `.env`, `.gitignore` lines, `.railway/railway.ts` (Railway's infrastructure-as-code, plus a `railway` devDependency to resolve its `railway/iac` import), the authoring skill, `launch.json`, a CLAUDE.md, and package.json's scripts. **Install** (`bun add` then `bunx duckdown init`, via `cli.ts`) runs it with `vendored: false`; **create** (`create/setup.ts`) with `vendored: true`. The only difference in what it writes is the scripts' paths (`scripts()`): `node_modules/duckdown/server/…` or `server/…`. It never overwrites and returns what it wrote and what it left alone. Create mode keeps `server/`, `tests/` and `bunfig.toml`: an owner starts with the suite. There is no upgrade path from create; the README says to fork on GitHub for that.

## What a site gets without asking

- **The base.** `site.css` and `search.js` are duckdown's, not the site's: `staticFile()` (routes/static.ts) and the exporter fall back to `base.ts`'s copy when the site has no file of that name, so a site that never forked one is upgraded by upgrading duckdown. They live in `server/base/`, which exists whether duckdown is installed or vendored by `bun create`, so one fallback serves both; the seed carries no copy, and the editor lists only files a site owns. `create/setup.ts` doesn't copy them.
- **A 404 page.** `pages/404.md` answers a miss with a 404 status (`notFound()` in routes/site.ts) and exports as `404.html`. `NOT_FOUND` in search.ts keeps it out of search, `{{pages}}` and the sitemap. A content folder that vanishes while the server runs is said once in the log, at the first miss.
- **Root files.** `ROOT_FILES` (robots.txt, favicon.ico) in `base.ts`: a list of two, answered at the root from `static/` and written to the root of `dist/`. Not a mechanism.
- **One address.** `hosts.ts` is what both servers ask of a request's name (`hostOf()`: x-forwarded-host first): `hostAnswer()` 301s another name to `DUCKDOWN_ORIGIN` and closes `robots.txt` on a place to look (`looking()`: localhost, 127.0.0.1, `*.up.railway.app`, never the origin's own host), and the caller adds `X-Robots-Tag: noindex` there to every answer. `serve.ts` asks it in `route()`, the served site in `siteHandler(origin)` (routes/site.ts) — pages only: the other routes answer under any name. Unset, nothing moves.
- **Sitemap.** `sitemapXml()` over `searchIndex()`, served at `/sitemap.xml` and written by the exporter when `DUCKDOWN_ORIGIN` is set (it needs absolute addresses).
- **Validators.** `conditional()` in utils.ts: an ETag from the bytes, 304 on a match. Static files and signed-out pages use it; a signed-in page (it has the edit link) is `private, no-cache`.
- **Template values.** `{{x-anything}}` in a template is the page's own `x-` key, escaped, empty when unset, filled before `{{content}}`.
- **Bad URLs.** `decodePath()` answers null for a malformed escape; `after()` throws `BadRequest`, which `handleError` answers 400 without a stack. The site route and `serve.ts` answer 400 themselves.
- **The export's checks.** It renders everything before it deletes `dist/`, and fails when there is nothing to write (naming where it looked). `brokenLinks()` reports each relative link that leads nowhere; `--strict` or `DUCKDOWN_STRICT=1` fails on them. The preview asks the same of the page being edited as it is written: `links.ts` holds `linksIn()` (what counts as a link, for both) and `deadLinks()`, which checks against the cached index (`pageList()`, `aliasTargets()`), and against `static/` only for the files the page names, and `routes/mark.ts` returns what it finds among `problems`. `Preview.tsx` takes its own line down once the problems are gone. `main()` returns the exit code so the `import.meta.main` line stays one line (coverage counts a multi-line block that a test can't run).

## Testing

`bun run test` must stay at 100% line and function coverage (`bunfig.toml` enforces it). How the suite gets there:

- **The server runs in the test process.** `tests/setup.ts` (preload) points it at a scratch copy of `tests/example` with its own pid file before any module reads `process.env`; `tests/helpers.ts` imports `server/main.ts` and exports `BASE`, `signIn()`, `authed()`. Code in a spawned subprocess is not counted, so subprocesses (`process.test.ts`) are only for what only a process shows.
- **The editor runs in happy-dom** against that server: `editor.test.tsx` routes relative fetches to `BASE` with the session cookie, mounts components with railroad's `mount()`, and stages failures with `intercept()`. The preload puts Bun's own `fetch`/`Response`/timers back after registering happy-dom — the server needs them.
- **S3** is tested through Bun's real `S3Client` against `tests/fake-s3.ts`; pass credentials explicitly (Bun reads its S3 env only at startup).
- Keep code testable rather than excluding it: parameters with production defaults (`storageAt(sub, s3)`, `seedLocalSite(seed, target, s3)`, `configLines(c)`), throw instead of `process.exit`, and export what a test must call.
- A line that no test can reach is dead: delete it, don't ignore it.
