#!/usr/bin/env bun

// `duckdown` — the server, or with `init`, the scaffold for a site that has
// duckdown installed as a dependency (bun add, then bunx duckdown init), or
// with `user`, who can sign in, or with `publish` and `pull`, the remote.

import { scaffold } from "./init";

// Loaded when asked for, not at the top: the server's modules read the
// environment as they load, and `init` runs where there is no site yet.
const commands: Record<string, (args: string[]) => Promise<number>> = {
  user: async (args) => (await import("./users")).userCommand(args),
  publish: async (args) => (await import("./remote")).remoteCommand("publish", args),
  pull: async (args) => (await import("./remote")).remoteCommand("pull", args),
};

export async function cli(
  argv: string[],
  cwd = process.cwd(),
  start: () => Promise<unknown> = () => import("./main"),
  run = commands,
): Promise<number> {
  const command = run[argv[0] ?? ""];
  if (command) {
    try {
      return await command(argv.slice(1));
    } catch (e) {
      console.error(`duckdown ${argv[0]}: ${(e as Error).message}`);
      return 1;
    }
  }
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
