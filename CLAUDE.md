# Duckdown

A markdown CMS built with **Bun 1.4.4** (server) and **Railroad** (UI).

## Architecture

`server/main.ts` is **resources and routes** — nothing else. Import your resources (HTML, handlers), wire them to routes. Each handler lives in its own module. You read `main.ts` and immediately know every URL the app handles and where to find the code.

```ts
// server/main.ts — resources and routes, nothing else
import homepage from "./edit/index.html";

Bun.serve({
  routes: {
    "/health":          new Response(HEALTH),   // a platform's healthcheck: "OK duckdown 0.14.4"
    "/edit":            homepage,
    "/edit/styles.css": editorCss,   // Bun.file — also styles /login
    "/edit/icon.png":   editorIcon,  // and gives it the editor's icon
    "/login":           { GET: handleLoginGet, POST: handleLoginPost },
    "/logout":          { POST: handleLogout },
    "/edit/pages/*":     handlePages,
    "/edit/templates/*": handleTemplateFiles,
    "/edit/static/*":    handleStaticFiles,
    "/edit/mark/":       handleMark,
    "/search.json":      handleSearch,       // the whole index, for a search.js from before the parts
    "/search/index.json":  handleSearchFile, // the index in parts; the browser matches
    "/search/words/:file": handleSearchFile,
    "/search/pages/:file": handleSearchFile,
    "/:lang/search/index.json": handleSearchFile,   // a language's own, the same three files
    "/:lang/search/words/:file": handleSearchFile,
    "/:lang/search/pages/:file": handleSearchFile,
    "/edit/translations": handleTranslations,      // where each page and item stands in each language
    "/sitemap.xml":      handleSitemap,      // the same index, for crawlers
    "/edit/browse/*":    handleBrowse,
    "/static/*":         handleStatic,
  },
  fetch: handleSite,
  error: handleError,   // failures speak: logged, and a line the editor can show
});
```

Adding a new route: one import, one line. The route file is self-contained.

Every answer says `nosniff` (`everyAnswer()` and `answering()` in `headers.ts` wrap the routes, `fetch` and `error`). A new route that hands out stored bytes as they are — a file of the site, an earlier version, a report's raw markdown — spreads `...asFile(type)` into its headers, so an SVG or an HTML file there runs no script on the site's address.

A site's own routes come in as extensions (see [Extensions](#extensions)): `main.ts` passes its routes through `withExtensions()`, which adds a site's, refuses a clash, and says what they answer, since a page at one of their addresses is never shown for the methods it answers.

## Project Structure

