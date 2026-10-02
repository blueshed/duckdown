// The scaffold both ways in share.
//
// A duckdown site is its content folder (site/) plus the code that serves it,
// and the two are independent: DUCKDOWN_PATH points at the first wherever the
// second lives. So there are two ways in and one scaffold.
//
//   install   bun add github:blueshed/duckdown#<tag>, then `bunx duckdown init`.
//             The code stays in node_modules/duckdown/server/, and an upgrade
//             is a tag bump. The documented default. `bunx duckdown …` runs
//             only once the dependency is installed: in a folder whose
//             package.json names duckdown (a fresh clone, a hand-written
//             dependency) with no node_modules, Bun says "Couldn't find or
//             open the file 'init'" before any of this runs, and `bun install`
//             is the fix.
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
    // What a deploy runs: a broken link, a collection problem or a stale
    // translation stops it, and the site already live is left alone.
    build: "bun run export --strict",
  };
}

// How the published site reaches Railway: a GitHub repository Railway builds
// from ("github", the default), or `railway up` from this folder ("up"), which
// is how four of the sites go out — no repository, and the folder as it stands.
export type Deploy = "github" | "up";

// .railway/railway.ts: one published site, whichever way it gets there. The two
// differ in where Railway finds the code — a repository to fill in, or none (a
// deploy is `railway up --service <name>`, which ships this folder as it
// stands, so the tree must be clean first; written from what daisy and water
// do) — and so in the region the service runs in.
const railwayFile = (name: string, vendored: boolean, deploy: Deploy) => {
  const { build, start } = scripts(vendored);
  const up = deploy === "up";
  return `import { defineRailway, ${up ? "" : "github, "}project, service } from "railway/iac";
${up ? `
// Amsterdam, for readers in the UK: change it to where yours are.
const EUROPE = "europe-west4-drams3a";
` : ""}
// This repository manages only its own resources in the environment.${up ? ` If the
// project holds other services, \`railway config plan\` must show them untouched.` : ""}
export const partial = "${name}";

// A published site: duckdown renders site/ to files at build time and hands
// them out with its own serve.ts, so the service holds no secret and there is
// nothing in it to leak. ${up ? `The build is --strict: a broken link, a collection
// problem or a stale translation fails it, and the site already live is left
// alone. There is no GitHub source: a deploy is
//
//   railway up --service ${name}
//
// from this folder, from a clean tree. A custom domain is attached by hand,
// never by this file (or, to keep it from being removed, listed in \`domains\`).` : `A custom domain is managed by hand, never by this
// file, and never listed here.`}
export default defineRailway(() => {
  const web = service("${name}", {
${up ? `    healthcheck: "/health",
    replicas: { [EUROPE]: 1 },` : `    // Fill in this repository's path on GitHub and the branch that deploys.
    source: github("your-org/${name}", { branch: "main" }),
    healthcheck: "/health",`}
    build: "${build}",
    start: "${start}",

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
`;
};

export async function scaffold(root: string, o: { vendored: boolean; name?: string; deploy?: Deploy }): Promise<Scaffolded> {
  const name = o.name ?? (root.split("/").pop() || "my-site");
  const { vendored } = o;
  const deploy = o.deploy ?? "github";
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
    // The seed's template, not a second copy of it: the two drifted once. And
    // the top bar it includes, the nav and the search, or every page says so.
    for (const template of ["site.html", "topbar.html"]) {
      copyFileSync(join(seed, "templates", template), join(root, "site", "templates", template));
    }
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

# Publish from the editor: commit site/ and push it, and Railway rebuilds
# DUCKDOWN_REMOTE=git

# S3 storage (uncomment to use)
# DUCKDOWN_BUCKET=my-bucket
# DUCKDOWN_PREFIX=
# DUCKDOWN_ENDPOINT=http://localhost:9000
# DUCKDOWN_REGION=us-east-1
# S3_ACCESS_KEY_ID=minio
# S3_SECRET_ACCESS_KEY=minio123
`);

  // .gitignore is added to rather than kept or replaced: a site has its own
  // lines already, and needs these. .dist.next-*/ and .dist.old-*/ are what
  // an export that was stopped leaves beside dist/ until the next clears them.
  const ignore = join(root, ".gitignore");
  const have = existsSync(ignore) ? readFileSync(ignore, "utf8").split("\n").map((l) => l.trim()) : [];
  const missing = ["node_modules", "dist/", ".dist.next-*/", ".dist.old-*/", ".env", "*.pid", ".DS_Store", "site/users.json", "site/.history/"].filter((l) => !have.includes(l));
  if (missing.length) {
    const lead = have.length && have.at(-1) !== "" ? "\n" : "";
    appendFileSync(ignore, `${lead}${missing.join("\n")}\n`);
    result.wrote.push(".gitignore");
  }

  // The published flavour on Railway, as infrastructure-as-code: build, start,
  // healthcheck and the two variables the exporter needs, all in one file a
  // review can see (`railway config plan` / `apply`, the Railway CLI) — not
  // set by hand in the dashboard, and not railway.json, which can't hold
  // variables. `source` (where there is one) and `DUCKDOWN_ORIGIN` are placeholders: real ones
  // before the first deploy — the real domain even before it points here,
  // because the service's own railway.app address is served regardless.
  text(join(".railway", "railway.ts"), railwayFile(name, vendored, deploy));

  // The authoring skill. From this package, so a site's copy is as new as the
  // duckdown it was made with; duckdown upgrade refreshes it.
  put(join(".claude", "skills", "duckdown"), () =>
    cpSync(join(PACKAGE, ".claude", "skills", "duckdown"), join(root, ".claude", "skills", "duckdown"), { recursive: true }));
  // The desktop app's preview config: this site's own dev server, and nothing
  // else. Written, not copied: duckdown's own lists the sites previewed beside it.
  text(join(".claude", "launch.json"), `${JSON.stringify({
    version: "0.0.1",
    configurations: [{ name, runtimeExecutable: "bun", runtimeArgs: ["run", "dev"], port: 8080 }],
  }, null, 2)}\n`);

  // A folder that keeps its notes under .claude/ has them already: a second
  // set beside them would be read as well, and disagree.
  if (existsSync(join(root, ".claude", "CLAUDE.md"))) result.skipped.push("CLAUDE.md (.claude/CLAUDE.md is there)");
  else text("CLAUDE.md", `# ${name}

A duckdown site: markdown in \`site/\`, published as files. ${vendored
    ? "duckdown's code is `server/` — yours to change, with its tests. There is no upgrade path: to follow upstream, fork duckdown on GitHub instead."
    : "duckdown is a pinned dependency (`package.json`), not a copy: upgrade it with `bunx duckdown upgrade` (the newest tag, or name one), which re-pins, installs, refreshes the skill and compares the export before and after, then commit what it changed. If the content lives somewhere else too (a served site's bucket), bring it here first: `railway run --service <name> bunx duckdown bucket pull`. `bunx duckdown …` runs only once `bun install` has: in a fresh clone Bun answers `Couldn't find or open the file 'init'` (or the verb) until it has."}

Read \`.claude/skills/duckdown/\` before writing content: front matter, callouts,
navigation, templates and styling, and what publishing does.

- \`site/pages/\` — the pages. \`site/templates/\` — what they are wrapped in.
- \`site/static/theme.css\` — this site's look. \`site.css\`, the base, comes from
  duckdown; make a \`site/static/site.css\` only to fork it.

\`\`\`sh
bun run dev       # the editor at http://localhost:8080/edit (admin/admin)
bun run export    # site/ -> dist/, saying what is wrong and carrying on
bun run build     # the same with --strict: what a deploy runs
bun run start     # hand out dist/ on PORT
\`\`\`

\`build\` is \`export --strict\` on purpose: a link that leads nowhere, a
collection with a problem or a translation that has fallen behind fails the
build, and Railway leaves the site that is live as it is. A page that is wrong
should stop a deploy, not be published.

## Deploying (Railway)

Everything Railway holds for the service — build, start, healthcheck and the
variables, \`DUCKDOWN_PATH\` and \`DUCKDOWN_ORIGIN\` included — is declared in
\`.railway/railway.ts\` and applied with the Railway CLI:

\`\`\`sh
railway config plan     # a dry run: changes nothing
railway config apply    # only after reading the plan
\`\`\`

**Read the plan every time — what the file does not say is removed.** ${deploy === "up"
    ? `Fill in the real domain before the first deploy. There is no GitHub source: a deploy is \`railway up --service ${name}\`, which ships this folder as it stands, so commit first and deploy from a clean tree; a custom domain is attached by hand, never by this file.`
    : "Fill in the repository's path on GitHub and the real domain before the first deploy; a custom domain is managed by hand, never by this file."}

## Todo

\`todo.jsonl\` is the ledger of open work — check it first and keep it current.
One JSON object per line: \`n\`, \`status\`, \`severity\`, \`area\`, \`file\`,
\`summary\`, \`detail\`, plus a dated \`note\` once worked on.
`);
  text("todo.jsonl", "");
  if (!vendored) text("README.md", `# ${name}\n\nA [duckdown](https://github.com/blueshed/duckdown) site. See CLAUDE.md.\n`);

  return result;
}
