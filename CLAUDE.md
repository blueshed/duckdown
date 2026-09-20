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
    "/edit/pages/*":    handlePages,
    "/edit/mark/":      handleMark,
    "/edit/browse/*":   handleBrowse,
    "/static/*":        handleStatic,
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
│   ├── utils.ts            # Shared helpers (wildcard path extraction)
│   ├── routes/
│   │   ├── pages.ts        # /edit/pages/* — file CRUD
│   │   ├── mark.ts         # /edit/mark/  — markdown preview
│   │   ├── browse.ts       # /edit/browse/* — image browser + upload
│   │   ├── static.ts       # /static/* — site static files
│   │   ├── site.ts         # fetch fallback — render markdown pages
│   │   └── error.ts        # error handler — log it, answer 500 with a line to show
│   └── edit/               # Editor client (served at /edit)
│       ├── index.html      # Entry HTML (Bun auto-bundles .tsx + .css)
│       ├── app.tsx          # Railroad app root
│       ├── store.ts         # Signals + actions (shared state)
│       ├── api.ts           # fetch wrapper: failures speak; a 401 goes to /login
│       ├── notice.ts        # the one failure message (speak / hush)
│       ├── styles.css       # Editor styles (light/dark theme-aware)
│       ├── login.html       # Login page (HTMLRewriter; styled by /edit/styles.css)
│       └── components/
│           ├── Browser.tsx   # File/folder navigator
│           ├── Editor.tsx    # Textarea editor with save/delete
│           ├── Preview.tsx   # Live markdown preview
│           ├── CssPreview.tsx # CSS preview in iframe
│           ├── Header.tsx    # Top bar (view site, images, logout)
│           ├── ImageBrowser.tsx # Sidebar image browser + upload
│           ├── NewDialog.tsx    # New file/folder/theme dialog
│           ├── ConfirmDialog.tsx # Confirm action dialog
│           ├── Notice.tsx    # Shows the failure message (role=alert)
│           └── Icon.tsx      # Lucide icons (lucide-static SVG strings)
├── tests/                  # see Testing below
│   ├── example/            # Seed site data (pages, static, templates)
│   ├── setup.ts            # Preload: env + happy-dom, before any module loads
│   ├── helpers.ts          # The in-process server, signIn(), waitFor()
│   ├── server.test.ts      # HTTP against the in-process server
│   ├── editor.test.tsx     # The editor's code in happy-dom, against that server
│   ├── units.test.ts       # pid, config, storage, auth, error handler
│   ├── s3.test.ts          # S3Storage via Bun's S3 client + fake-s3.ts
│   ├── markdown.test.ts    # Front-matter, rendering, nav, themes
│   ├── process.test.ts     # Real subprocesses: pid lock, SIGTERM, seeding
│   ├── setup-script.test.ts # create/setup.ts on a scratch folder
│   └── compose.yml         # MinIO for manual S3 runs (bun run dev:s3)
├── bunfig.toml             # Test preload + the 100% coverage threshold
├── create/                 # `bun create blueshed/duckdown` scaffolder
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

Don't wrap signal updates in a bare `catch {}`: a render error inside `.set()` throws back to the caller, and an empty catch hides it.

## Running

```sh
bun install
bun run dev        # Development with HMR
bun run start      # Production
bun run stop       # Stop the server this folder's pid file names
bun run dev:s3     # Start MinIO + run with S3 storage
bun run test       # Run tests; fails below 100% line/function coverage
bun run check      # TypeScript check
```

