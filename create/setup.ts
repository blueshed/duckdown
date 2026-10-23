#!/usr/bin/env bun

// Post-create setup: run after `bun create blueshed/duckdown my-site`.
//
// This is the way in for someone who wants the code: server/ stays, and it is
// theirs — and so is the test suite, held at 100% coverage, which is exactly
// what they need on the day they start changing things. There is no upgrade
// path: bun create strips the history, so to follow upstream fork duckdown on
// GitHub instead. To depend on duckdown rather than own it:
// `bunx github:blueshed/duckdown create my-site`. The scaffold is the
// same either way (server/init.ts).

import { realpathSync, rmSync } from "fs";
import { join } from "path";
import { commitAll, git } from "../server/create";
import { scaffold } from "../server/init";

// Only when run (bun create's postinstall), never on import: tests call
// setup() on a scratch folder, since it deletes things.
if (import.meta.main) await setup(process.cwd());

export async function setup(root: string) {
  const name = root.split("/").pop() || "my-site";
  console.log(`Setting up ${name}...`);

  // bun create commits the copy, installs, then runs this. A repository of its
  // own with nothing changed yet is that, and what this does is committed after
  // it, so the site starts clean. Run by hand over changes of yours, or inside
  // another repository, it commits nothing.
  const top = git(["rev-parse", "--show-toplevel"], root);
  const fresh = top.code === 0 && realpathSync(top.out.trim()) === realpathSync(root) && git(["status", "--porcelain"], root).out === "";

  // What is about developing duckdown as a project, not the code or its tests:
  // its ledger, this script, and its previews (the scaffold writes the site's).
  for (const path of ["todo.jsonl", "create", join(".claude", "launch.json")]) {
    rmSync(join(root, path), { recursive: true, force: true });
  }

  const { wrote, skipped } = await scaffold(root, { vendored: true, name });
  for (const path of wrote) console.log(`  wrote ${path}`);
  for (const path of skipped) console.log(`  kept ${path}`);
  if (fresh) console.log(`  ${commitAll(root, `Set up ${name}`)}`);

  console.log(`
  ${name} is ready!

  bun run dev        # Start the editor and the site
  bun run test       # duckdown's own tests, in ./tests
  bun run export     # Write the site to ./dist
  bun run start      # Hand out ./dist

  Site content: ./site/
  Editor:       http://localhost:8080/edit
  Login:        http://localhost:8080/login (admin/admin)
`);
}
