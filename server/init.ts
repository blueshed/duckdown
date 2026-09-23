// The scaffold both ways in share.
//
// A duckdown site is its content folder (site/) plus the code that serves it,
// and the two are independent: DUCKDOWN_PATH points at the first wherever the
// second lives. So there are two ways in and one scaffold.
//
//   install   bun add github:blueshed/duckdown#<tag>, then `bunx duckdown init`.
//             The code stays in node_modules/duckdown/server/, and an upgrade
//             is a tag bump. The documented default.
//   create    bun create blueshed/duckdown my-site. The code is ./server/ and
//             it is yours: no upgrade path, and nothing to merge from upstream.
//
// The only difference in what this writes is where package.json's scripts
// point. Nothing already there is overwritten, and what was left alone is said.

import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, cpSync, appendFileSync } from "fs";
import { join } from "path";

// duckdown itself: its seed site and its authoring skill are what a new site
// starts from, whichever way it got here.
const PACKAGE = join(import.meta.dir, "..");

export type Scaffolded = { wrote: string[]; skipped: string[] };

// The scripts a site runs, for code at `dir`. The paths are the whole of what
// the two ways in disagree about.
export function scripts(vendored: boolean): Record<string, string> {
  const dir = vendored ? "server" : "node_modules/duckdown/server";
  return {
    dev: `bun run --hot ${dir}/main.ts`,
    stop: `bun run ${dir}/stop.ts`,
    export: `bun run ${dir}/export.ts`,
    start: `bun run ${dir}/serve.ts`,
    "start:served": `bun run ${dir}/main.ts`,
    build: "bun run export",
  };
}

