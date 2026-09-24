# Duckdown

A markdown CMS built with [Bun](https://bun.sh) and [Railroad](https://github.com/blueshed/railroad).

Write markdown, see it live, publish your site.

## Quick Start

There are two ways in. They share one scaffold and differ in one thing: where
duckdown's code lives. Your content (`site/`: pages, templates, static files)
never depends on which you chose.

**Install it** — the default. duckdown is a dependency; an upgrade is a tag bump.

```sh
mkdir my-site && cd my-site
bun init -y
bun add github:blueshed/duckdown#v0.2.0     # the tag is the version
bunx duckdown init                          # makes site/, .env, .gitignore, .railway/railway.ts, the skill
bun install
bun run dev
```

`bunx duckdown init` never overwrites: a `site/`, a `.env` or a script that is
already there is left alone, and it says what it skipped.

**Create it** — when you want to own the code, or need a different duckdown.

```sh
bun create blueshed/duckdown my-site
cd my-site
bun run setup     # bun should do this for you; as of Bun 1.4.2 it doesn't
bun run dev
```

`bun create` prints `$ bun run create/setup.ts` and, on Bun 1.4.2, doesn't run
it. Until that's fixed upstream, run it yourself — it makes `site/` and `.env`
the same way `init` does. The code is `./server/` and the tests are `./tests/`,
still held at 100% coverage: yours to change, with the suite that guards them.
There is no upgrade path — `bun create` strips the history. If you want to own
the code *and* merge upstream, fork duckdown on GitHub instead.

|  | **install** | **create** |
|---|---|---|
| duckdown's code | `node_modules/duckdown/server/` | `./server/` |
| Scripts run | `node_modules/duckdown/server/main.ts`… | `server/main.ts`… |
| Upgrading | change the tag, `bun install` | none: it's your code |
| duckdown's tests | not included | `./tests/`, at 100% |
| The authoring skill | copied once; refresh with `cp -r node_modules/duckdown/.claude/skills/duckdown .claude/skills/` | in the clone |

Moving between them is one paragraph, not a command. To take ownership: copy
`node_modules/duckdown/server` to `./server` and point the scripts at it. To go
back: delete `./server` and add the dependency. The content never moves.

`site.css` and `search.js` — duckdown's base — aren't copied into either kind
of site. A site with no file of that name is served and exported duckdown's
own, so upgrading upgrades them; make your own `site/static/site.css` to fork
one. Put a site's look in `theme.css` and keep the upgrades.

Open [http://localhost:8080](http://localhost:8080) to see your site.
Login at [http://localhost:8080/login](http://localhost:8080/login) with `admin` / `admin`.

## Two ways to deploy it

duckdown is a server, and it is also a static site generator. Neither is the
upgrade of the other — the question they answer is **who edits the site, and
from where.**

|  | **served** | **published** |
|---|---|---|
| What runs | duckdown | any static host |
| Where the site is | a folder or an S3 bucket | the files `bun run export` writes |
| Editing | at `/edit`, from any browser | locally, then deploy the output |
| Needs | `COOKIE_SECRET`, a password, `users.json` | nothing — no login to guard |

Serve it when someone has to fix a typo from a phone. Publish it when one
person writes at a desk and would rather the internet held no login at all.
The content is the same markdown either way, and the pages are rendered by the
same code, so you can change your mind.

## Features

- Markdown editor whose preview is the page: the same renderer the site uses,
  so it has your template, your navigation and your stylesheets in it
- Front-matter metadata (title, nav, toc, layout, css, description, date, draft)
- Contents lists, callouts (`> [!NOTE]`) and `[[wiki links]]` between pages
- Styling in a few CSS variables: `static/theme.css`, linked by the template, with dark mode
- **Templates and stylesheets are editable in the browser too**, in a pane
  below the page, so you watch the page change as you write them
- Client-side search: one JSON index, matched in the browser — no service, no
  dependency, and it works on a published site
- Image browser with upload
- **Collections**: a gallery or catalogue kept as data in one file, with a page
  per item and as many overviews as you like, all written once in markdown —
  and edited as works in the editor, not as JSON
- Navigation generated from `index.md` files, and folder listings that keep themselves
- JWT authentication
- A view log that counts readers without identifying them — no IP, no user
  agent, no cookie
- Local filesystem or S3 storage
- Zero build step — Bun serves everything

## The editor

Three columns at `/edit`:

- **Left — your content.** The folders and pages of your site, and nothing
  else: everything a page is composed with lives outside `pages/`.
- **Middle — whatever you have open.** A page; underneath it a stylesheet or
  template you're composing with; or just one of those, filling the column.
  Each closes, and the space goes back to what's left.
- **Right — what you'd see.** The page as the site will render it. With no
  page open, a sample page for whatever you're editing, so a template or a
  stylesheet can be written from nothing.

**Resources**, in the header, holds what doesn't belong to any one folder: the
images, the stylesheets in `static/`, and the templates. Pick one and it opens
below your page.

## Project Structure

```
├── server/
│   ├── main.ts          # Resources and routes
│   ├── config.ts        # Environment config
│   ├── storage.ts       # Local / S3 storage
│   ├── auth.ts          # JWT auth
│   ├── markdown.ts      # Front-matter + Bun.markdown
│   ├── page.ts          # A page, rendered: markdown in its template
│   ├── log.ts           # The view log (counts, never identifies)
│   ├── init.ts          # The scaffold both ways in share
│   ├── cli.ts           # `duckdown` (the server) and `duckdown init`
│   ├── serve.ts         # Hands out an exported site
│   ├── base/            # site.css and search.js, for a site with no copy
│   ├── routes/          # Route handlers
│   └── edit/            # Editor UI (Railroad + JSX)
├── tests/
│   ├── example/         # Sample site content
│   └── *.test.ts        # Integration tests
├── create/              # bun create scaffolder
└── package.json
```

## Scripts

```sh
bun run dev        # Development with HMR
bun run start      # Production
bun run stop       # Stop the server started from this folder
bun run test       # Run tests (100% coverage required)
bun run check      # TypeScript check
bun run export     # Write the whole site to ./dist as plain files (--strict: a broken link fails)
bun run serve      # Hand out ./dist: the published flavour's server (SITE_DIR, PORT)
bun run setup      # What bun create runs after cloning
bun run s3:up      # Start MinIO (dev:s3 does this for you); s3:down stops it, s3:logs follows it
bun run dev:s3     # Start MinIO + run with S3 storage
```

The server writes its pid to `duckdown.pid` and removes it on exit; `bun run stop` stops it (after checking the pid really is a duckdown server, and clearing away a stale file). Set `DUCKDOWN_PID` to move the file, or to an empty value to turn it off.

## Publishing it

```sh
DUCKDOWN_ORIGIN=https://example.com bun run export
```

That writes the whole site to `dist/`: every page rendered by the same code
that serves it, with its template, navigation and stylesheets, at its one
canonical address — `/` and `/blog/` as `index.html`, `about.md` as
`about.html`. Then `static/` alongside. Ready for any static host.

Beside the pages it writes `sitemap.xml` (from `DUCKDOWN_ORIGIN`), `robots.txt` and
`favicon.ico` at the root, and `404.html` from `pages/404.md`. It reports
internal links that lead nowhere (`--strict` fails on them), and an export that
finds no pages fails rather than publish an empty site.

To hand `dist/` out: `bun run node_modules/duckdown/server/serve.ts` (or the
`duckdown-serve` bin), with `SITE_DIR` and `PORT`. It logs page views the way
the served site does, and nothing else.

### Publishing from the editor

Edit the site on your own machine and publish it with a button: set
`DUCKDOWN_REMOTE=git` in `.env` and the editor's header gets **Publish** (with
a count of what's waiting) and **Pull**. Publish checks the site the way the
export does, commits `site/` — never `users.json`, `.history/` or `reports/` —
and pushes; Railway rebuilds from the push. Pull brings in what was published
from elsewhere; a page changed on both sides keeps your version and puts
theirs in its Earlier versions. `duckdown publish` and `duckdown pull` do the
same from a terminal.

Drafts are left out rather than hidden behind a login, `{{edit}}` is empty, and
`{{url}}` takes its origin from `DUCKDOWN_ORIGIN` because there's no request to
read one from. It reads through the storage layer, so it will export a folder
on disk or a live bucket — a running site can be turned into a static snapshot
without moving its content first.

Edit locally with `bun run dev`, where the editor previews through the same
renderer, so what you see is what ships.

## Storage

Set `DUCKDOWN_BUCKET` to use S3, otherwise local filesystem.

```sh
# Local (default). Point it at your own folder — in this repo the dev server
# uses ./.dev-site, a working copy seeded from tests/example, so that editing
# the site never edits the sample it came from.
DUCKDOWN_PATH=./site

# S3 / MinIO
DUCKDOWN_BUCKET=my-bucket
DUCKDOWN_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minio
S3_SECRET_ACCESS_KEY=minio123
```

## License

MIT
