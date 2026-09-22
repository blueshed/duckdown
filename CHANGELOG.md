# Changelog

## 0.3.0 — 2026-09-22

- A URL with a malformed escape is a 400, not a 500 with a stack.

- **The base (`site.css`, `search.js`) is no longer copied into a site.** It
  lives in `server/base/`; a site with no file of that name is served and
  exported duckdown's own, and the seed carries no copy either.
- Static files and signed-out pages carry an ETag and answer 304.

- **A site's own 404 page, and the root files crawlers ask for.** `pages/404.md`
  answers a miss (served and exported as `404.html`); `robots.txt` and
  `favicon.ico` in `static/` answer at the root. The seed's `robots.txt` used to
  ban every crawler.
- A content folder that goes missing is said once in the log, not silently
  404ed forever.

- **The export checks its work.** An export of no pages fails and leaves
  `dist/` alone, naming the folder it read; internal links that lead nowhere
  are reported, and `--strict` or `DUCKDOWN_STRICT=1` fails the build on them.
  `robots.txt`, `favicon.ico` and `sitemap.xml` are written at the root of
  `dist/` too (`sitemap.xml` needs `DUCKDOWN_ORIGIN`, for absolute addresses).

- **`duckdown-serve`.** The published flavour's server moves into duckdown
  (`server/serve.ts`), tested, and logging page views only, not stylesheets
  and images. Published start command:
  `bun run node_modules/duckdown/server/serve.ts` (`SITE_DIR`, `PORT`).

- **Templates can read a page's `x-` keys** (`{{x-cover}}`), escaped, empty
  when the page doesn't set them, filled before `{{content}}` so a page's own
  text is never scanned for them.
- **`{{sitemap}}`**: every page, nested by folder, for a page a reader can read
  (the seed has `pages/sitemap.md`, linked from its 404 page).

- **Search finds the place, not just the page.** `/search.json` (and
  `dist/search.json`) now has one entry per page *and per section*, cut at
  each heading: `url` ends `#id`, and each entry has a `section`. `search.js`
  shows "Page – Section", at most three sections of a page, and links with a
  text fragment so the browser scrolls to and marks the words. A forked, older
  `search.js` still works against the new index: it ignores `section`, and its
  links now carry the `#id`.
- `search.js` also scrolls to the heading itself on load when the browser
  didn't honour the text fragment (some give up on the id too, when they can't
  find the words); the result list scrolls inside its panel instead of growing
  the page. Words now match where they start (`train` is not in `constraints`).

- **Two ways in, one scaffold.** `bun add github:blueshed/duckdown#<tag>` then
  `bunx duckdown init` (new), or `bun create` as before, both through
  `scaffold()`. `init` never overwrites and says what it skipped. `bun create`
  now keeps `server/` and the test suite, since the code is the owner's - there
  is no upgrade path from it; fork on GitHub for that.


- **`{{include name}}`** pulls `templates/name.html` into a template, resolved
  once before the rest — an include can use `{{nav}}` and a page's `{{x-...}}`
  keys, and an include inside an include is left as written. The seed's
  `templates/site.html` uses it for its top bar (`templates/topbar.html`),
  instead of pasting the nav and the search form into every template.

- **`order:` places a folder in the navigation.** A folder's name used to be
  the only way to order it — the URL carrying the ordering, so reordering meant
  renaming and breaking every link. A whole number on a folder's `index.md`
  now puts it among its siblings, lowest first; a folder without one sorts
  after every numbered one, alphabetically, so a site that has never used it
  sees no change. `{{sitemap}}` follows the same order.

## 0.2.0 — 2026-09-21

### Search, in the browser

`/search.json` on a served site, `dist/search.json` on a published one: one
entry per readable page — url, title, description, and the page's words with
the markdown taken out. The browser fetches it once and does the matching, so
there is no search service, no index format and no dependency. A few dozen
pages is a few dozen kilobytes; the seed site's whole index is 12KB.

