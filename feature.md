# Duckie — Feature Checklist

Rewrite of Duckdown CMS: **Tornado + Vue** → **Bun + Railroad**

This is the feature map. Bugs and tasks live in `todo.jsonl`.

---

## Server (Bun)

### Core
- [x] Bun.serve() with route-based handler dispatch
- [x] Configuration from env vars (`DUCKDOWN_PATH`, `PORT`, `DEBUG`)
- [x] Path traversal protection (`safePath` validation)
- [x] MIME type detection for static file serving
- [x] HTML import for editor app (auto-bundled by Bun)
- [x] Pid file (`duckdown.pid`, `DUCKDOWN_PID`); refuses a second live server
- [x] Error handler: failures are logged and answered with a line the editor can show

### Editor API
- [x] `GET /edit` — serve Railroad editor app (Bun HTML import)
- [x] `GET /edit/styles.css` — editor stylesheet at a stable URL (the login page uses it)
- [x] `GET /edit/pages/*` — list folder or return file contents
- [x] `PUT /edit/pages/*` — save file (auto-create directories); `If-None-Match: *` creates only
- [x] `DELETE /edit/pages/*` — delete file
- [x] Earlier versions of every file the editor writes (`?versions`, `?version=`, `?deleted`, `POST ?restore=`), in `.history/`
- [x] `PUT /edit/mark/` — markdown-to-HTML preview (with front-matter parsing)

### Image API
- [x] `GET /edit/browse/*` — list image folder
- [x] `PUT /edit/browse/` — return image root path
- [x] `POST /edit/browse/*` — upload image files (FormData)