```
duckdown/
├── server/
│   ├── main.ts            # Entry point — resources and routes
│   ├── config.ts           # Env vars (DUCKDOWN_PATH, PORT, DEBUG, etc.)
│   ├── storage.ts          # Storage abstraction (local filesystem / S3) + dev seed
│   ├── auth.ts             # JWT auth, login/logout handlers; getUser checks the user and their fingerprint
│   ├── users.ts            # users.json: read/write, the fingerprint, `duckdown user`
│   ├── remote.ts           # Where the site is published from here (DUCKDOWN_REMOTE): git; publish, pull
│   ├── gitenv.ts           # gitEnv(): the environment every git call here gets, without the repository the caller's names (GIT_DIR and kin); the tests clear the same names
│   ├── markdown.ts         # Front-matter parser + Bun.markdown
│   ├── kept.ts             # kept(): what the site knows about itself, built once; siteChanged() drops it all
│   ├── listed.ts           # What counts as a page, for every walk: hidden, unlisted (-), pageKey, readable; NOT_FOUND; navIgnored (nav: on a page that is no folder's index)
│   ├── languages.ts        # A site in more than one language: languagesOf, translation() (translated / fallback / null), sourceHash, standing (fresh / stale / …)
│   ├── standing.ts         # Where a translation stands against its source: the one pure rule the server and the editor's words pane both apply
│   ├── nav.ts              # The site nav, cached until the editor changes a page
│   ├── pid.ts              # Pid file: written at startup, removed on exit; stopServer()
│   ├── stop.ts             # bun run stop
│   ├── log.ts              # The view log: what was read, never who; parseView reads a line back
│   ├── report.ts           # duckdown report: view lines in, reports/<month>/<day>.md out
│   ├── search.ts           # The index readers search, cached like the nav, and cut into parts; page and item aliases
│   ├── sitemap.ts          # sitemap.xml from that index
│   ├── feed.ts             # A folder's Atom feed (feed: true), cached like the nav; {{feed}}
│   ├── collection.ts       # collection.json (the data) + its each: page (the page every item gets)
│   ├── history.ts          # Earlier versions: what a save replaced, what a delete removed
│   ├── images.ts           # Where a collection's pictures are, what a thumbnail and a width are called (both ends read it)
│   ├── icons.ts            # The site's own pictures in static/: the tab and home-screen icons, and the card a shared link shows (sitePicture(), kept)
│   ├── widths.ts           # A picture kept at narrower widths: made on upload or by duckdown images; a page's <img> gets a srcset
│   ├── slugs.ts            # An item's slug and address, and how aliases compare (both ends read it)
│   ├── base.ts             # Where the base files are (server/base/) and the root files
│   ├── base/               # site.css, search.js: served and exported when a site has none of its own
│   ├── help/               # The editor's Help, one markdown page per topic, for the person editing
│   ├── init.ts             # scaffold(root, {vendored, deploy}): what both ways in write (see below)
│   ├── cli.ts              # bin `duckdown`: the server, or `duckdown create|init|user|publish|pull|report|upgrade|images|translations|bucket`; --help
│   ├── create.ts           # duckdown create <name>: the install way in one line (bunx from GitHub): the newest release installed, its own init run, committed; git() and commitAll(), which setup shares
│   ├── upgrade.ts          # duckdown upgrade [tag]: export, re-pin, install, refresh the skill, export, compare
│   ├── bucket.ts           # duckdown bucket pull|push [folder]: a served site's bucket to and from a folder
│   ├── serve.ts            # The published flavour's server: a dist/ folder, and the site's extensions; stopOnSignal() ends it cleanly on SIGTERM
│   ├── extensions.ts       # Routes a site adds: declared in its package.json, given its storage and look
│   ├── hosts.ts            # One site, one address: which names move to DUCKDOWN_ORIGIN, which are noindex
│   ├── scaffold.ts         # Says so when `bun create` left a half-scaffold
│   ├── page.ts             # A page, rendered: markdown in its template
│   ├── export.ts           # bun run export — the whole site as files
│   ├── links.ts            # The links a page makes, and which lead nowhere (the export and the preview ask)
│   ├── utils.ts            # Shared helpers: paths, escaping, dates, a pass outside code
│   ├── headers.ts          # What an answer says about itself: nosniff on every one; asFile() sandboxes a file handed out as it is
│   ├── translations.ts     # Where every translation stands, pages and items: translationStandings() (kept); `duckdown translations status|stamp`
│   ├── routes/
│   │   ├── files.ts        # fileRoutes() — GET/PUT/DELETE over one folder
│   │   ├── pages.ts        # /edit/pages/* — file CRUD, via fileRoutes
│   │   ├── site-files.ts   # /edit/templates/* and /edit/static/*, via fileRoutes
│   │   ├── mark.ts         # /edit/mark/  — the preview, through page.ts
│   │   ├── browse.ts       # /edit/browse/* — image browser + upload
│   │   ├── reports.ts      # /edit/reports/* — reports/, read-only: a listing, or a report rendered as a page
│   │   ├── users.ts        # /edit/users — who can sign in: names, never hashes
│   │   ├── help.ts         # /edit/help — the Help drawer's pages (server/help/), examples paired with what they give
│   │   ├── site-icon.ts    # /edit/site-icon — the tab and home-screen icon: where they are, and both written from the editor's PNGs
│   │   ├── publish.ts      # /edit/publish — status, publish (checked), ?pull
│   │   ├── translations.ts # /edit/translations — the standings, what a translation starts as (?draft), a collection's words (?items), ?stamp
│   │   ├── collection.ts   # /edit/collection/* — a collection's pictures (upload + thumbnail), and its problems
│   │   ├── static.ts       # /static/* — site static files
│   │   ├── search.ts       # /search/… — the index in parts, for the browser; /search.json whole, for a search.js from before them
│   │   ├── sitemap.ts      # /sitemap.xml
│   │   ├── site.ts         # fetch fallback — the site, through page.ts
│   │   └── error.ts        # error handler — log it, answer 500 with a line to show
│   └── edit/               # Editor client (served at /edit)
│       ├── index.html      # Entry HTML (Bun auto-bundles .tsx + .css)
│       ├── app.tsx          # Railroad app root
│       ├── store.ts         # Signals + actions (shared state): the tree's folder, which drawer is open
│       ├── past.ts          # Earlier versions and Deleted, as a place: the list, the one looked at, Restore
│       ├── translations.ts  # Languages in the editor: marks, the bar's data, translate(), markUpToDate(); the state itself is in store.ts
│       ├── api.ts           # fetch wrapper: failures speak; a 401 goes to /login
│       ├── notice.ts        # the one line: a failure (speak), news (tell), hush
│       ├── modal.ts         # every dialog: shown modally, named by its heading, focus given back
│       ├── styles.css       # Editor styles (light/dark theme-aware); sizes from :root tokens, pane headers by @container
│       ├── login.html       # Login page (HTMLRewriter; styled by /edit/styles.css)
│       └── components/
│           ├── Trail.tsx     # Where you are, said once: duckie › folder › page (and a drawer's own folders)
│           ├── Browser.tsx   # File/folder navigator
│           ├── Editor.tsx    # Textarea editor with save/delete
│           ├── Preview.tsx   # Live markdown preview
│           ├── CssPreview.tsx # CSS preview in iframe
│           ├── Header.tsx    # Top bar: the trail, then the drawers' buttons, view site, logout
│           ├── Drawer.tsx    # The drawer's frame: over the preview (or, side="left", the tree), not modal, Escape closes it
│           ├── Drawers.tsx   # Whichever drawer is open: Resources, Editors, Help or Publish; LeftDrawer, a chosen work
│           ├── ImageBrowser.tsx # The Resources drawer: images (a grid), css, templates, icon, reports
│           ├── ReportList.tsx # Its reports tab: reports/ by folder, each a link to its own tab
│           ├── ResourceList.tsx # One tab of it: the css or template files
│           ├── SiteIcon.tsx  # Its icon tab: any picture, squared on a canvas (squarePng), sent as the site's two icons
│           ├── ResourcePane.tsx # A resource open below the page
│           ├── CollectionPane.tsx # A folder's collection.json: the works as pictures, the chosen one's fields beside them
│           ├── PreviewFrame.tsx # The sandboxed iframe, in one place
│           ├── TemplatePreview.tsx # A sample page through the draft template
│           ├── PaneHeader.tsx   # The one header both panes wear
│           ├── NewDialog.tsx    # Name a new page, folder, collection, stylesheet, template
│           ├── ConfirmDialog.tsx # Confirm action dialog
│           ├── Past.tsx      # The past's compartments: its list, the version read-only, it rendered
│           ├── Users.tsx     # The Editors drawer: add, set a password, remove
│           ├── Help.tsx      # The Help drawer: what fits what's open first (helpFirst), the rest folded
│           ├── Publish.tsx   # The header's Publish button and drawer: what's waiting, Publish, Pull
│           ├── Translations.tsx # The header's Translations button, the bar over an open page, and the drawer: what is out of date, Add a language
│           ├── CollectionTranslation.tsx # A collection's words in a language: the original beside a box, each item's standing
│           ├── Notice.tsx    # Shows that line (role=alert for a failure, status for news)
│           └── Icon.tsx      # Lucide icons (lucide-static SVG strings)
├── tests/                  # see Testing below
│   ├── example/            # Seed site data (pages, static, templates, a gallery collection)
│   ├── setup.ts            # Preload: env + happy-dom, before any module loads
│   ├── helpers.ts          # The in-process server, signIn(), waitFor()
│   ├── server.test.ts      # HTTP against the in-process server
│   ├── export.test.ts      # bun run export, onto a scratch folder
│   ├── search.test.ts      # plainText, the index, its cache, its parts, and the aliases from that walk
│   ├── search-js.test.ts   # The browser half: server/base/search.js in happy-dom, against an index staged by searchFiles()
│   ├── collection.test.ts  # collection.json: slugs, overviews, aliases, collisions
│   ├── languages.test.ts   # which folders are languages, what answers at a language's address, whether a translation is stale
│   ├── site-languages.test.ts # /cy/… over HTTP: translated, fallback with its note, the switcher, hreflang, the chrome per language
│   ├── nav-languages.test.ts # the nav, {{pages}} and {{sitemap}} of a language: the default's shape, what answers there, its addresses
│   ├── search-languages.test.ts # what a reader of one language can search: one walk, the index cut by language, no 404 page
│   ├── collection-languages.test.ts # a collection in a language: the words by slug, each item's standing, its addresses, its counterparts
│   ├── editor-languages.test.tsx # the editor of a site in more than one language: marks, the bar, the drawer, the words pane
│   ├── history.test.ts     # History: once a sitting, the limit, what was deleted
│   ├── users.test.ts       # duckdown user, the password prompt, what a session is checked against
│   ├── remote.test.ts      # The git kind against real repositories; the publish route; duckdown publish|pull
│   ├── report.test.ts      # parseView, the report, duckdown report
│   ├── upgrade.test.ts     # duckdown upgrade against scratch sites, git/install/export stood in
│   ├── bucket.test.ts      # duckdown bucket pull|push between fake-s3 and scratch folders
│   ├── translations-command.test.ts # duckdown translations status|stamp against scratch folders
│   ├── editor.test.tsx     # The editor's code in happy-dom, against that server
│   ├── units.test.ts       # pid, config, storage, auth, error handler
│   ├── s3.test.ts          # S3Storage via Bun's S3 client + fake-s3.ts
│   ├── fake-s3.ts          # An in-memory S3, path-style, that checks no signatures: what s3, bucket and contract tests talk to
│   ├── storage-contract.test.ts # The same questions of disk and a bucket, the same answers: path shapes, . names, types, links
│   ├── markdown.test.ts    # Front-matter, rendering, nav, themes
│   ├── contrast.test.ts    # WCAG AA for every colour pair, light and dark: the editor, site.css, the seed theme
│   ├── process.test.ts     # Real subprocesses: pid lock, SIGTERM, seeding
│   ├── serve.test.ts       # serveDist(): traversal, redirects, 404.html, what is logged
│   ├── extensions.test.ts  # A site's own routes on both servers: loading, clashes, Site, declared answers
│   ├── widths.test.ts      # Pictures at narrower widths: made on upload and by duckdown images, offered by srcset
│   ├── setup-script.test.ts # both scaffold modes on scratch folders, and `bun run export` in each
│   └── compose.yml         # MinIO for manual S3 runs (bun run dev:s3)
├── bench/                  # bun run bench: a large site made and timed (n163), the export alone and its peak memory, what a first search fetches; a fourth argument adds other languages (n184); measures, doesn't check
├── scripts/sites.ts        # bun run sites: every site in ~/Workshop/websites on duckdown, and where each stands (not shipped)
├── bunfig.toml             # Test preload + the 100% coverage threshold
├── create/                 # `bun create blueshed/duckdown`: calls the scaffold, keeps code and tests, commits
├── package.json
├── tsconfig.json
├── .env                    # Local dev config
├── .env.s3                 # MinIO/S3 config
├── .dev-site/              # Dev working copy of tests/example (gitignored, made on first run)
├── duckdown.pid            # Running server's pid (gitignored)
├── todo.jsonl              # Open work — the ledger (see below)
└── CLAUDE.md
```