Drafts are left out — a search result that 404s is worse than no result, and a
test asserts every entry's url answers 200. It is a magnifier in the navigation
row until you press it, because a search box is chrome on a page nobody came to
search. The seed ships `static/search.js` and the button in `templates/site.html`: ordinary site code, in `static/`, editable
in the editor like any other stylesheet or template. Sites that want search
copy those two; duckdown's job ends at handing over the index.

## 0.1.0 — 2026-09-21

Three ways to style a page became two that don't overlap, and duckdown became
something you can publish as well as run. Most of it is removal.


### `bun run export` — the whole site as files

```sh
DUCKDOWN_ORIGIN=https://example.com bun run export        # into ./dist
```

A site that isn't edited in the browser doesn't need a server behind it. The
export is rendered by the same `pageHtml()` the site route uses, so a page
comes out as the page — its template, its navigation, its `{{pages}}` listing,
its stylesheets — written at its one canonical address. Drafts are left out
rather than hidden behind a login, `{{edit}}` is empty, and `{{url}}` takes its
origin from `DUCKDOWN_ORIGIN` because there's no request to read one from.

It reads through the storage layer, so it will export a folder on disk or a
live bucket, whichever the environment points at.

What a static deployment then doesn't need: `COOKIE_SECRET`,
`DUCKDOWN_ADMIN_PASSWORD`, `users.json`, S3 credentials, or a bucket.

### Styling is templates and stylesheets

`-theme.css` is gone, and with it the last thing about styling a duckdown site
that had to be learned rather than guessed. A magic filename, in a magic place,
with cascade semantics you couldn't see from the file itself — and in practice
it was only ever a site's stylesheet wearing a costume. On blueshed.co.uk it
was 5KB of `header.site`, `h1`, `p.standfirst` inlined into every page's HTML,
uncacheable, because living in `pages/` left duckdown nowhere to link it from.

What replaces it is what people expect, and all of it already existed:

- **the site** — `static/theme.css`, linked by `templates/site.html` after
  `static/site.css`. Cached once instead of re-sent with every page.
- **one page** — `css: poster` in its front matter, unchanged.
- **a kind of page** — `layout: post`, and that template links what it needs.

`{{theme_css}}` is now `{{css}}` and emits only the page's `css:` link, since
there is no cascade left to inline. `loadThemeCss` is gone.

**Upgrading**, in your content folder:

- **Move each `-theme.css` into `static/`** — the root one as `theme.css`; any
  in subfolders become either part of it, or their own stylesheet named by the
  template of the pages that want it.
- **Link it from the template**: `<link href="/static/theme.css" rel="stylesheet">`
  after `site.css`.
- **Replace `{{theme_css}}` with `{{css}}`.** Left as it is, it publishes the
  literal text.

### `theme:` is gone — styling follows the folder

A `-theme.css` already reached every page in its folder and everything under
it. `theme:` then made each page *also* name the theme, and the CSS nest under
`body.<name>`, before any of it applied. Both real duckdown sites had exactly
one theme and put the same line on every page, so the class matched everything
and selected nothing — while a page that forgot the line silently lost its
folder's styling, with nothing to say why.

So the key, the `{{theme}}` placeholder and the body class are all removed. A
`-theme.css` styles its folder and everything under it, full stop.

**Upgrading**, two mechanical steps in your content folder:

- **Delete the `theme:` line** from every page's front matter. Left in, it is
  no longer a key duckdown reads, so the block ends there and the line shows up
  in the page — unless the block is fenced with `---`, which takes anything.
- **Unwrap your `-theme.css`**: `body.mytheme { --accent: … }` becomes
  `:root { --accent: … }`, and rules like `body.mytheme h1 { … }` become
  `h1 { … }`. They only reach that folder's pages either way, because only
  those pages are served the file.
- **`<body class="{{theme}}">` in a template** becomes `<body>`. Left in, it
  publishes the literal text.

For one page that has to look different, `css:` is unchanged: it links
`/static/<name>.css` after the cascade, so it can override the same variables.

## 0.0.2

### Upgrading an existing site

Your content folder is yours, so duckdown never rewrites it. Three things there may need a hand:

