#!/usr/bin/env bun

// Post-create setup: run after `bun create blueshed/duckdown my-site`
// Tidies the cloned repo into a fresh site.

import { rmSync, mkdirSync, cpSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const root = process.cwd();
const name = root.split("/").pop() || "my-site";

console.log(`Setting up ${name}...`);

// Remove development artifacts
for (const path of ["tests", "feature.md", ".claude"]) {
  rmSync(join(root, path), { recursive: true, force: true });
}

// Create a fresh site folder from the seed data
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

  // Default static
  writeFileSync(join(siteDir, "static", "site.css"), `body {
  margin: 0;
  padding: 2em;
  font-family: system-ui, -apple-system, sans-serif;
  color: #333;
}
`);

  // Default template
  writeFileSync(join(siteDir, "templates", "site.html"), `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{title}}</title>
  <link href="/static/site.css" rel="stylesheet">
  {{theme_css}}
</head>
<body class="{{theme}}">
  {{nav}}
  {{content}}
</body>
</html>
`);

  // Default users
  writeFileSync(join(siteDir, "users.json"), JSON.stringify({ admin: "admin" }, null, 2) + "\n");
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

// Clean up create folder itself
rmSync(join(root, "create"), { recursive: true, force: true });

console.log(`
  ${name} is ready!

  bun run dev        # Start development server
  bun run start      # Start production server

  Site content: ./site/
  Editor:       http://localhost:8080/edit
  Login:        http://localhost:8080/login (admin/admin)
`);
