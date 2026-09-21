#!/usr/bin/env bun

// Post-create setup: run after `bun create blueshed/duckdown my-site`
// Tidies the cloned repo into a fresh site.

import { rmSync, mkdirSync, writeFileSync, existsSync, copyFileSync } from "fs";
import { join } from "path";

// Only when run (bun create's postinstall), never on import: tests call
// setup() on a scratch folder, since it deletes things.
if (import.meta.main) await setup(process.cwd());

export async function setup(root: string): Promise<void> {
  const name = root.split("/").pop() || "my-site";

  console.log(`Setting up ${name}...`);

  // Create a fresh site folder, before the seed site (tests/example) goes
  const siteDir = join(root, "site");
  if (!existsSync(siteDir)) {
    mkdirSync(join(siteDir, "pages"), { recursive: true });
    mkdirSync(join(siteDir, "static", "images"), { recursive: true });
    mkdirSync(join(siteDir, "templates"), { recursive: true });

    // Default pages
    writeFileSync(join(siteDir, "pages", "index.md"), `title: ${name}

# Welcome to ${name}

Your new site is ready. [Login to edit](/login).
`);

    // The seed site's stylesheet: built on variables, so a theme is a few lines
    copyFileSync(join(root, "tests", "example", "static", "site.css"), join(siteDir, "static", "site.css"));

    // The seed's template, not a second copy of it: the two drifted, and a
    // canonical link had to be added in both places last time.
    copyFileSync(join(root, "tests", "example", "templates", "site.html"), join(siteDir, "templates", "site.html"));

    // Default users — password hashed, never stored in plaintext
    const adminHash = await Bun.password.hash("admin");
    writeFileSync(join(siteDir, "users.json"), JSON.stringify({ admin: adminHash }, null, 2) + "\n");
  }

  // Write .env pointing to the site folder
  writeFileSync(join(root, ".env"), `DUCKDOWN_PATH=./site
PORT=8080
DEBUG=1

# S3 storage (uncomment to use)
# DUCKDOWN_BUCKET=my-bucket
# DUCKDOWN_PREFIX=
# DUCKDOWN_ENDPOINT=http://localhost:9000
# DUCKDOWN_REGION=us-east-1
# S3_ACCESS_KEY_ID=minio
# S3_SECRET_ACCESS_KEY=minio123
`);

  // Remove what belongs to developing duckdown itself. A new site keeps the
  // rest of .claude: the authoring skill, for writing the site's content, and
  // launch.json, for the desktop app's preview. Railroad's skills are for
  // working on the editor, so they go.
  for (const path of [
    "tests", "feature.md", "todo.jsonl", "bunfig.toml", "create",
    join(".claude", "skills", "railroad"), join(".claude", "skills", "bun-route"),
  ]) {
    rmSync(join(root, path), { recursive: true, force: true });
  }

  console.log(`
  ${name} is ready!

  bun run dev        # Start development server
  bun run start      # Start production server

  Site content: ./site/
  Editor:       http://localhost:8080/edit
  Login:        http://localhost:8080/login (admin/admin)
`);
}
