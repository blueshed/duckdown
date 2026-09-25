#!/usr/bin/env bun
// How duckdown copes with a large site (n163). Makes one in a scratch folder
// — N pages over F folders, each folder's index listing its pages with a
// feed, a front page with {{sitemap}}, and a collection of C works — then
// times what the site knows about itself cold and kept, a page render, what a
// save costs, and the whole export.
//
//   bun run bench                    5,000 pages, 50 folders, 2,000 works
//   bun run bench 20000 100 5000     larger
//
// Not part of the suite: it measures, it doesn't check. See n163's note for
// what it found on 2026-09-25.
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const [N = "5000", F = "50", C = "2000"] = process.argv.slice(2);
const root = mkdtempSync(join(tmpdir(), "duckdown-bench-"));
const site = join(root, "site");
await Bun.spawn(["bun", join(import.meta.dir, "make-big.ts"), site, N, F, C], { stdout: "inherit", stderr: "inherit" }).exited;
const run = Bun.spawn(["bun", join(import.meta.dir, "measure.ts"), join(root, "dist")], {
  cwd: root, stdout: "inherit", stderr: "inherit",
  env: { ...process.env, DUCKDOWN_PATH: site, DUCKDOWN_PID: "", DEBUG: "0", DUCKDOWN_BUCKET: "" },
});
process.exitCode = await run.exited;
console.log(`(the site and its export are in ${root})`);