## Todo

`todo.jsonl` is the ledger of open work — check it first and keep it current. One self-contained JSON object per line: `n`, `status` (open / fixed / not fixed), `severity`, `area`, `file`, `summary`, `detail`, plus a dated `note` once an item is worked on.

## Stack

- **Runtime/Server:** Bun 1.4.4 (`Bun.serve()`; `engines` asks for 1.4.0 or later)
- **UI Framework:** Railroad (`@blueshed/railroad`) — signals, JSX, routes
- **Bundling:** Bun's built-in HTML imports (no Vite, no Webpack)
- **Markdown:** `Bun.markdown` (built-in GFM renderer)
- **Storage:** Local filesystem or `Bun.S3Client` (built-in, swappable via env)
- **Auth:** JWT (HS256) via `crypto.subtle`, cookie-based
- **Icons:** Lucide (`lucide-static` named SVG-string exports, via `<Icon name="..." />`)

## Bun

`Bun.serve()` routes, and HTML imports: `import homepage from "./edit/index.html"` bundles the `.tsx` and `.css` that file names, with no build step. `development: true` re-bundles each request, with HMR; production caches and minifies.

**Wildcard routes (still true as of Bun 1.4.4):** `req.params["*"]` is empty, so a `"/files/*"` handler reads its path itself: `after(req, prefix)` in utils.ts.

## Railroad

`@blueshed/railroad` from npm (`^0.14.0`): signals, JSX (`jsxFactory: createElement`), real DOM, no virtual DOM. It ships two Claude Code skills, copied into `.claude/skills/` and pinned to the installed version: **`railroad`** (the failure modes that bite: use it whenever writing railroad JSX) and **`bun-route`** (HTML routes, and `Bun.WebView` tests). After upgrading railroad, refresh them: `cp -r node_modules/@blueshed/railroad/.claude/skills/* .claude/skills/`.

What has bitten duckdown, by the version that changed it:

