#!/usr/bin/env bun

// `duckdown` — the server, or with `init`, the scaffold for a site that has
// duckdown installed as a dependency (bun add, then bunx duckdown init), or
// with `user`, who can sign in, with `publish` and `pull`, the remote, with
// `report`, the view log made into a page for the editors, with `upgrade`,
// the site moved to another tag of duckdown and its export compared, with
// `translations`, where each translation stands and one said to be checked,
// with `images`, the narrower widths of pictures already in static/images/, or with
// `bucket pull|push`, a served site's content between its bucket and a folder.

import { scaffold, type Deploy } from "./init";

export const USAGE = `duckdown                      the server (the editor at /edit)
duckdown init [--deploy up]   the scaffold around duckdown in a new site (up: deployed by railway up, not from GitHub)
duckdown user <name>          who can sign in: add one, or set a password
duckdown publish | pull       this copy of the site, to and from its git remote (DUCKDOWN_REMOTE)
duckdown translations status [lang] [--json] | stamp <path>…   where each translation stands, and say one was checked
duckdown bucket pull [folder] a served site's bucket into a folder (DUCKDOWN_SEED by default)
duckdown bucket push [folder] a folder into the bucket: --force over a site, keeping what it replaces
duckdown report [file]        the view log made into reports/ for the editors
duckdown upgrade [tag]        this site onto another tag of duckdown, its export compared
duckdown images               the narrower widths of pictures already in static/images/`;

const help = async () => {
  console.log(USAGE);
  return 0;
};

// Loaded when asked for, not at the top: the server's modules read the
// environment as they load, and `init` runs where there is no site yet.
const commands: Record<string, (args: string[]) => Promise<number>> = {
  user: async (args) => (await import("./users")).userCommand(args),
  publish: async (args) => (await import("./remote")).remoteCommand("publish", args),
  pull: async (args) => (await import("./remote")).remoteCommand("pull", args),
  report: async (args) => (await import("./report")).reportCommand(args),
  upgrade: async (args) => (await import("./upgrade")).upgradeCommand(args),
  images: async () => (await import("./widths")).imagesCommand(),
  translations: async (args) => (await import("./translations")).translationsCommand(args),
  bucket: async (args) => (await import("./bucket")).bucketCommand(args),
  help, "--help": help, "-h": help,
};

// `--deploy up` (or `--deploy=up`): how the site reaches Railway.
function deployOf(args: string[]): Deploy {
  const flat = args.flatMap((arg) => (arg.startsWith("--deploy=") ? ["--deploy", arg.slice("--deploy=".length)] : [arg]));
  const at = flat.indexOf("--deploy");
  if (at < 0) return "github";
  const value = flat[at + 1];
  if (value !== "github" && value !== "up") throw new Error(`--deploy is github (the default) or up (railway up), not ${value ?? "nothing"}`);
  return value;
}

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
    const { wrote, skipped } = await scaffold(cwd, { vendored: false, deploy: deployOf(argv.slice(1)) });
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