- **`users.json` must be regenerated** — plaintext passwords no longer authenticate. `bun -e 'console.log(await Bun.password.hash("their-password"))'`.
- **`templates/site.html` gains two placeholders.** Add `{{description}}` in the `<head>` and `{{edit}}` in the `<body>` to get meta descriptions and the "Edit this page" link; without them a page renders exactly as before.
- **Front matter keys are now checked.** A plain block may use duckdown's own keys or an `x-…` of your own; fence the block with `---` for anything else. A page that opened with an invented key (`author: pete`) will now show that line as text.

New sites get all of this already.

### Deploying

- **An admin from the environment.** `DUCKDOWN_ADMIN_PASSWORD` (with `DUCKDOWN_ADMIN_USER`, default `admin`) is written into `users.json` at startup. A site seeded from the example — or from `bun create` — would otherwise carry that seed's `admin`/`admin` onto the internet at a known URL. The secret lives in the platform rather than in git, changing the variable changes the password on the next restart, and an unchanged one isn't rewritten (on S3 that would be a PUT). Unset, nothing happens, which is every local run.
- **A new site says so when `bun create` didn't finish.** Bun 1.4.2 prints a `bun-create.postinstall` command and never runs it — any command, not just ours — so a scaffolded copy could arrive with no `site/`, no `.env`, and duckdown's own `tests/` still in place. It then refused to start over a missing `COOKIE_SECRET`, which says nothing about the real cause. `server/scaffold.ts` recognises that state (bun strips the `bun-create` key, so its absence, no `site/` and a present `create/setup.ts` is the signature) and the error now carries the explanation and the one command that fixes it: `bun run setup`. Deliberately not run automatically — setup removes `tests/` and `create/`, and doing that silently because someone typed `bun dev` would be worse than the bug.
- **A bucket seeds itself.** `DUCKDOWN_SEED` filled a local content folder on first run but never a bucket, so a fresh S3 deployment came up with no pages, no template and no `users.json` — 404s, nobody able to sign in, and nothing in the log to say why. `seedBucketSite()` now uploads the seed when the bucket holds no `pages/index.md`, guarded like the local path so it can never overwrite a site someone has been writing.
- **A view log that counts without identifying.** `DUCKDOWN_LOG=1` prints a line per page view — path, status, how long it took, the referring *host* when it is another site, and whether the agent looked like a crawler. No address, no user agent, no cookie, no session, nothing joinable: enough to see what is read and roughly how much, and nothing that says who read it. A same-site referrer is dropped (the paths already show that), and only a referrer's host is kept, because a search referrer carries what was typed into it. Off unless asked for.
- **`GET /health`** — a static `OK`, so a platform's healthcheck proves the process is listening without reading storage, and a content mistake never reads as a dead service.
- **The pid file can't strand a container.** `claimPidFile()` refused to start whenever the pid file named a *live* process. In a container the app is a low pid, and on a mounted volume the file outlives a hard kill: "pid 1 is alive" is always true, so a hard restart could refuse to start for good — a crash loop with no bad input. It now refuses only a live *duckdown*, using the `ps` check `bun run stop` already had. (`DUCKDOWN_PID=` still turns the file off entirely, which is the right setting on an ephemeral filesystem.)