- **`list(sig, key, render)` hands `render` a signal per row, not the item** (0.11): `row$.map(r => r.name)` for text, `row$.peek()` in handlers. Read as the item, it left 0.0.2's file list empty.
- **`when()`'s truthy branch is handed `v$`** (0.14), the current value as a signal; a branch passed by reference (`when(x, chosenPanel)`) receives it too, so it must take no argument it means otherwise. Build a conditional panel with `when()`, not by swapping prebuilt nodes: one made as it is shown starts from the current state (an iframe kept while its `srcdoc` changes can keep the old document).
- **A function child or prop is reactive** (`{() => expr}`, 0.11; `class={() => …}`, 0.12), and a boolean child renders nothing (0.13): `{flag.map(String)}` to show one.
- **An effect's run owns what its body creates** (0.12), a `computed`, a `when()`, a component, and disposes it before the next run: make anything long-lived outside it. It may return a cleanup (only a function counts, 0.13), the place to clear a timer; it is synchronous, and its writes reach other listeners after its body returns.
- **A component body doesn't subscribe to what it reads** (0.13): bind a signal or a function to the DOM rather than reading `.get()` in a body and expecting it to re-run.
- **`when()` and `list()` render inside `mount()`** (0.12); what changes later (a fetch, a handler's `.set()`) still arrives later, so the tests `waitFor` it.
- **No bare `catch {}` around `.set()`**: a render error throws back to the caller, and an empty catch hides it.

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
bun check          # TypeScript check
bun run export     # Write the whole site to ./dist as plain files
bun run bench      # A large site made in a scratch folder and timed (bench/)
```

The server writes its pid to `duckdown.pid` (`DUCKDOWN_PID` moves it; set it empty to turn it off) and removes it on exit. `bun run stop` (`server/stop.ts` → `stopServer()` in `pid.ts`) SIGTERMs it and waits for it to go; it signals only a process whose command line names `main.ts` (a stale file's number may since belong to something else), clears a stale pid file, and says what it did. That includes a server the desktop app's preview pane started. A second server started while the first is alive stops with a message rather than failing on the port. Tests give each server they spawn its own pid file.

## Storage

Swappable via env vars. Set `DUCKDOWN_BUCKET` to use S3, otherwise local filesystem.

A bucket has no links, so on disk a link is what a bucket would hold once `duckdown bucket push` had copied it (n172, and again after review; `storage-contract.test.ts` asks both). `judge()` weighs every link against the one site root — `LocalStorage`'s `site`: `APP_PATH` for `storageAt()` and for any storage made inside it (bucket.ts, remote.ts), else the storage's own root — never against the section it sits in:

- **A section is the site's own folder.** pages/, static/, static/images/, templates/, reports/ or a history that is a link, or sits under one, is refused whole and said once: taken as its own root, a linked static/ served its target's files, keys and all, to anyone. It lists empty, as a bucket's would, and nothing in it is read or written.
- **A link to a file anywhere in the site is that file** — pages/ to static/ is fine — listed, read and kept like any other, until a write replaces the link with a file of its own.
- **Any other link is nothing there**: one out of the site; one to what is read only by its own name (`BY_NAME`: users.json, .history/, reports/), from any storage, the whole site's included, which page.ts reads the templates through; one to a folder, since two can send a walk round forever; one to nothing. It is in no listing and no `keys()`, `follows()` says so once, read, write and remove refuse it as they refuse `..`, and `exists()` answers false. Asked for by name, a link to the site's own folder, or to reports/ or .history/ themselves, lists empty.
- **A read is of the file that was judged.** `opened()` opens it first, then judges where the file it holds really is: that path must pass, and the file there must be the very one open (device and inode). A link swapped between a check and a read handed over its new target again and again in review; now that read is refused. It is judged before it is opened too, and must be a file: a named pipe is opened only once something writes to it, and a link out to one froze the whole server. It is opened non-blocking, so one swapped in between is refused, not waited on.

And a key, on disk and in a bucket:

- **A key names a file.** A write to the root, to a name ending `/`, or to a folder's name is a 400 before anything is written; a rename that fails anyway deletes its temporary file, which `keys()` would list and `bucket push` or a Publish would carry.
- **A key that climbs out of the site** (`/static/..%2Fusers.json`) is a `BadRequest` from `safePath()`: a 400 with nothing logged.
- **`serve.ts` follows the same rule**: it serves only a real file inside `dist/` (which may itself be a link), and sandboxes it by where that file really is, under `static/` or a root file, never by the address it was asked by.

A hard link can't be told apart: it is the file itself, under another name, so a hard link to something outside the site reads as a page of it. Nothing duckdown writes makes one; don't make one. And a write or a remove is still a check and then an act, as is a read through a folder swapped for a link in between: someone swapping links in the site's folders that fast could still move where a write lands, so keep them writable by the server alone.

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

`server/users.ts` owns the file, and its shape never changes (`{name: hash}`), so an older duckdown can always read what a newer one wrote. Who is signed in is decided per request by `getUser()`: the cookie is signed, names a user who must still be in the file, and carries `fingerprint()` of their hash, so a new password or a removal ends their sessions without any session list; a cookie with no fingerprint (made by 0.8 or earlier) stands until it expires. The file is read through `currentUsers()`, kept `FRESH` (5s) and dropped by `writeUsers()`, so a change by `duckdown user` (`userCommand()`, via `cli.ts`) or by hand lands within seconds; login reads it afresh. `/edit/users` (`routes/users.ts`) answers names, never hashes, and adds, re-passwords and removes — every editor equal, nobody removing themselves, the environment's admin untouchable there, and your own password needing the current one (the answer re-signs your cookie). The editor's **Editors** drawer is `components/Users.tsx`.

Signed out, a page load of a protected route is redirected to `/login?next=…`; a fetch (no `text/html` in `Accept`) gets a 401. The editor sends every request through `edit/api.ts`, which turns a 401 into a trip to the login page and back. `/edit` itself is an HTML import and can't be guarded server-side, so the editor's first request does it. Signing in lands on `/edit` unless `next` says otherwise (and `/login` when already signed in goes straight there). Logout is POST-only and refuses `Sec-Fetch-Site: cross-site`.

## Publishing from here

A local duckdown with `DUCKDOWN_REMOTE` set edits its own copy of a site that is published somewhere else, and publishing is a push (`server/remote.ts`). One interface — `status()`, `push(message, by)`, `pull(by)` — whatever is on the other end, and `RemoteRefused` for a reason the person can act on (the route answers it 409, with the line). `remoteFrom()` makes it from `REMOTE` (config): unset is null and nothing changes, no Publish anywhere; `git` is the one kind; anything else, or git over a bucket, fails at startup.

The git kind works in the repository the content folder is in, and on that folder only: pathspecs exclude `NEVER` (`users.json`, `.history`, `reports`) whatever `.gitignore` says, and a commit adds the folder whole and then `git reset`s those paths — `git add` refuses a path list naming an ignored file even as an exclusion, and the scaffold ignores two of them (the tests' repositories carry that `.gitignore` for this reason). A commit is `git commit -- <paths>`, so whatever else is staged stays staged; it carries `Edited-by: <user>`. Status doesn't fetch; pull does. A pull commits edits not yet committed ("Edits kept before pulling"), merges the upstream, and settles a conflict inside the site by keeping this copy's side and saving the other into that file's history (`History.save`, bytes, forced) — a conflict outside the site, or git refusing to merge, aborts the merge and says so. The git kind needs no sync record: git is the record.

`publishSite()` checks first (`checkSite()` in export.ts: the whole export into a thrown-away folder, keeping the broken-link and collection lines, or why there was nothing to export), reports problems with what was published, and refuses only under `DUCKDOWN_STRICT`; with no message it writes `defaultMessage()`. `routes/publish.ts` (`/edit/publish`: GET status, POST publish, POST `?pull`) and `remoteCommand()` (`duckdown publish|pull`, via cli.ts) both call it; a pull that changed anything drops the site's caches with `siteChanged()`. The editor's `components/Publish.tsx` is the header button (hidden when GET answers null — no remote — a badge counting changes plus unpushed commits, refreshed after writes) and its drawer.

## The view log

`DUCKDOWN_LOG=1` prints one line per page view (`server/log.ts`, called from the
site route, which wraps every answer so a 404 counts too). It records what was
read and how much — path, status, duration, the referring host when it is
another site, a crawler flag — and deliberately records nothing that identifies
a reader: no IP, no user agent, no cookie, no session. Keep it that way. An IP
is personal data, and the moment one is logged the site needs a lawful basis, a
privacy notice and a retention policy.

`duckdown report` (`server/report.ts`) reads those lines back — `parseView()` sits beside `viewLine()` in log.ts, so the two can't drift — from a file argument or stdin (a platform's log as it prints it, or JSON lines with `message` and `timestamp`), and writes `reports/<yyyy-mm>/<yyyy-mm-dd>.md` — and that day's counts as `<yyyy-mm-dd>.json` (`countViews()`), from which it makes the month's `index.md` again (`monthMarkdown()`: each day linked, their sums), so the month keeps no count of its own and a day reported twice is never added twice — for each UTC day the lines cover (`dayOf()`, which reads a platform's nanoseconds; an untimed line is today's; a day reported again is replaced) for the editor's Reports tab: readers and crawlers apart, the most read, the 404s, the referring sites — and a scanner's probes counted apart and left out of all of those (`PROBES`, `isProbe()`: dot-files, PHP, other stacks' insides, secrets and configs, scripts, data and source outside `static/`), because scanners pose as browsers and were most of a new site's first views. Files a page pulls in (`FILE`: `static/`, the root files, the search index, feeds) are counted apart and kept out of the views and Most read, though a missing one is still Not found; a certificate authority's check (`ACME`) is a crawler's view and not a miss. It is of exactly the lines it was given and keeps no count between runs, so overlapping logs never count twice, and it asks the platform for nothing. It is the one thing duckdown writes in `reports/`, and only when someone runs it; the server never does.

## Failures speak

Nothing fails silently. In the editor, every request goes through `api(what, url, init?, allow?)`: a failed one speaks — `speak()` in `edit/notice.ts` shows it (the `Notice` alert) and logs it — naming what was attempted ("Couldn't save hello.md: 500 …"); `allow` lists statuses the caller handles itself (New's 412). A request that never arrives resolves to `Response.error()`, so callers check `res.ok` and need no `catch`. `app.tsx` speaks for anything uncaught. The same line carries news — `tell()`, not red, `role=status` — for the rare thing the editor did on your behalf that you'd want to know (a renamed work kept its old address); it is not a second channel for failures. On the server, `routes/error.ts` logs what a handler throws and answers 500 with a line (the detail only in development). No bare `catch {}`: if a failure is deliberately survived (a theme that won't load), log why.

## Accessible by default

A reader or an editor who uses a keyboard, a screen reader, a larger text size, less motion or High Contrast gets the same site and the same editor. Keep it that way; each of these has a test.

- **Everything is reachable by keyboard.** A tree row is a `<button class="row">`, never an `<li onclick>`; a control that can't be a `<button>` (it holds a file chooser) is `role=button tabindex=0` with Enter and Space (`onpress()` in CollectionPane). Resources' tabs are `role=tab` with the arrows.
- **Every dialog goes through `modal()`** (`edit/modal.ts`): shown modally, named by its heading, and focus goes back to what opened it when the dialog is dropped, not only when it is closed. A modal is for new or delete; a drawer (`Drawer.tsx`) is not a modal — the page stays in reach behind it — so it takes focus as it opens, Escape closes it, and focus goes back the same way.
- **Everything has a name**: `aria-label` on an icon-only button, a text field, a textarea, an iframe (`title`); a state says itself (`aria-current`, `aria-pressed`, `aria-expanded`, `aria-selected`; the unsaved dot is `role=img`). What changes without a click — the notice, Saved — is said from a live region already in the page.
- **Sizes are tokens** (`:root` in styles.css): space on a 4px grid, controls 30px, never under 28px (WCAG's minimum is 24), type in rem so the reader's own size setting reaches the editor. A pane's header answers to the pane (`@container pane`), not the window.
- **Colours are tokens, and their pairs are tested** (below, under Testing). A state is never shown by colour or shade alone: forced colours (High Contrast) removes shades and shadows, so a focus ring is an outline, and the open row is bold and outlined there too.
- **Motion stops** under `prefers-reduced-motion: reduce`, in the editor and in `site.css` (and a theme's animation with it).
- **The site**: the seed's templates open with a skip link to `<main id="content">`; `site.css`'s rules are in `@layer base` so a theme wins by coming later; a markdown table scrolls in its own `.table-scroll` box (markdown.ts); a thumbnail printed beside its title is `alt=""`. The authoring skill tells a writer to give every picture words.

## Pages: markdown and themes

What a writer can say (front matter, markdown, navigation, collections, templates, search) is the authoring skill's, in `.claude/skills/duckdown/reference.md`, which opens with a contents list. What follows is how it is built, and the rules a change keeps.

**When a content feature changes** (syntax, front matter, themes, navigation, the editor), change the skill (`SKILL.md`, `reference.md`), the seed's guide pages (`tests/example/pages/guide/`) and the editor's Help (`server/help/`) with it: the skill is what a session writing a site's content reads, Help what a person editing reads.

**One renderer, three callers.** `page.ts` turns a page into a document: `parsePage()` first, so the site can 404 a `draft:` before the expensive part, then `pageHtml()`, its markdown in the template `layout:` asks for, every value escaped, and every placeholder filled in one pass so nothing filled is read again (n202). The site route, the preview (`routes/mark.ts`) and the export all call it, which is why the preview is a preview and not a likeness. The preview may pass an unsaved template as `draft`, used when it is the one the page wears, and `pageHtml` says which template it settled on. A new placeholder must work in the export too: if it needs a request, it can't go in `pageHtml`. `plainName()` guards `layout:` and `css:`, so a page can't climb out of the folder it names a file in.

**The export** (export.ts) writes each page at its one canonical address (`/` and `/blog/` as `index.html`, `about.md` as `about.html`), each item of a `collection.json` it meets and a redirect page per alias, then copies `static/`. Drafts are left out rather than hidden, and with no request `{{edit}}` is empty and `{{url}}` takes its origin from `DUCKDOWN_ORIGIN`. It reads through storage, so it exports a folder on disk or a live bucket.

**Markdown.** `renderMarkdown(source, path)` (markdown.ts) is Bun.markdown (GFM, heading ids and self-links, wiki links) plus passes over its HTML: callouts, `<x-wikilink>` → `<a>`, the contents list for `toc: true`, and a heading's `{#id}` (`explicitIds()`, n187: Bun keeps only a-z and 0-9 in an id, so a translation states its original's; folding accents instead would move every existing anchor). `path` is where the page lives, for relative wiki links; the preview passes it as `?path=`. Keep new syntax opt-in and readable as plain markdown. Front matter takes only `KEYS` (markdown.ts) or an `x-` key, unless the block is fenced with `---`; add a key there and in `reference.md` together. A CRLF page has its front matter like any (n182), and `addMeta()`/`dropMeta()` write back the endings the page has. `nav:` on a page that is no folder's index does nothing and says so (`navIgnored()` in listed.ts, n190).

**Styling is templates and stylesheets, and nothing else**: no `theme:` key, no class on `<body>`, no per-folder cascade. The template links `site.css` (the base, everything drawn from CSS variables) and the site's `theme.css`, so a page can't opt in or forget to. Style new things through the variables so a theme reaches them.

**What counts as a page is decided once**, in `listed.ts` (`hidden()`, `unlisted()`, `pageKey()`, `readable()`), and every walk of `pages/` asks it: the nav, `{{pages}}` and the feed, `{{sitemap}}`, search and `sitemap.xml`, the export. What each walk does with the answer, and in what order, stays its own. `nav.ts` holds the nav, each folder's `{{pages}}` and `{{sitemap}}`, all made from `folderEntries()` so they agree.

**What the site knows about itself is built once**: the listings, the sitemap, the search index, the collections and the feeds each go through `kept()` (kept.ts), and `siteChanged()` drops them all. The pages route calls it on every write, delete, move and restore, as a pull does: every write goes through the server, and a new write path to pages must call it too. A build that fails isn't kept. With `DEBUG=1` they are built per request, so pages written straight to disk (by hand, or by a session using the skill) show at once.

**Search** (what readers get: `reference.md` § Search). `search.ts` builds every entry, and the aliases, in one walk, so `aliasTarget()` costs nothing more and expires with the index; `buildSite()` returns the entries and a page list for the sitemap. `searchFiles()` cuts them into `search/index.json`, `search/words/<xy>.json` and `search/pages/<n>.json`, so a reader fetches what their query needs (n166). A word is a run of `[\p{L}\p{M}\p{N}_]` with an apostrophe inside (`’` read as `'`), cut the same way in `search.js`; each letter also has a shard of its own for `x*` and `x`. In a shard's file name anything but a-z and 0-9 is its code point between dashes (a host built on Jekyll drops a leading `_`), and a page is `0.json`, never `00.json`. A save renumbers the parts, so `index.json` carries a version that `search.js` checks at each search; the parts are `no-cache` with an ETag (`conditional()`), and `serve.ts` sends the three shapes (`SEARCH_PART`) the same way, told by the file, not the address. A language's index is cut from the same walk by address (`entriesIn()`) and served by `/:lang/search/…`. `/search.json`, the whole index, stays for a `search.js` from before the parts. `server/base/search.js` is site code a site can fork. Not done: page ids that survive a save, places as typed arrays.

**Collections** (what they are to a writer: `reference.md` § Collections). `collection.ts` keeps the data (`pages/<folder>/collection.json`: `fields`, groups, items) apart from the presentation (markdown: the each: page, overviews), because one collection is shown more than one way. The each: page is found by `eachPageIn()`, rendered once onto `Collection.each`, and never served, listed or searched as a page itself. A file with no `fields` has `PLAIN` ones; a `layout` in the data (0.4's item template) is a problem that says to write the each: page. It is read through storage and cached by `kept()`.

- **An item is found exactly, or not at all.** `itemAt(pages, name)` asks the one collection the address names and answers null for anything it doesn't hold: never a nearest match, which served the wrong painting on the site this came from. The site route asks it when no `.md` answers (an each: page answers as a miss), the export as it walks, and both render through `itemPage()` + `pageHtml()` with `PageOptions.item` (`itemBody()` the each: page filled for the item, `itemMeta()` its front matter). Search emits an entry and a `PageRef` per item in its own walk, so items are in the index and `sitemap.xml`. The preview returns `collectionProblems()` beside the html.
- **Placeholders.** `fillCollections()` fills `{{items…}}` and `{{groups}}` outside `<code>`, over the body and again over the template, before `{{content}}`. `fillItem()` fills `{{item-<field>}}` (and `-label`, n188), `{{prev}}`, `{{next}}` and `{{group}}` in the each: page and the template, unescaped in its `title:` and `description:` (`itemText()`), and `%7B%7Bitem-x%7D%7D` too, since markdown encodes braces in a link. `{{items template=<name>}}` reads its template through `page.ts`'s `itemTemplate()`, which honours an unsaved draft. Templates stay flat: placeholders and generated HTML, never a loop. `SKIP` is the one value read rather than shown. A field asked for and not declared is said once in the log.
- **Slugs are addresses, not titles** (`slugs.ts`, read by the server and the pane alike): `slugify()` folds accents and keeps `[a-z0-9-]`, `SLUG` is every slug's shape, duplicates take `-1`/`-2` in file order, and a title with nothing usable takes `item-<n>`. Aliases are matched by `aliasTarget()` on the decoded path (`decodePath()` first), since an old address may hold a curly apostrophe; the site answers 301, and the export writes a redirect page, or says it can't (`lands()`) rather than publish an address that won't answer.
- **The pane** (`CollectionPane.tsx`) keeps the **raw** JSON, never the parsed `Collection` (writing that back would write duckdown's reading of the file), so a key it doesn't show survives. The chosen work is chosen by position (`Spot`, `firstWork()`) and follows a work that moves. Each change writes the whole file through `/edit/pages/`, serialised on one promise chain, then `collectionChanged()` has the preview render again; it keeps its own undo stack. A picture goes through `routes/collection.ts` (`POST` an original and a 128px thumbnail), and `images.ts`'s `imageUrl()`/`thumbName()` name both for the pane and the renderer. A field edit that moves an item's address adds the old one to its `aliases`: only one the file had when the pane opened. `LocalStorage.write()` writes beside the file and renames, because a pane that writes on every change makes a torn read something you watch happen. "New collection" (`createCollection()` in store.ts) writes the file, an each: page and an index, each create-only.

**The editor edits three folders**, each its own route built by `fileRoutes()` (routes/files.ts): `pages/`, `templates/` and `static/`, each rooted in its own folder so none reaches another, and `users.json` in none of them, which is why the hashes stay out of the editor. Keep it that way when adding a section.

**Nothing the editor writes is lost.** `fileRoutes()` keeps what a save replaces and what a delete removes in `.history/<section>/<key>/<time>` (history.ts), at the site root, outside everything served or exported: a save once a sitting (none newer than `QUIET`, ten minutes), a delete or a restore always, `KEEP` (30) a file. The same routes answer `?versions`, `?version=<id>`, `?deleted`, `POST ?restore=<id>`, and, for a section given a `Mover` (only pages), `POST ?move=<to>`: never onto a file that exists or to a change of case alone, its versions following (`History.move()`), the old address added to `aliases` (`movePage()`; not for a draft, refused for an index or an each: page). The editor's Rename or move (`moveFile()`) saves first and tells the address it kept. A write path that bypasses `fileRoutes()` bypasses the history: the collection route's picture uploads do, deliberately.

**The editor's layout.** One trail says where you are (`Trail.tsx`: the site, `folder` in the store, the page), so a pane's header says only what the trail hasn't (`shortName()`); `loadFile()` moves `folder` to the page's own. The three columns are compartments of one tray: walls meet square, only the tray's corners curve, and anything a wall in takes `--radius-cell` (`--radius-tray` less `--wall`) or its corners bulge. The middle column holds the page and one slot beneath it, a resource or a collection. The header's drawers open one at a time (`drawer`), over the preview; a work chosen in the collection pane opens in the left drawer (`leftDrawer`), over the tree, only on a click; the pane passes its ⌘Z/⇧⌘Z in (`Drawer`'s `onkey`), and it goes with the pane. A page on its way says so (`opening`, `aria-busy`, `.loading-line`), and its first render is asked for at once (the 300ms pause is for typing). Below 768px the columns stack, and the preview, still mounted, is laid over them by the header's Preview (`previewShown`, the tray marked `previewing`), the rest `visibility: hidden` so the page keeps its text, caret and scroll. Every preview branch is a `when()` built as it is shown, one at a time. Earlier versions and Deleted are a place (`past.ts`, `Past.tsx`): the list where the tree was, the version read-only with the lines no longer in the file marked (`changedLines()`, which gives up past `COMPARE_LIMIT`), the present's panes mounted behind so nothing unsaved is lost; Restore asks nothing, because what it replaces is kept. Help (`server/help/<topic>.md`, `routes/help.ts`) renders an `example` block twice, through `renderMarkdown()` itself, links reduced to their look, and `Help.tsx` orders the topics by `helpFirst()`.

A folder is served by its `index.md` (`/blog`, `/blog/`, `/blog/index.html`), and `draft: true` is a 404 to anyone not signed in.

**Paths**: storage keys are real names. The server decodes the URL path (`after()`); the editor builds URLs with `urlPath()`, each segment encoded. Never interpolate a name into a URL raw.

## Languages

What a writer does (the convention, the note on a page not yet translated, `translated-from`, the switcher, `site.cy.html`, a collection's words) is `reference.md` § Languages. **People translate; duckdown never does**: every rule here is about which page answers, and whether a translation still says what its original does.

- **Which folders are languages.** A top-level folder whose `index.md` says `lang:` equal to its own name (`languagesOf()`, kept); the root's `lang:` is the default (`en`). `pages/cy/about.md` translates `pages/about.md` at `/cy/about.html`: the same path is the whole link. An existing site changes only by writing `lang:` on a folder's index. `splitLanguage()` names a key in the default's tree, `languageAt()` an address's language.
- **One function decides what answers**: `translation(pages, lang, key, {drafts})` is `translated`, `fallback` (the default's, for a missing or draft translation; `drafts: true` for a signed-in user) or `null` (a draft, an each: page). The site route (`languagePage()`), the nav, `{{pages}}`, `{{sitemap}}`, the export and the switcher all ask it, so served and exported agree. A fallback is never a nearest match.
- **A fallback is the default's page standing in** (`PageOptions.fallbackFor`): at the language's address, in its nav, listings and template, with the words' own `<html lang>` and dates, and the default page's `{{url}}`, canonical and card, so a search engine sees one page. The note (`<p class="untranslated" lang role="note">`, in the language's `untranslated:` words, else English marked `lang="en"`) leads `{{content}}`, so a template older than the feature still shows it. It is left out of the language's search, `sitemap.xml` and `hreflang`. A miss in a language is answered the same way (`cy/404.md`, else the default's with the note), with no switcher.
- **Staleness.** `sourceHash()` is 8 hex of SHA-256 over `title`, `description` and the body, line endings and trailing spaces normalised first (a page with no front matter keeps its CRLFs as body, n182), and nothing else: `order`, `nav`, `draft`, `date`, `layout`, `css`, `aliases` and `image` are the same in every language. `standing()` (`standing.ts`, which the editor's words pane applies too) is `fresh`, `stale`, `unchecked`, `own` or `missing`; `translationRows()`, `collectionRows()` and `translationStandings()` (kept) collect it. A draft translation is never behind. The export says each stale one (`translation: …`, which `--strict` and the check before a Publish fail on) and notes the unchecked and untranslated.
- **Per language.** Templates: `<layout>.cy`, `<layout>`, `site.cy`, `site`, the layout kept before the language, and an include the same way; `chrome` in `pageHtml()` carries the language. The nav, `{{pages}}` and `{{sitemap}}` (`nav.ts`) keep the default's shape over what answers in the language (`treeOf()`, the union of both trees), each cached under `lang NUL key`; a translation with no `date:` takes its original's. Search is cut by address (`entriesIn()`), and the sitemap's `xhtml:link`s are found by the address with the folder taken off. `kept()` is keyed by language, never by storage. `languageList()` names each language with `Intl.DisplayNames` in the server's runtime, which `/edit/translations` also ships to the editor as `names`, since a browser may lack the locale (n185); `{{languages}}` comes from `counterparts()` and is empty with one language; `{{description}}` writes the `hreflang` alternates (written versions only, with an origin).
- **Collections.** One in a language's folder where the default has one is the default's, cloned by `read()` (`inLanguage()`): the same groups and pictures, each item's words the language's where `pages/cy/<folder>/collection.json` gives them (by slug, or a slug it used to have), `untranslated` set where not. Where the default has none, it is a collection of its own. `itemHash()`, `itemCounterparts()` and `stampItems()` are an item's record, switcher and Mark up to date. A `groups` key no group has, or a `labels` field not declared, is a problem (n186). The export writes each language's items and skips the language's file while walking.
- **The editor.** `store.ts` holds the standings; `translations.ts` marks the tree (`marksFor()`), reads the bar (`barFor()`), and does `translate()` and `markUpToDate()`. `/edit/translations` only reads, and hands back text saved through `/edit/pages/`, which keeps the history and drops the caches. `CollectionTranslation` keeps a collection's words file as it was written.
- **From the command line**, `duckdown translations status [lang] [--json]` and `stamp <path>…` (translations.ts) are the drawer's status and Mark up to date, through storage, so a script needs none of duckdown's modules by their paths (n191; n161 is where a public surface gets decided). `stamp` writes directly and keeps no history: a script's tool, not the editor's.
- **Case.** `/CY/about.html` is a 301 to `/cy/about.html` (`languageSpelled()`, n183): a filesystem that doesn't tell cases apart would otherwise answer it in English.
- **The published server.** `serve.ts` answers a miss under a language's folder with that language's `404.html`, told by the one thing only a language has, a search index of its own.

## Two ways in, one scaffold

`server/init.ts` exports `scaffold(root, { vendored })`, which writes everything a site needs around the code: `site/` (index, theme.css, the seed's template, users.json), `.env`, `.gitignore` lines, `.railway/railway.ts` (Railway's infrastructure-as-code, plus a `railway` devDependency to resolve its `railway/iac` import), the authoring skill, `launch.json` (the site's own dev server, written rather than copied: duckdown's own lists the sites previewed beside it, and isn't shipped), a CLAUDE.md (left alone when `.claude/CLAUDE.md` is there), and package.json's scripts — `build` is `bun run export --strict`, so a deploy that would publish a broken link, a collection problem or a stale translation stops and the live site is left alone. `deploy: "up"` (`duckdown init --deploy up`) writes the `.railway/railway.ts` of a site with no GitHub source, which goes out by `railway up --service <name>` from a clean tree, and says so in its CLAUDE.md; the default is the GitHub one. **Install** (`bunx github:blueshed/duckdown create my-site`, or by hand `bun add` then `bunx duckdown init`, via `cli.ts`) runs it with `vendored: false`; **create** (`bun create blueshed/duckdown`, `create/setup.ts`) with `vendored: true`. `duckdown create` (`create.ts`) is the install way in one line, from GitHub with no npm (there `duckdown` is someone else's), and only a starter: bunx runs master, which asks GitHub for the newest tag (`newest()` in upgrade.ts), writes a package.json pinned to it, runs `bun install`, then *that release's* `init` (`bun run node_modules/duckdown/server/cli.ts init --deploy …`), `bun install` again (init adds railway), all through a `Run` the tests stand in for, and makes the first commit — none when the folder it runs in is inside a repository already. So the site is made by the duckdown it runs, the README names no tag, and a release changes nothing here. Keep it that way: `create` must work with any release's `init`, so it passes only what every `init` since 0.18.1 takes. bunx keeps what it ran (Bun 1.4.4, `SECONDS_CACHE_VALID` in `bunx_command.rs`): a cached copy is reused, with no check, until its `package.json` is a day old, then reinstalled at master's commit, so a change to `create.ts` reaches everyone within a day. A GitHub spec skips a local `duckdown` bin, so the line works inside a site folder too. What a new site is made on is asked of GitHub at each run, so it is never a day behind. bun create commits its copy before it installs and runs setup, so setup commits its own work as `Set up <name>`, but only when the tree was clean and its own repository's top level beforehand. `bunx duckdown …` runs only once the dependency is installed: in a folder whose package.json names duckdown and has no node_modules, Bun answers "Couldn't find or open the file 'init'" before any of this runs, so the README, init's header and the scaffold's CLAUDE.md say `bun install` first (n193). The only difference in what it writes is the scripts' paths (`scripts()`): `node_modules/duckdown/server/…` or `server/…`. It never overwrites and returns what it wrote and what it left alone. Create mode keeps `server/`, `tests/` and `bunfig.toml`: an owner starts with the suite. There is no upgrade path from create; the README says to fork on GitHub for that. An installed site upgrades with `duckdown upgrade [tag]` (`upgrade.ts`): it exports with the version it has (the pin's, or what is installed when the dependency names no tag), re-pins (in `dependencies` or `devDependencies`, as init takes either), installs, refreshes the skill's copy, exports again and compares every file (with `STAND_IN` as the origin when the site has none, since without one an export writes no sharing tags, sitemap or feeds), and prints the changelog in between; a version that won't install or export the site is put back, and nothing is committed. Its `git`, `bun install` and export go through a `Run` the tests stand in for.

## A release, and the sites that run it

To do all of it, run `/release patch|minor|major` (or `/release sites` to bring the sites onto
the newest tag): `.claude/commands/release.md` has every step, and the rules each site holds.

A release is a commit named `X.Y.Z: what it does`, with `version` in
package.json and a `## X.Y.Z` entry at the top of CHANGELOG.md, then the tag
`vX.Y.Z`, both pushed: `git push && git push origin vX.Y.Z`. A site upgrades
to a tag, never to master. The changelog entry is what each site reads when
`duckdown upgrade` prints it, so anything a site has to do itself (run
`duckdown images`, restart, change a template in its bucket) is said there.

A release isn't out until the sites run it. `bun run sites` finds every folder
in `~/Workshop/websites`, the collection (a site kept elsewhere is a link
there), that depends on duckdown and shows where each stands: its
pin, what is installed, its copy of the skill, whether git has the upgrade,
how Railway's latest deployment got there (`push <commit>`, or `railway up
<time>`) and whether it holds HEAD (a push is compared by commit, a
`railway up` by when HEAD was committed; "not deployed" otherwise), and what
its address's `/health` says it runs (`OK duckdown X.Y.Z`; before
0.14.4 only `OK`). The address is the `DUCKDOWN_ORIGIN` in its
`.railway/railway.ts`, or, while that domain isn't on Railway yet (or none
is set), the service's own railway.app address as `railway status --json`
names it (some carry a suffix Railway chose); the domains themselves
are DNS in blueshed/domains. A site another session is still making shows up
too: leave it to that session, and tell it the release is out.
For each site that's behind, in its folder and by its own CLAUDE.md — the
steps differ, and that file is where they're kept:

1. bring its content home if it lives elsewhere: a served site's bucket with
   `railway run --service <name> bunx duckdown bucket pull` (vashti has its
   own `bun run pull`, which does the same);
2. `bunx duckdown upgrade X.Y.Z`, and read what it compares and prints;
3. do what the changelog asks of a site;
4. commit `package.json`, `bun.lock` and the skill, with a line in its ledger;
5. deploy it its own way (a push, or `railway up`), and run `bun run sites`
   again until its row is on the tag, live included.

## What a site gets without asking

- **The base.** `site.css` and `search.js` are duckdown's, not the site's: `staticFile()` (routes/static.ts) and the exporter fall back to `base.ts`'s copy when the site has no file of that name, so a site that never forked one is upgraded by upgrading duckdown. They live in `server/base/`, which exists whether duckdown is installed or vendored by `bun create`, so one fallback serves both; the seed carries no copy, and the editor lists only files a site owns. `create/setup.ts` doesn't copy them.
- **A 404 page.** `pages/404.md` answers a miss with a 404 status (`notFound()` in routes/site.ts) and exports as `404.html`. `NOT_FOUND` in search.ts keeps it out of search, `{{pages}}` and the sitemap. A content folder that vanishes while the server runs is said once in the log, at the first miss.
- **Root files.** `ROOT_FILES` (robots.txt, favicon.ico, apple-touch-icon.png) in `base.ts`: answered at the root from `static/` and written to the root of `dist/`. An iPhone (or an app drawing a link preview) also asks for the icon as `-precomposed` and sized (`-120x120`, `-180x180-precomposed`): `rootFile()` maps all of them to `apple-touch-icon.png`, the site route and `serve.ts` answer them with it, and the export writes the `-precomposed` copy too. Not a mechanism. A person sets both in the editor's **Resources → icon** (`SiteIcon.tsx`, `routes/site-icon.ts`): the browser squares the picture on a canvas — Bun.Image can't crop or fill, and can't read an SVG — and the route checks each is a PNG of its size (180, on white; 48) before writing both or neither, keeping what they replaced in static's history. Nothing writes them into a page's head — a browser asks the root when a page names none — so a template's own icon link wins, and GET names each template that has one (`otherIcons()`, `ours()`), for the tab to say.
- **One address.** `hosts.ts` is what both servers ask of a request's name (`hostOf()`: x-forwarded-host first): `hostAnswer()` 301s another name to `DUCKDOWN_ORIGIN` and closes `robots.txt` on a place to look (`looking()`: localhost, 127.0.0.1, `*.up.railway.app`, never the origin's own host), and the caller adds `X-Robots-Tag: noindex` there to every answer. `serve.ts` asks it in `route()`, the served site in `siteHandler(origin)` (routes/site.ts) — pages only: the other routes answer under any name. Unset, nothing moves.
- **Sitemap.** `sitemapXml()` over `searchIndex()`, served at `/sitemap.xml` and written by the exporter when `DUCKDOWN_ORIGIN` is set (it needs absolute addresses).
- **Feeds.** `feed: true` on a folder's `index.md` gives it `/<folder>/feed.xml` (`feed.ts`): Atom over `folderEntries()` — what `{{pages}}` lists, so they agree on drafts and order — taking only the pages whose `date:` parses. What it is made from is cached per folder without an origin (`kept()`), and `feedXml()` writes it for an origin. The site route answers `…/feed.xml` before a page (a folder with no feed falls through to a miss); the export writes it only with `DUCKDOWN_ORIGIN`, and `{{feed}}` is empty when `pageHtml` has no origin, so no page links to a feed that wasn't written. `deadLinks()` counts a feed as somewhere.
- **Validators.** `conditional()` in utils.ts: an ETag from the bytes, 304 on a match. Static files and signed-out pages use it; a signed-in page (it has the edit link) is `private, no-cache`.
- **Template values.** `{{x-anything}}` in a template is the page's own `x-` key, escaped, empty when unset, filled before `{{content}}`.
- **A card for a shared link.** `{{description}}` writes the Open Graph tags as well as the description — `og:title`, `og:type` (article when dated), `og:url`, and `og:image` plus `twitter:card` when the page says `image:` — so every site that already has `{{description}}` gets them. `pictureUrl()` (page.ts) makes `image:` absolute (a full URL, a site path, or a path under `static/`; never `..`; an escape already made kept), and addresses are left out without an origin. An item's picture is its `image` through `itemMeta()`, unless the each: page names one. A page that names no picture shares the site's (`sitePicture()` in `icons.ts`, kept like the nav): `static/card.jpg` (1200×630, `summary_large_image`), else the home-screen icon (180, `summary`), with `og:image:width`/`height` since their size is known. The editor's Resources → icon makes the card (`cardJpeg()` — filling it when the picture's shape is near the card's, `cardFit()`, else whole on white, and the tab offers the other — and `iconCard()`, on a canvas; `POST`/`DELETE /edit/site-icon?card`, which call `siteChanged()`).
- **Pictures for smaller screens.** `widths.ts`: a JPEG, PNG or WebP under `static/images/` is also kept at `WIDTHS` (480, 960, 1600; never wider, and only when the copy is smaller in bytes), noted with the original's width in the folder's hidden `.widths.json`; `withWidths()` gives each `<img>` of it a `srcset` and `sizes` (the base's 46rem measure), from a per-folder cache (`kept()`). Made on upload (the images route, the collection route, each calling `siteChanged()`) or by `duckdown images` — which, run against a live bucket from outside, a served site sees only after a restart. The images grid hides the widths (`WIDTH_NAME`).
- **Bad URLs.** `decodePath()` answers null for a malformed escape; `after()` throws `BadRequest`, which `handleError` answers 400 without a stack. The site route and `serve.ts` answer 400 themselves.
- **The export's checks.** It writes into `.dist.next-<pid>-…` beside `dist/` (`mkdtemp`, so two exports never share a folder), and `swapIn()` puts that in `dist/`'s place only once the whole site is written: two renames, `dist/` to `.dist.old-<pid>-…` and the new one in (a `dist/` that can't be moved aside, a mount point, is emptied and filled, and it says so). So a run that fails part-way, or finds nothing to write (it names where it looked), leaves `dist/` as it was and nothing beside it. If the second rename fails the old site goes back; one beaten by another export's swap retries up to five times, then says another is running. The next export's `tidy()` clears what a stopped run left (`process.kill(pid, 0)`) and first puts a stopped run's `.dist.old-…` back when there is no `dist/`, so a crash between the renames never loses the site. `init` gitignores both names. What it holds at 20,000 pages is measured with `bench/export.ts` in a process of its own (n167): `searchFiles()` collects every thousand pages, and only each page's links stay, in `Links` (links.ts), each distinct link once and a page as an `Int32Array` of their numbers, because every page carries the whole nav. `Links.broken()` reports each relative link that leads nowhere, and what it may have meant (`meant()`, n189); `--strict` or `DUCKDOWN_STRICT=1` fails on them. The preview asks the same as the page is written: `linksIn()` (what counts as a link, for both) and `deadLinks()`, against the cached index (`pageList()`, `aliasTargets()`) and `static/` for the files the page names, returned among `routes/mark.ts`' `problems`. `main()` returns the exit code so the `import.meta.main` line stays one line (coverage counts a multi-line block that a test can't run).

## Extensions

A site adds routes of its own (a form, an RSVP) as **extensions** (`extensions.ts`). Declaring one, `answers`, and whose an address is, as a site's author needs them: `reference.md` § Extensions. An extension is a module whose default export takes the `Site` and returns Bun routes, or a promise of them:

```ts
export default (site: Site) => ({
  "/forms/:name": { GET: …, POST: … },
});
```

- **Resolved from the folder the server runs in, never from `site/`**: that can be a bucket its editors write to, and what runs on the server changes only by a commit.
- **Both servers take them**: `main.ts` merges them into its routes, and `serve.ts`'s `listen()` serves them beside `dist/`, on the site's own host. The export writes nothing for them: they need a server.
- **`Site` is `{ storage, render }`**: the site root through the same `Storage` as everything else (disk or a bucket, held to the storage contract), and `render(markdown, { key, path })`, a whole page in the site's template. `key` is where the markdown is kept, for relative wiki links; `path` is the address it is served at, for its canonical link and `og:url` (`PageOptions.path`, n173).
- **`answers` feed the link checks** (`declaredAnswers()`, then `Links.broken(known, answers)` and `deadLinks(…, answers)`), since nothing can ask routes that exist only in a running server (n194).
- **A clash stops the server**: `withExtensions()` refuses a route duckdown or another extension has, and a declared extension that won't load, or has no default export, stops it too, saying which. A site missing its forms would otherwise fail quietly.
- **An address an extension answers is its own, for its methods**: Bun answers routes before `fetch`, where pages come in. A `Response`, a handler, a `Bun.file` or an HTML import answers every method; a route of methods only those. This is not checked against the pages, which change while the server runs, and what an editor writes must never stop the server; instead `withExtensions()` says the addresses and methods as the server starts. Give an extension a name of its own: dash's RSVP is `/rsvp`, not `/` (n177).
- **What one collects goes under `reports/`**, one object per record, since a bucket can't append. On a published site `site/` is deployed code, so anything written there is lost at the next deploy: it needs a bucket, a volume, or somewhere else.
- The first is duckdown-forms (`~/Workshop/blueshed/duckdown-forms`): forms reached by a link whose token authorises itself, signed with Ed25519, so a server can check a token but never make one.

## Testing

`bun run test` must stay at 100% line and function coverage (`bunfig.toml` enforces it). How the suite gets there:

- **The server runs in the test process.** `tests/setup.ts` (preload) points it at a scratch copy of `tests/example` with its own pid file before any module reads `process.env`; `tests/helpers.ts` imports `server/main.ts` and exports `BASE`, `signIn()`, `authed()`. Code in a spawned subprocess is not counted, so subprocesses (`process.test.ts`) are only for what only a process shows.
- **The editor runs in happy-dom** against that server: `editor.test.tsx` routes relative fetches to `BASE` with the session cookie, mounts components with railroad's `mount()`, and stages failures with `intercept()`. The preload puts Bun's own `fetch`/`Response`/timers back after registering happy-dom — the server needs them.
- **S3** is tested through Bun's real `S3Client` against `tests/fake-s3.ts`; pass credentials explicitly (Bun reads its S3 env only at startup). The routes and the editor are tested on disk, so `storage-contract.test.ts` asks disk and a bucket the same questions and expects the same answers: a change to how anything asks storage for something (a path's shape, a listing) gets its case there first — 0.12.1's `news/` was proven on disk and emptied vashti's tree on a bucket (n168, n169).
- Keep code testable rather than excluding it: parameters with production defaults (`storageAt(sub, s3)`, `seedLocalSite(seed, target, s3)`, `configLines(c)`), throw instead of `process.exit`, and export what a test must call.
- A line that no test can reach is dead: delete it, don't ignore it.
- **Colours are tokens, and their pairs are tested.** The editor's colours each name a job (`--text-dim`, `--accent` a fill with `--on-accent` on it, `--accent-text`, `--focus`, `--field-border`, `--danger-text`, `--ok`), because in dark mode one violet can't be both white text's background and text on the surface. `contrast.test.ts` holds each pair to 4.5:1 (text) or 3:1 (a field's edge, a focus ring) in both schemes, for the editor, `server/base/site.css` and the seed's theme, and fails on a literal colour outside the token blocks. A new colour is a new token and a new pair.
