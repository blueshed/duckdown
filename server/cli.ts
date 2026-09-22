#!/usr/bin/env bun

// `duckdown` — the server, or with `init`, the scaffold for a site that has
// duckdown installed as a dependency (bun add, then bunx duckdown init).

import { scaffold } from "./init";

export async function cli(
  argv: string[],
  cwd = process.cwd(),
  start: () => Promise<unknown> = () => import("./main"),
): Promise<number> {
  if (argv[0] !== "init") {
    await start();   // the server keeps the process alive from here
    return 0;
  }
  try {
    const { wrote, skipped } = await scaffold(cwd, { vendored: false });
    for (const path of wrote) console.log(`wrote ${path}`);
    for (const path of skipped) console.log(`left alone: ${path}`);
    console.log("\nNext: bun install, then bun run dev, and open http://localhost:8080/edit (admin/admin).");
    return 0;
  } catch (e) {
    console.error(`duckdown init: ${(e as Error).message}`);
    return 1;
  }
}

// Only when run, never on import: the tests call cli() directly.
if (import.meta.main) process.exitCode = await cli(process.argv.slice(2));