### Site Rendering
- [x] `fetch` fallback: render markdown pages as HTML
- [x] Front-matter metadata parsing (title, theme)
- [x] Site template loaded from storage (`templates/site.html`)
- [x] Theme CSS loading from `-theme.css` files, cascading: the root's, then each folder's
- [x] Navigation generation from `index.md` files (cached; dropped when the editor changes a page)
- [x] The nav marks the current page, or the section it's in (`aria-current`)
- [x] Default stylesheet built on CSS variables (a theme is a few lines), with dark mode
- [x] Per-page `layout`, `description` and `draft`
- [x] A card for a shared link: Open Graph title, type, address, and `image:` (an item's own picture), from `{{description}}`
- [x] Folder listings (`{{pages}}`, newest first by `date:`)
- [x] Folders served by their index (`/blog`, `/blog/`, `/blog/index.html`)
- [x] "Edit this page" for whoever is signed in (`{{edit}}`)
- [x] Feeds: `feed: true` on a folder's index gives it an Atom `feed.xml` of its dated pages; `{{feed}}` links it
- [ ] Custom scripts via `x-script-*` metadata
- [x] `GET /static/*` — serve site static files

### Markdown
- [x] GFM (GitHub Flavored Markdown) via `Bun.markdown`
- [x] Tables, fenced code blocks
- [x] Task lists
- [x] Strikethrough, autolinks
- [x] Heading ids; headings link to themselves
- [x] Table of contents generation (`toc: true`)
- [x] Callouts (GitHub's `> [!NOTE]` … `[!CAUTION]`)
- [x] `[[Wiki links]]` between pages (`[[page|label]]`, `[[page#heading]]`)
- [ ] Maths and highlighted code: not built in — add KaTeX or highlight.js to your template (todo 27)
- [ ] Emoji support (twemoji)

### Collections
- [x] `collection.json`: the data — declared `fields`, `images`, `labels`, groups of items
- [x] An each: page (`each: true`) is the page every item gets, at `/<folder>/<slug>/`
- [x] Overviews: `{{items}}`, `by=<field>`, `sort=asc|desc`, `template=<name>`, `{{groups}}`; `collection:` names the collection
- [x] Clean slugs; a miss is a 404, never a nearest match
- [x] `aliases` on items and pages: a 301, and a redirect page in the export
- [x] Items in search, the sitemap and the export
- [x] Pictures outside the site (a bucket, a CDN), thumbnails named by a rule
- [x] Editor: start one, edit its fields as works, upload pictures with thumbnails, renaming keeps the old address
- [x] The 0.4 shape removed (0.8): `layout` in the data is a problem, and a file with no `fields` is `src`/`title`/`caption`

### Auth
- [x] Login page (`GET/POST /login`) — HTML file + HTMLRewriter
- [x] Signing in lands in the editor (`/edit`), or on `next`
- [x] Logout (`POST /logout`, refused cross-site)
- [x] JWT (HS256) cookie sessions (`COOKIE_SECRET`, `COOKIE_NAME` env vars)
- [x] `users.json` credential store
- [x] Protected editor routes (page loads redirect to `/login?next=...`; fetches get 401)
- [x] Password hashing (`Bun.password`, argon2id), in place of the Python `cryptography` encryption

### Storage
- [x] Local filesystem backend
- [x] S3 backend (Bun.S3Client — built-in)
- [x] Storage abstraction (swappable backends)
- [ ] Separate image bucket support
- [ ] Subdirectory isolation per user

### Dev Experience
- [x] `development: true` — HMR via Bun HTML imports
- [x] `bun run --hot server.ts` for server hot-reload
- [x] `bun run stop` — stop the server the pid file names (checked to be duckdown's)
- [x] `.env` file for local config
- [x] `.env.s3` for MinIO/S3 config
- [x] `compose.yml` for MinIO with auto-seeded bucket
- [x] Self-contained `tests/example/` seed data
- [x] Dev works on a copy: `DUCKDOWN_SEED` seeds `DUCKDOWN_PATH` (`.dev-site/`) on first run
- [x] `.claude/launch.json` for the desktop app's preview pane

---

## Client (Railroad)

### App Shell
- [x] 3-column layout: file browser | editor | preview
- [x] URL parameter support (`?path=file.md`)
- [x] Lucide icons throughout (`lucide-static` via `<Icon />`)
- [x] Signed out: any request's 401 sends the page to `/login?next=...` and back (`api.ts`)
- [ ] Loading spinner states

### File Browser (Browser)
- [x] List folders and files with icons
- [x] Breadcrumb-style path display
- [x] Click folder → load folder contents
- [x] Click file → load file into editor
- [x] Sorted alphabetically
- [x] New page/folder/theme (dialog + auto-open; never overwrites an existing file)
- [x] Reloads after save/delete

### Editor
- [x] Textarea editor
- [x] Save button with saved flash (green)
- [x] Dirty indicator (unsaved changes)
- [x] Delete button with inline confirmation
- [x] Rename or move a page; its old address becomes an alias, its versions go with it
- [x] Earlier versions (restore any) and Deleted (bring one back)
- [x] Undo / redo in the collection pane (⌘Z, ⇧⌘Z)
- [x] Keyboard shortcut for save (⌘⏎)
- [ ] Code editor with syntax highlighting

### Markdown Preview
- [x] Live preview of rendered markdown
- [x] Debounced updates on editor input
- [x] Calls `/edit/mark/` API for server-side rendering
- [x] Renders on initial file load
- [x] Names the links on the page that lead nowhere a reader can go, and clears once they're fixed
- [x] Sandboxed (`allow-same-origin`, no scripts) with site CSS, theme CSS and images

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
- [x] Thumbnails (`Bun.Image`, `?thumb=`)

### Menu (Header)
- [x] Images toggle (show/hide image browser sidebar)
- [x] View button (open rendered page in new tab)
- [x] Logout button (a POST form)
- [ ] Help link (markdown cheat sheet)

### State Management
- [x] Signals and actions (`store.ts`)
- [x] File/folder list state
- [x] Current file path and content
- [x] Editor content (live)
- [x] Image browser state
- [x] Error state: failures speak (`notice.ts`, shown by `Notice`)
- [ ] Loading states

---

## Tooling & Infrastructure

### Build
- [x] tsconfig.json for Railroad's JSX (`createElement` / `Fragment`)
- [x] `package.json` scripts: `dev`, `dev:s3`, `start`, `stop`, `test`, `check`
- [ ] Production build (`bun build --target=bun`)

### Testing
- [x] Server route tests (file CRUD, markdown, images, static, site rendering)
- [x] Path traversal prevention tests
- [x] Markdown unit tests (front-matter, rendering)
- [x] Tests run the server in-process on a scratch copy of the seed site (subprocesses only for process behaviour)
- [x] Auth flow tests (login, logout, protected routes: 401 vs redirect)
- [x] Pid file and dev seed tests
- [x] 100% line and function coverage, enforced by `bun run test` (server in-process)
- [x] Editor tests in happy-dom, against the real server
- [x] S3 storage tests (Bun's S3 client against an in-memory fake S3)
- [ ] S3 integration tests (MinIO via compose)

### CLI
- [x] `bun create blueshed/duckdown` — clone + postinstall setup
- [ ] `duckie publish` — deploy to S3

---

## Not Porting (intentional omissions)
- Tornado-specific code (IOLoop, async decorators)
- Vuex / Vue reactivity system (replaced by Railroad signals)
- CodeJar (evaluate alternatives that suit Railroad)
- invoke tasks (replaced by bun scripts / package.json)
- Python packaging (setup.py, PyPI release)
- Vite (replaced by Bun HTML imports)
- marked/markdown-it (replaced by Bun.markdown)
- boto3 (replaced by Bun.S3Client)
