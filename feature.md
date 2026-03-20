# Duckie — Feature Checklist

Rewrite of Duckdown CMS: **Tornado + Vue** → **Bun + Crank.js**

---

## Server (Bun)

### Core
- [x] Bun.serve() with route-based handler dispatch
- [x] Configuration from env vars (`DUCKDOWN_PATH`, `PORT`, `DEBUG`)
- [x] Path traversal protection (`safePath` validation)
- [x] MIME type detection for static file serving
- [x] HTML import for editor app (auto-bundled by Bun)

### Editor API
- [x] `GET /edit` — serve Crank.js editor app (Bun HTML import)
- [x] `GET /edit/pages/*` — list folder or return file contents
- [x] `PUT /edit/pages/*` — save file (auto-create directories)
- [x] `DELETE /edit/pages/*` — delete file
- [x] `PUT /edit/mark/` — markdown-to-HTML preview (with front-matter parsing)

### Image API
- [x] `GET /edit/browse/*` — list image folder
- [x] `PUT /edit/browse/` — return image root path
- [x] `POST /edit/browse/*` — upload image files (FormData)

### Site Rendering
- [x] `fetch` fallback: render markdown pages as HTML
- [x] Front-matter metadata parsing (title, theme)
- [x] Site template loaded from storage (`templates/site.html`)
- [x] Theme CSS loading from `-theme.css` files
- [x] Navigation generation from `index.md` files
- [ ] Custom scripts via `x-script-*` metadata
- [x] `GET /static/*` — serve site static files

### Markdown
- [x] GFM (GitHub Flavored Markdown) via `Bun.markdown`
- [x] Tables, fenced code blocks
- [x] Task lists
- [x] Strikethrough, autolinks
- [ ] Emoji support (twemoji)
- [ ] Table of contents generation

### Auth
- [x] Login page (`GET/POST /login`) — HTML file + HTMLRewriter
- [x] Logout (`GET /logout`)
- [x] JWT (HS256) cookie sessions (`COOKIE_SECRET`, `COOKIE_NAME` env vars)
- [x] `users.json` credential store
- [x] Protected editor routes (redirect to `/login?next=...`)
- [ ] Password encryption (port from Python `cryptography`)

### Storage
- [x] Local filesystem backend
- [x] S3 backend (Bun.S3Client — built-in)
- [x] Storage abstraction (swappable backends)
- [ ] Separate image bucket support
- [ ] Subdirectory isolation per user

### Dev Experience
- [x] `development: true` — HMR via Bun HTML imports
- [x] `bun run --hot server.ts` for server hot-reload
- [x] `.env` file for local config
- [x] `.env.s3` for MinIO/S3 config
- [x] `compose.yml` for MinIO with auto-seeded bucket
- [x] Self-contained `tests/example/` seed data

---

## Client (Crank.js)

### App Shell
- [x] 3-column layout: file browser | editor | preview
- [x] URL parameter support (`?path=file.md`)
- [x] Feather icons throughout (via `feather.replace()`)
- [ ] Loading spinner states

### File Browser (Browser)
- [x] List folders and files with icons
- [x] Breadcrumb-style path display
- [x] Click folder → load folder contents
- [x] Click file → load file into editor
- [x] Sorted alphabetically
- [x] New file creation (prompt + auto-open)
- [x] Reloads after save/delete

### Editor
- [x] Textarea editor
- [x] Save button with saved flash (green)
- [x] Dirty indicator (unsaved changes)
- [x] Delete button with inline confirmation
- [x] Keyboard shortcut for save (⌘⏎)
- [ ] Code editor with syntax highlighting

### Markdown Preview
- [x] Live preview of rendered markdown
- [x] Debounced updates on editor input
- [x] Calls `/edit/mark/` API for server-side rendering
- [x] Renders on initial file load

### CSS Preview
- [x] Detect `.css` file extension
- [x] Render CSS in iframe with sample HTML
- [x] Live updates on editor input

### Image Browser
- [x] Sidebar overlay panel (toggle from header)
- [x] Browse image folders with navigation
- [x] Upload single/multiple image files
- [x] Create new image folder
- [x] Preview selected image
- [x] Copy markdown image syntax to clipboard

### Menu (Header)
- [x] Images toggle (show/hide image browser sidebar)
- [x] View button (open rendered page in new tab)
- [x] Logout link
- [ ] Help link (markdown cheat sheet)

### State Management
- [x] Event-based state (CustomEvents through Crank.js context)
- [x] File/folder list state
- [x] Current file path and content
- [x] Editor content (live)
- [x] Image browser state
- [ ] Error state
- [ ] Loading states

---

## Tooling & Infrastructure

### Build
- [x] tsconfig.json for Crank.js JSX transform
- [x] `package.json` scripts: `dev`, `dev:s3`, `start`, `test`, `check`
- [ ] Production build (`bun build --target=bun`)

### Testing
- [x] Server route tests (file CRUD, markdown, images, static, site rendering)
- [x] Path traversal prevention tests
- [x] Markdown unit tests (front-matter, rendering)
- [x] Tests spawn own server subprocess with temp data
- [x] Auth flow tests (login, logout, protected routes)
- [ ] S3 integration tests (MinIO via compose)

### CLI
- [x] `bun create blueshed/duckdown` — clone + postinstall setup
- [ ] `duckie publish` — deploy to S3

---

## Not Porting (intentional omissions)
- Tornado-specific code (IOLoop, async decorators)
- Vuex / Vue reactivity system (replaced by Crank.js generators)
- CodeJar (evaluate Crank.js-friendly alternatives)
- invoke tasks (replaced by bun scripts / package.json)
- Python packaging (setup.py, PyPI release)
- Vite (replaced by Bun HTML imports)
- marked/markdown-it (replaced by Bun.markdown)
- boto3 (replaced by Bun.S3Client)