export async function scaffold(root: string, o: { vendored: boolean; name?: string }): Promise<Scaffolded> {
  const name = o.name ?? (root.split("/").pop() || "my-site");
  const { vendored } = o;
  const seed = join(PACKAGE, "tests", "example");
  const version = JSON.parse(readFileSync(join(PACKAGE, "package.json"), "utf8")).version as string;
  const result: Scaffolded = { wrote: [], skipped: [] };

  // Write a file that isn't there yet; say so when it already is.
  const put = (path: string, make: () => void) => {
    if (existsSync(join(root, path))) return void result.skipped.push(`${path} (already there)`);
    mkdirSync(join(root, path, ".."), { recursive: true });
    make();
    result.wrote.push(path);
  };
  const text = (path: string, body: string) => put(path, () => writeFileSync(join(root, path), body));

  // The content. theme.css is this site's own look; site.css and search.js are
  // not copied, because duckdown serves and exports them unless the site has a
  // file of that name, so upgrading duckdown upgrades them.
  if (existsSync(join(root, "site"))) {
    result.skipped.push("site/ (already there)");
  } else {
    mkdirSync(join(root, "site", "pages"), { recursive: true });
    mkdirSync(join(root, "site", "static", "images"), { recursive: true });
    mkdirSync(join(root, "site", "templates"), { recursive: true });
    writeFileSync(join(root, "site", "pages", "index.md"), `title: ${name}

# Welcome to ${name}

Your new site is ready. [Login to edit](/login).
`);
    copyFileSync(join(seed, "static", "theme.css"), join(root, "site", "static", "theme.css"));
    // The seed's template, not a second copy of it: the two drifted once.
    copyFileSync(join(seed, "templates", "site.html"), join(root, "site", "templates", "site.html"));
    // The password is hashed, never stored in plaintext.
    const admin = await Bun.password.hash("admin");
    writeFileSync(join(root, "site", "users.json"), JSON.stringify({ admin }, null, 2) + "\n");
    result.wrote.push("site/");
  }

  // package.json: the scripts, and (installed) the dependency pinned to the
  // version this ran from. A script that is already there is the site's own.
  const pkgPath = join(root, "package.json");
  const had = existsSync(pkgPath);
  const pkg = had ? JSON.parse(readFileSync(pkgPath, "utf8")) : { name, version: "0.0.1", private: true };
  pkg.scripts ??= {};
  if (vendored) {
    // A clone's package.json is duckdown's own: it is this site's now.
    Object.assign(pkg, { name, version: "0.0.1", private: true });
    for (const key of ["bin", "files", "repository", "homepage", "keywords", "description", "author", "bun-create"]) delete pkg[key];
    delete pkg.scripts.setup;
  } else if (!pkg.dependencies?.duckdown && !pkg.devDependencies?.duckdown) {
    (pkg.dependencies ??= {}).duckdown = `github:blueshed/duckdown#v${version}`;
  }
  // .railway/railway.ts (below) imports from "railway/iac"; without the
  // package installed that import can't resolve when the CLI reads the file.
  (pkg.devDependencies ??= {}).railway ??= "^3.11.0";
  for (const [key, command] of Object.entries(scripts(vendored))) {
    if (vendored || pkg.scripts[key] === undefined) pkg.scripts[key] = command;
    else if (pkg.scripts[key] !== command) result.skipped.push(`package.json script "${key}" (the site's own)`);
  }
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  result.wrote.push(had ? "package.json (scripts)" : "package.json");

  // DUCKDOWN_ORIGIN is the published site's address: canonical links and
  // sitemap.xml need it, so it is set before the first deploy.
  text(".env", `DUCKDOWN_PATH=./site
PORT=8080
DEBUG=1

# Local editor login (a deployed site sets its own)
DUCKDOWN_ADMIN_PASSWORD=admin

# The published site's address, for canonical links and sitemap.xml
DUCKDOWN_ORIGIN=

# S3 storage (uncomment to use)
# DUCKDOWN_BUCKET=my-bucket
# DUCKDOWN_PREFIX=
# DUCKDOWN_ENDPOINT=http://localhost:9000
# DUCKDOWN_REGION=us-east-1
# S3_ACCESS_KEY_ID=minio
# S3_SECRET_ACCESS_KEY=minio123
`);

  // .gitignore is added to rather than kept or replaced: a site has its own
  // lines already, and needs these.
  const ignore = join(root, ".gitignore");
  const have = existsSync(ignore) ? readFileSync(ignore, "utf8").split("\n").map((l) => l.trim()) : [];
  const missing = ["node_modules", "dist/", ".env", "*.pid", ".DS_Store", "site/users.json", "site/.history/"].filter((l) => !have.includes(l));
  if (missing.length) {
    const lead = have.length && have.at(-1) !== "" ? "\n" : "";
    appendFileSync(ignore, `${lead}${missing.join("\n")}\n`);
    result.wrote.push(".gitignore");
  }

  // The published flavour on Railway, as infrastructure-as-code: build, start,
  // healthcheck and the two variables the exporter needs, all in one file a
  // review can see (`railway config plan` / `apply`, the Railway CLI) — not
  // set by hand in the dashboard, and not railway.json, which can't hold
  // variables. `source` and `DUCKDOWN_ORIGIN` are placeholders: real ones
  // before the first deploy — the real domain even before it points here,
  // because the service's own railway.app address is served regardless.
  text(join(".railway", "railway.ts"), `import { defineRailway, github, project, service } from "railway/iac";

// This repository manages only its own resources in the environment.
export const partial = "${name}";

// A published site: duckdown renders site/ to files at build time and hands
// them out with its own serve.ts, so the service holds no secret and there is
// nothing in it to leak. A custom domain is managed by hand, never by this
// file, and never listed here.
export default defineRailway(() => {
  const web = service("${name}", {
    // Fill in this repository's path on GitHub and the branch that deploys.
    source: github("your-org/${name}", { branch: "main" }),
    healthcheck: "/health",
    build: "${scripts(vendored).build}",
    start: "${scripts(vendored).start}",

    variables: {
      // Where the pages are. Without it the exporter falls back to a folder
      // that doesn't exist here, writes no pages, and the deploy goes green
      // with every page a 404.
      DUCKDOWN_PATH: "./site",
      // What to call the site in each page's canonical link and sitemap.xml:
      // the exporter has no request to take an origin from. Set it to the
      // real domain before the first deploy, even while that domain still
      // points elsewhere: the site is always viewable on its railway.app
      // address (served, marked noindex), and any other host moves to this.
      DUCKDOWN_ORIGIN: "https://example.com",
      // A line per page view in the logs: what is read and how much, never who.
      DUCKDOWN_LOG: "1",
    },
  });

  return project("${name}", { resources: [web] });
});
`);

  // The authoring skill and the desktop app's preview config. From this
  // package, so a site's copy is as new as the duckdown it was made with; to
  // refresh it later: cp -r node_modules/duckdown/.claude/skills/duckdown .claude/skills/
  put(join(".claude", "skills", "duckdown"), () =>
    cpSync(join(PACKAGE, ".claude", "skills", "duckdown"), join(root, ".claude", "skills", "duckdown"), { recursive: true }));
  put(join(".claude", "launch.json"), () => copyFileSync(join(PACKAGE, ".claude", "launch.json"), join(root, ".claude", "launch.json")));

  text("CLAUDE.md", `# ${name}

A duckdown site: markdown in \`site/\`, published as files. ${vendored
    ? "duckdown's code is `server/` — yours to change, with its tests. There is no upgrade path: to follow upstream, fork duckdown on GitHub instead."
    : "duckdown is a pinned dependency (`package.json`), not a copy: upgrade it by changing the tag and running `bun install`."}

Read \`.claude/skills/duckdown/\` before writing content: front matter, callouts,
navigation, templates and styling, and what publishing does.

- \`site/pages/\` — the pages. \`site/templates/\` — what they are wrapped in.
- \`site/static/theme.css\` — this site's look. \`site.css\`, the base, comes from
  duckdown; make a \`site/static/site.css\` only to fork it.

\`\`\`sh
bun run dev       # the editor at http://localhost:8080/edit (admin/admin)
bun run export    # site/ -> dist/ (--strict makes a broken link fail)
bun run start     # hand out dist/ on PORT
\`\`\`

## Deploying (Railway)

Everything Railway holds for the service — build, start, healthcheck and the
variables, \`DUCKDOWN_PATH\` and \`DUCKDOWN_ORIGIN\` included — is declared in
\`.railway/railway.ts\` and applied with the Railway CLI:

\`\`\`sh
railway config plan     # a dry run: changes nothing
railway config apply    # only after reading the plan
\`\`\`

**Read the plan every time — what the file does not say is removed.** Fill in
the repository's path on GitHub and the real domain before the first deploy;
a custom domain is managed by hand, never by this file.

## Todo

\`todo.jsonl\` is the ledger of open work — check it first and keep it current.
One JSON object per line: \`n\`, \`status\`, \`severity\`, \`area\`, \`file\`,
\`summary\`, \`detail\`, plus a dated \`note\` once worked on.
`);
  text("todo.jsonl", "");
  if (!vendored) text("README.md", `# ${name}\n\nA [duckdown](https://github.com/blueshed/duckdown) site. See CLAUDE.md.\n`);

  return result;
}
