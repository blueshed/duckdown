# Duckdown

A markdown CMS built with **Bun 1.3.11** (server) and **Railroad** (UI).

## Architecture

`server/main.ts` is **resources and routes** — nothing else. Import your resources (HTML, handlers), wire them to routes. Each handler lives in its own module. You read `main.ts` and immediately know every URL the app handles and where to find the code.

```ts
// server/main.ts — resources and routes, nothing else
import homepage from "./edit/index.html";

Bun.serve({
  routes: {
    "/edit":          homepage,
    "/login":         { GET: handleLoginGet, POST: handleLoginPost },
    "/logout":        handleLogout,
    "/edit/pages/*":  handlePages,
    "/edit/mark/":    handleMark,
    "/edit/browse/*": handleBrowse,
    "/static/*":      handleStatic,
  },
  fetch: handleSite,
});
```

Adding a new route: one import, one line. The route file is self-contained.

## Project Structure

```
duckdown/
├── server/
│   ├── main.ts            # Entry point — resources and routes
│   ├── config.ts           # Env vars (DUCKDOWN_PATH, PORT, DEBUG, etc.)
│   ├── storage.ts          # Storage abstraction (local filesystem / S3)
│   ├── auth.ts             # JWT auth, login/logout handlers
│   ├── markdown.ts         # Front-matter parser + Bun.markdown
│   ├── utils.ts            # Shared helpers (wildcard path extraction)
│   ├── routes/
│   │   ├── pages.ts        # /edit/pages/* — file CRUD
│   │   ├── mark.ts         # /edit/mark/  — markdown preview
│   │   ├── browse.ts       # /edit/browse/* — image browser + upload
│   │   ├── static.ts       # /static/* — site static files
│   │   └── site.ts         # fetch fallback — render markdown pages
│   └── edit/               # Editor client (served at /edit)
│       ├── index.html      # Entry HTML (Bun auto-bundles .tsx + .css)
│       ├── app.tsx          # Railroad app root
│       ├── store.ts         # Signals + actions (shared state)
│       ├── styles.css       # Editor styles (light/dark theme-aware)
│       ├── login.html       # Login page (transformed via HTMLRewriter)
│       └── components/
│           ├── Browser.tsx   # File/folder navigator
│           ├── Editor.tsx    # Textarea editor with save/delete
│           ├── Preview.tsx   # Live markdown preview
│           ├── CssPreview.tsx # CSS preview in iframe
│           ├── Header.tsx    # Top bar (view site, images, logout)
│           ├── ImageBrowser.tsx # Sidebar image browser + upload
│           ├── NewDialog.tsx    # New file/folder/theme dialog
│           ├── ConfirmDialog.tsx # Confirm action dialog
│           └── Icon.tsx      # Feather icons wrapper
├── tests/
│   ├── example/            # Seed site data (pages, static, templates)
│   ├── server.test.ts      # Integration tests (spawns server subprocess)
│   ├── markdown.test.ts    # Unit tests (front-matter, rendering)
│   └── compose.yml         # MinIO for S3 testing
├── create/                 # `bun create blueshed/duckdown` scaffolder
├── package.json
├── tsconfig.json
├── .env                    # Local dev config
├── .env.s3                 # MinIO/S3 config
├── feature.md              # Feature checklist
└── CLAUDE.md
```

## Stack

- **Runtime/Server:** Bun 1.3.11 (`Bun.serve()`)
- **UI Framework:** Railroad (`@blueshed/railroad`) — signals, JSX, routes
- **Bundling:** Bun's built-in HTML imports (no Vite, no Webpack)
- **Markdown:** `Bun.markdown` (built-in GFM renderer)
- **Storage:** Local filesystem or `Bun.S3Client` (built-in, swappable via env)
- **Auth:** JWT (HS256) via `crypto.subtle`, cookie-based
- **Icons:** Feather icons (`icon.toSvg()` via `<Icon name="..." />` component)
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

**Wildcard note (Bun 1.3.11):** `req.params["*"]` is empty. Parse the URL instead:

```ts
function after(req: BunRequest, prefix: string): string {
  return new URL(req.url).pathname.slice(prefix.length);
}
```

## Railroad

Package: `@blueshed/railroad`. Signals + JSX + routes — real DOM, no virtual DOM.

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
import { createElement, signal, effect, when, list, text } from "@blueshed/railroad";

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
- **`list(sig, keyFn, render)`** — keyed list rendering with DOM diffing
- **`text(fn)`** — reactive computed text node for expressions
- **`batch(fn)`** — group updates into a single flush

## Running

```sh
bun install
bun run dev        # Development with HMR
bun run start      # Production
bun run dev:s3     # Start MinIO + run with S3 storage
bun run test       # Run tests
bun run check      # TypeScript check
```

## Storage

Swappable via env vars. Set `DUCKDOWN_BUCKET` to use S3, otherwise local filesystem.

```sh
# Local (default)
DUCKDOWN_PATH=./tests/example

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

Users stored in `users.json` in the content directory.
