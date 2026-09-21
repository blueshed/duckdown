# Duckdown

A markdown CMS built with [Bun](https://bun.sh) and [Railroad](https://github.com/blueshed/railroad).

Write markdown, see it live, publish your site.

## Quick Start

```sh
bun create blueshed/duckdown my-site
cd my-site
bun run setup     # bun should do this for you; as of Bun 1.4.2 it doesn't
bun run dev
```

`bun create` prints `$ bun run create/setup.ts` and, on Bun 1.4.2, doesn't run
it. Until that's fixed upstream, run it yourself — it makes `site/`, writes
`.env`, and clears away what belongs to developing duckdown. Skip it and the
server won't start, and will tell you why.

Open [http://localhost:8080](http://localhost:8080) to see your site.
Login at [http://localhost:8080/login](http://localhost:8080/login) with `admin` / `admin`.

## Features

- Markdown editor whose preview is the page: the same renderer the site uses,
  so it has your template, your navigation and your theme cascade in it
- Front-matter metadata (title, theme, nav, toc, layout, css, description, date, draft)
- Contents lists, callouts (`> [!NOTE]`) and `[[wiki links]]` between pages
- Themes in a few CSS variables, per folder and cascading, with dark mode
- **Templates and stylesheets are editable in the browser too**, in a pane
  below the page, so you watch the page change as you write them
- Image browser with upload
- Navigation generated from `index.md` files, and folder listings that keep themselves
- JWT authentication
- A view log that counts readers without identifying them — no IP, no user
  agent, no cookie
- Local filesystem or S3 storage
- Zero build step — Bun serves everything

## The editor

Three columns at `/edit`:

- **Left — your content.** Folders and pages, and at the foot of each folder
  the `-theme.css` that styles it. Where a theme sits is what it means: that
  folder, and everything under it.
- **Middle — whatever you have open.** A page; underneath it a theme,
  stylesheet or template you're composing with; or just one of those, filling
  the column. Each closes, and the space goes back to what's left.
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
bun run dev:s3     # Start MinIO + run with S3 storage
```

The server writes its pid to `duckdown.pid` and removes it on exit; `bun run stop` stops it (after checking the pid really is a duckdown server, and clearing away a stale file). Set `DUCKDOWN_PID` to move the file, or to an empty value to turn it off.

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