The server writes its pid to `duckdown.pid` (`DUCKDOWN_PID` moves it; set it empty to turn it off) and removes it on exit. `bun run stop` (`server/stop.ts` → `stopServer()` in `pid.ts`) SIGTERMs it and waits for it to go; it signals only a process whose command line names `main.ts` (a stale file's number may since belong to something else), clears a stale pid file, and says what it did. That includes a server the desktop app's preview pane started. A second server started while the first is alive stops with a message rather than failing on the port. Tests give each server they spawn its own pid file.

## Storage

Swappable via env vars. Set `DUCKDOWN_BUCKET` to use S3, otherwise local filesystem.

```sh
# Local dev: edit a copy, never the seed — the first run copies DUCKDOWN_SEED
# to DUCKDOWN_PATH when that folder doesn't exist (delete it to start over)
DUCKDOWN_PATH=./.dev-site
DUCKDOWN_SEED=./tests/example

# S3 / MinIO
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

## Failures speak

Nothing fails silently. In the editor, every request goes through `api(what, url, init?, allow?)`: a failed one speaks — `speak()` in `edit/notice.ts` shows it (the `Notice` alert) and logs it — naming what was attempted ("Couldn't save hello.md: 500 …"); `allow` lists statuses the caller handles itself (New's 412). A request that never arrives resolves to `Response.error()`, so callers check `res.ok` and need no `catch`. `app.tsx` speaks for anything uncaught. On the server, `routes/error.ts` logs what a handler throws and answers 500 with a line (the detail only in development). No bare `catch {}`: if a failure is deliberately survived (a theme that won't load), log why.

## Pages: markdown and themes

`renderMarkdown(source, path)` in `markdown.ts` is Bun.markdown (GFM, heading ids and self-links, wiki links) plus three passes over its HTML: callouts (`> [!NOTE]` …), `<x-wikilink>` → `<a>`, and the contents list for `toc: true`. `path` is where the page lives, for relative wiki links: the site passes it, and so does the preview (`PUT /edit/mark/?path=`). Keep new syntax opt-in and readable as plain markdown.

When a content feature changes (syntax, front matter, themes, navigation, the editor), update the authoring skill — `.claude/skills/duckdown/` (`SKILL.md`, `reference.md`) — and the seed site's guide pages (`tests/example/pages/guide/`) with it: the skill is what a session writing a site's content reads.

A page's theme cascades (`loadThemeCss`): the root's `-theme.css`, then each folder's down to its own. The seed site's `static/site.css` draws everything from CSS variables; a theme sets variables on `body.<theme>`. Style new things through those variables so themes reach them.

What the site knows about itself lives in `nav.ts`: the nav, and each folder's `{{pages}}` listing. In production both are built once and dropped by `pagesChanged()` whenever the pages route writes or deletes, because every write goes through the server — a new write path to pages must call it too. With `DEBUG=1` they're built per request instead, so pages written straight to disk (by hand, or by a session using the authoring skill) show up at once.

Front matter takes only the keys duckdown reads (`KEYS` in `markdown.ts`) or an `x-` extension, unless the block is fenced with `---`, which takes anything: a page opening "Update: closed Monday" keeps its first line. Add a key there and in the skill's reference together.

`routes/site.ts` turns a page into a response: a folder is served by its `index.md` (`/blog`, `/blog/`, `/blog/index.html`), `draft: true` is 404 unless the reader is signed in, `layout:` picks the template, and the values it puts into the template are escaped.

Paths: storage keys are real names. The server decodes the URL path (`after()`); the editor builds URLs with `urlPath()` (each segment encoded). Never interpolate a name into a URL raw.

## Testing

`bun run test` must stay at 100% line and function coverage (`bunfig.toml` enforces it). How the suite gets there:

- **The server runs in the test process.** `tests/setup.ts` (preload) points it at a scratch copy of `tests/example` with its own pid file before any module reads `process.env`; `tests/helpers.ts` imports `server/main.ts` and exports `BASE`, `signIn()`, `authed()`. Code in a spawned subprocess is not counted, so subprocesses (`process.test.ts`) are only for what only a process shows.
- **The editor runs in happy-dom** against that server: `editor.test.tsx` routes relative fetches to `BASE` with the session cookie, mounts components with railroad's `mount()`, and stages failures with `intercept()`. The preload puts Bun's own `fetch`/`Response`/timers back after registering happy-dom — the server needs them.
- **S3** is tested through Bun's real `S3Client` against `tests/fake-s3.ts`; pass credentials explicitly (Bun reads its S3 env only at startup).
- Keep code testable rather than excluding it: parameters with production defaults (`storageAt(sub, s3)`, `seedLocalSite(seed, target, s3)`, `configLines(c)`), throw instead of `process.exit`, and export what a test must call.
- A line that no test can reach is dead: delete it, don't ignore it.
