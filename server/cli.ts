#!/usr/bin/env bun

// `duckdown` — the server, or one of the commands USAGE lists.

import { parseArgs } from "util";
import { version } from "../package.json";
import { scaffold, type Deploy } from "./init";

export const USAGE = `duckdown                      the server (the editor at /edit)
duckdown create <name> [--deploy up]   a new site in <name>/, on the newest release of duckdown, committed
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
const commands: Record<string, (args: string[], cwd: string) => Promise<number>> = {
  create: async (args, cwd) => (await import("./create")).createCommand(args[0], { deploy: deployOf(args.slice(1)), cwd }),
  init: async (args, cwd) => {
    const { wrote, skipped } = await scaffold(cwd, { vendored: false, deploy: deployOf(args) });
    for (const path of wrote) console.log(`wrote ${path}`);
    for (const path of skipped) console.log(`left alone: ${path}`);
    console.log("\nNext: bun install, then bun run dev, and open http://localhost:8080/edit (admin/admin).");
    return 0;
  },
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
  const { deploy = "github" } = parseArgs({ args, options: { deploy: { type: "string" } }, strict: false, allowPositionals: true }).values;
  if (deploy !== "github" && deploy !== "up") throw new Error(`--deploy is github (the default) or up (railway up), not ${typeof deploy === "string" ? deploy : "nothing"}`);
  return deploy;
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
      return await command(argv.slice(1), cwd);
    } catch (e) {
      console.error(`duckdown ${argv[0]}: ${(e as Error).message}`);
      return 1;
    }
  }
  // The server takes no arguments, so anything else is a command this version
  // doesn't have — a typo, or one from a newer duckdown — never the server.
  if (argv[0] !== undefined) {
    console.error(`duckdown: ${argv[0]} isn't a command here (duckdown ${version}); duckdown --help lists them`);
    return 1;
  }
  await start();   // the server keeps the process alive from here
  return 0;
}

// Only when run, never on import: the tests call cli() directly.
if (import.meta.main) process.exitCode = await cli(process.argv.slice(2));
