# Duckdown

A markdown CMS built with [Bun](https://bun.sh) and [Railroad](https://github.com/blueshed/railroad).

Write markdown, see it live, publish your site.

## Quick Start

```sh
bun create blueshed/duckdown my-site
cd my-site
bun run dev
```

Open [http://localhost:8080](http://localhost:8080) to see your site.
Login at [http://localhost:8080/login](http://localhost:8080/login) with `admin` / `admin`.

## Features

- Markdown editor with live preview
- Front-matter metadata (title, theme, nav, toc, layout, description, date, draft)
- Contents lists, callouts (`> [!NOTE]`) and `[[wiki links]]` between pages
- Themes in a few CSS variables, per folder and cascading, with dark mode
- Image browser with upload
- Navigation generated from `index.md` files, and folder listings that keep themselves
- JWT authentication
- Local filesystem or S3 storage
- Zero build step — Bun serves everything

## Project Structure

```
├── server/
│   ├── main.ts          # Resources and routes
│   ├── config.ts        # Environment config
│   ├── storage.ts       # Local / S3 storage
│   ├── auth.ts          # JWT auth
│   ├── markdown.ts      # Front-matter + Bun.markdown
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
# Local (default)
DUCKDOWN_PATH=./tests/example

# S3 / MinIO
DUCKDOWN_BUCKET=my-bucket
DUCKDOWN_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minio
S3_SECRET_ACCESS_KEY=minio123
```

## License

MIT