- **The editor reaches the whole site, not just its pages.** `templates/site.html` decides what every page is wrapped in and `static/site.css` decides how it looks; both were editable only from a terminal, which on a bucket-backed deployment meant not at all. The browser now has **pages · templates · static**, each its own route rooted in its own folder — so nothing can reach across them, and `users.json` (password hashes, at the site root) is in none of them and stays out of the editor. Switching section puts down whatever was open, so a file can't be saved into the wrong folder, and a template gets no preview rather than having its placeholders run through the markdown renderer.
- **The seed demonstrates all three overrides.** `theme:` was the only one with a worked example; `layout:` and `css:` had tests and no users. The seed blog now has a post wrapped in `templates/post.html` and a poster page that links `/static/poster.css` — centred title, tinted page, larger type, and nothing else on the site touched. The Writing Pages guide has a table of the three with a link to each example.
- **A worked example of `layout:`, and `{{date}}` for it to use.** The feature had no user: not one page in any site said `layout:`. The seed now ships `templates/post.html` and a dated post that uses it — no site navigation, a way back to the blog, the date at the foot — beside a blog index that lists itself with `{{pages}}`. A template can now ask for `{{date}}`, which writes the page's `date:` as a `<time>` the way the listings do (one formatter, `dateHtml()`, for both). Gone with it: `templates/site_tmpl.html`, a Tornado template left over from the Python duckdown, which nothing referenced and which would have rendered its own `{% end %}` tags as text if anything had.
- **One page, one address.** `/blog`, `/blog/` and `/blog/index.html` all reach the same page, and each used to declare *itself* canonical — the same page offered to a search engine three times. `canonicalPath()` is now the single rule (`index.md` is `/`, a folder's index is `/folder/`, anything else is `/page.html`), computed from what the request resolved to rather than what was asked for. The navigation links to those addresses too, so the links a crawler follows are the canonical ones.
- **`css:` gives one page its own stylesheet.** `css: print` links `/static/print.css` after the theme cascade, so a single page can look however it likes without needing a `layout:` of its own. The name is guarded like `layout`, so a page can't reach out of `static/`.

### Security

- **Passwords are hashed.** `users.json` now stores `Bun.password.hash()` output instead of plaintext; login verifies via `Bun.password.verify()`. **Breaking:** existing `users.json` files must be regenerated — plaintext entries will no longer authenticate.
- **`COOKIE_SECRET` is required in production.** The server now throws at startup if `COOKIE_SECRET` is unset and `DEBUG` is not `1`, instead of silently signing tokens with a secret published in this repo. Local dev keeps working via a default (with a console warning) when `DEBUG=1`.
- **Closed an open redirect in `/login` and `/logout`.** The `next` query/form parameter is now validated to be a same-origin path (`safeNext()` in `server/auth.ts`) before being used in a redirect, rejecting absolute and protocol-relative URLs.
- **Sandboxed the markdown/CSS preview iframes.** `Preview.tsx` and `CssPreview.tsx` now render with `sandbox="allow-same-origin"` and no `allow-scripts`, so script in unsanitized preview content (from `Bun.markdown` HTML passthrough) never runs, and so can't reach the parent editor window. The frames keep the editor's origin, so the site CSS, a folder's `-theme.css` (behind the session cookie) and images still load. (`allow-scripts` alone, tried first, gave the frame a null origin and every stylesheet and image in both previews failed to load; the two flags together would let the frame lift its own sandbox.)
- **Signed-out editor requests get a 401, not a redirect.** `requireAuth()` redirects page loads (`Accept: text/html`) to `/login?next=…` as before, but answers fetches with 401. The editor sends every request through the new `server/edit/api.ts`, which turns a 401 into a trip to the login page and back to where you were (`next` keeps `?path=`). Previously a signed-out `/edit` quietly showed an empty editor: its fetches were redirected to the login page's HTML and the parse error was swallowed.
- **Logout is a POST, and only from this site.** `/logout` answers POST only (the header's Logout is now a small form), so an `<img src="/logout">` in a page can no longer sign editors out, and a request labelled `Sec-Fetch-Site: cross-site` is refused (403).
- **Closed a path-traversal gap for sibling folders.** `safePath()` compared with a bare `startsWith`, so a key like `../pages-old/x.md` passed for the root `…/pages`. It now requires the root or the root plus a separator.
- **A mangled session cookie no longer causes a 500.** A three-part cookie that wasn't base64 made `atob` throw inside `verifyJwt`, failing every request that carried it; it now counts as signed out.

### Added

- **Failures speak.** Nothing in the editor fails silently any more. `server/edit/notice.ts` holds one message, shown by the new `Notice` component (an alert at the foot of the screen until dismissed) and logged. `api()` speaks for every failed request, naming what was being attempted ("Couldn't save hello.md: 500 …"), resolves a network failure to `Response.error()` so callers only check `res.ok`, and `apiJson()` does the same for JSON answers. `app.tsx` gives uncaught errors and rejections a voice too. On the server, a new `error` handler (`routes/error.ts`) logs what a handler threw and answers 500 with a line to show (the detail in development only); a broken `users.json` makes the login page say so, a missing one is logged as "nobody can sign in", and a theme that can't be loaded is logged while the page renders without it.
- **Writing: linkable headings, contents lists, callouts and wiki links.** Headings get ids and link to themselves (Bun.markdown's `headings: { ids, autolink }`); `toc: true` puts a contents list of the h2s and h3s under the page's title; GitHub's `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` and `[!CAUTION]` become titled callouts; `[[page]]`, `[[page|label]]`, `[[page#heading]]` and `[[#heading]]` link between pages, resolved like relative links with `.html` added. All opt-in; elsewhere they read as plain markdown. The Writing Pages guide shows each one.
- **A new default stylesheet, built on CSS variables.** `static/site.css` draws everything from a dozen variables (colours, fonts, text width, corner radius, the five callout tones), follows the reader's dark mode, and styles code, tables, callouts, the contents list and the nav. A theme sets variables on `body.<theme>`: the duckdown theme is now four lines. New sites (`bun create`) get the same stylesheet. The Themes guide lists the variables.
- **Themes cascade.** A page gets the root's `-theme.css`, then each folder's down to its own; before, only its own folder's, so `guide/` pages never saw the root theme. The preview gets the same cascade from the server.
- **The logo takes the page's colour.** The seed site's duck is placed as a CSS mask (`#logo`, `background: var(--duck, currentColor)`) instead of an `<img>`, so a theme colours it (`--duck: var(--accent)`) and it follows dark mode; its eye and wing are holes, so they still show the page through. `logo.svg` is drawn in `var(--duck, currentColor)` and, shown as an image, follows the reader's light or dark setting through a `<style>` of its own. The Images guide has the recipe, including why `<use href="file.svg#id">` isn't the answer (Firefox only) and that an XML comment containing `--` makes an SVG render as nothing.
- **Folders are served by their index:** `/blog`, `/blog/` and `/blog/index.html` all reach `pages/blog/index.md`; a page of the same name still wins.
- **Per-page settings.** `layout: post` wraps a page in `templates/post.html` (falling back to `site.html`; the name must be a plain word, so a page can't reach out of `templates/`), `description:` fills `{{description}}` with a meta description and `og:description`, and `draft: true` keeps a page off the site, the nav and listings — while whoever is signed in to the editor can still read it in place.
- **`{{pages}}` lists a folder**: the pages beside it, newest first by `date:`, each with its `description:`. A blog index now keeps itself. Listings are cached like the nav and rebuilt on the same writes.
- **"Edit this page"**, via a new `{{edit}}` placeholder, shown only to whoever is signed in — the one thing the Tornado version had that the rewrite had lost.
- **The nav marks where you are:** `aria-current="page"` on the page's own link, else `aria-current="true"` on its section's (never the root's), and the stylesheet underlines it.
- **100% test coverage, enforced.** `bun run test` is `bun test --coverage`, and `bunfig.toml` sets a 1.0 threshold for lines and functions, so the suite fails if any line of the app goes untested. The server now runs inside the test process (a preload, `tests/setup.ts`, sets the environment first), so its code counts; the editor's code runs in happy-dom (`@happy-dom/global-registrator`, a new dev dependency) against that same server; `S3Storage` is tested through Bun's real S3 client against an in-memory fake S3 (`tests/fake-s3.ts`); and a few real subprocesses check the pid lock and dev seeding end to end. 162 tests across 7 files.

- **Pid file.** The server writes its pid to `duckdown.pid` at startup and removes it on exit, SIGINT or SIGTERM; `DUCKDOWN_PID` moves it, and an empty value turns it off. A second server started while the pid file names a live process stops with a message instead of failing on the port.
- **`bun run stop`** stops the server the pid file names: it sends SIGTERM and waits for the server to go (the server removes its own pid file). It only signals a process whose command line names `main.ts`, since a stale pid file's number may have been reused by something unrelated. It clears a stale file away, and it says what it did (exit 0 once nothing is running, 1 if it had to leave something running). The cleanup registers once per process, since `bun --hot` re-runs modules on every reload.
- **Dev works on a copy of the seed site.** With `DUCKDOWN_SEED` set, a first run copies it to `DUCKDOWN_PATH` when that folder doesn't exist. The local `.env` now points at `./.dev-site` (gitignored) seeded from `./tests/example`, so editing in dev or the preview pane no longer changes the tracked seed the tests copy.
- `GET /edit/styles.css` serves the editor stylesheet at a stable URL (a `Bun.file` route), for the login page.
- `.claude/launch.json`, so the desktop app's preview pane can run `bun run dev`.

### Changed

- **Updated `@blueshed/railroad`** from 0.1.1 to 0.11.0, and take it from npm (`^0.11.0`) rather than the GitHub repository, so installs are pinned and reproducible. Its two Claude Code skills (`railroad`, `bun-route`) are installed in `.claude/skills/`. Replaced the removed `text()` helper with a plain function child in `Editor.tsx`, and added a root `pushDisposeScope()` in `app.tsx` so the app-lifetime `when()` call has an owning scope (railroad 0.10.0 added a console warning for scopeless `when()`/`list()`). The keyed `list(items, keyFn, render)` now hands `render` a signal per row rather than the item, so `Browser.tsx` and `ImageBrowser.tsx` read rows with `row$.map(…)` / `row$.peek()`, and their `load()` no longer wraps the signal updates in an empty `catch {}` (which had hidden the resulting render error and left the file list empty).
- **New never overwrites.** The New dialog's page, folder and theme writes are create-only (`If-None-Match: *`; `PUT /edit/pages/*` answers 412 when the file exists) and the dialog shows "… already exists" instead. Before, a new page named after an existing one replaced it with a stub.
- A new folder's `index.md` is titled after the folder rather than "index", so the folder's nav entry reads sensibly.
- **The site nav is cached.** `server/nav.ts` builds it once and keeps it until the editor writes or deletes a page (`PUT`/`DELETE /edit/pages/*` call `pagesChanged()`). Every write goes through the server, so nothing else needs to expire it; a build that fails isn't kept. Before, every page view listed every folder and read every `index.md`, which is costly on S3. With `DEBUG=1` it's built per request instead, so pages written straight to disk appear in the nav at once, which is how writing a site with an editor open (or with the authoring skill) actually goes.
- `PUT /edit/mark/` takes `?path=` (the page being edited) and answers with `theme`, the page's whole theme cascade, instead of an unused empty `toc`; the preview inlines it rather than linking one folder's `-theme.css`.
- **Front matter is strict about its keys, and can be fenced.** A plain block at the top of a page may only use the keys duckdown reads (`title`, `theme`, `nav`, `toc`, `layout`, `description`, `date`, `draft`) or an `x-…` of your own; at anything else the block ends and the rest is content. So a page opening "Update: closed on Monday" keeps its first line, where before that line vanished into the metadata. For other keys, fence the block with `---` … `---`, which also means front matter pasted from Jekyll, Hugo, Astro or Obsidian works as written. Titles, themes and descriptions are escaped on the way into the template.
- **A new site keeps the authoring skill.** `bun create` used to delete `.claude` wholesale; it now keeps `skills/duckdown` (for writing the new site's content) and `launch.json` (the desktop app's preview), and removes only railroad's skills, which are for working on duckdown itself.
- **Signing in lands in the editor.** `/login` without a `next` now goes to `/edit` rather than the site's home page, and visiting `/login` while signed in goes straight there.
- **Names are real names.** Storage keys are decoded from the URL (`after()`, and the site route), and the editor encodes each path segment when it builds a URL (`urlPath()`), so a page called "About us" is stored as `About us.md`, not `About%20us.md`, and names with `#` or `?` survive; nav links are encoded to match.
- `GET /edit/pages/<missing>.md` (or `.css`) is a 404; it used to answer with an empty folder listing, which the editor then opened as the page's text.
- The editor's file and image lists are typed (`FileEntry`/`FolderEntry` from `storage.ts`), so a change like railroad's keyed-row signals is a compile error, not a blank list.
- For testability: `S3Storage` takes optional explicit credentials (Bun reads its `S3_*` environment only at startup), the four storage factories are one `storageAt(sub, s3)`, `seedLocalSite`, `claimPidFile` and `loadSecret` take parameters with the old defaults, the startup banner is `configLines()`, `claimPidFile` throws rather than exits, `main.ts` exports `server`, and `create/setup.ts` exports `setup(root)` and runs only as a script.
- **Replaced `feather-icons` with `lucide-static`.** `Icon.tsx` now imports the 14 icons actually used as named exports (tree-shakes to ~5KB in production builds; icon names were unchanged, since lucide is a feather-icons fork with matching kebab-case names for this set).
- **Bumped the minimum Bun version to 1.4.0** (`engines.bun` in `package.json`; `@types/bun` updated to match the installed 1.4.2). The `req.params["*"]` wildcard gap noted in `CLAUDE.md` is still present in 1.4.2 — the `after()` workaround stays.
- **Image thumbnails now use `Bun.Image`** (native to Bun 1.4, no `sharp`/native module needed). `GET /edit/browse/*?thumb=<size>` decodes, resizes (`fit: "inside"`, never upscales), and re-encodes to WebP on the fly; SVGs are served as-is since `Bun.Image` only decodes raster formats. The image browser's file list (`ImageBrowser.tsx`) now shows real thumbnails instead of a generic icon.

### Fixed

- `create/setup.ts` now writes a hashed password for the scaffolded `admin` user, matching the new auth behavior.
- `GET /edit/browse/<file>` (an existing file path with no `?thumb=`) no longer crashes with `ENOTDIR` — it now serves the file directly, mirroring the exists-check pattern already used in `pages.ts`/`static.ts`. This was a pre-existing bug, unreachable from the UI, surfaced while adding the thumbnail tests.
- **The login page is styled again.** `login.html` linked `./styles.css`, which resolved to `/styles.css` and 404'd (the page is read from disk, not bundled), leaving borderless inputs and a white-on-white Sign In button. It now links `/edit/styles.css`.
- `feature.md` and `CLAUDE.md` caught up with the code (Railroad not Crank.js, Lucide not Feather, `text()` gone, the keyed-`list()` signal rows); `feature.md` stays the feature map and `todo.jsonl` tracks bugs and tasks.
- **Save no longer says "Saved" when it didn't.** A failed save keeps the edit marked unsaved and flashes "Not saved" in red (the notice says why); a failed delete leaves the file open.
- **A placeholder used twice is filled twice.** The template was filled with `.replace("{{title}}", …)`, and a string pattern replaces only the first occurrence — so a template using `{{title}}` in `<title>` and again in `og:title` published the second as the literal `{{title}}`. Every placeholder now fills everywhere it appears, and `{{content}}` is still filled last so a page's own text is never scanned.
- **`{{url}}`** — the page's own address, for a canonical link and `og:url`, taken from the forwarded headers so it is right behind a proxy.
- **Published pages keep their `$`s.** The site filled its template with string replacements, which read `$$`, `$&` and `$'` in a page as patterns: "$$5" published as "$5" while the preview showed "$$5". It now uses replacer functions.
- The editor's icon-only buttons have names (Delete file, Close images, Dismiss) for screen readers, and icons are `aria-hidden`.
- **The CSS preview showed a theme unstyled until you typed.** `app.tsx` attached the CSS preview's iframe in the same moment its `srcdoc` changed, and the browser kept the first document. The previews are now built with `when()` as they're shown, from the content as it is then.
- A preview render still pending when the page changes or the preview closes is now cancelled (the effect's cleanup), instead of running after the fact.
- The guide's front-matter table said `nav:` puts any page in the navigation; only a folder's `index.md` is read (by its `nav:`, else its `title:`), and the guide now says so.
- **A page can write about `{{pages}}`.** The listing was substituted across the whole page, so the tag expanded inside code spans and fenced blocks too — the guide documenting the feature had the guide's own listing injected into its example. Substitution now skips `<code>` (`outsideCode()` in `utils.ts`), which covers fences as well, since a fence renders as `<pre><code>`. The template's own placeholders were never at risk: `{{content}}` is filled last, so a page's text arrives after the rest are consumed.
