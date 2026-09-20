import { existsSync, readFileSync } from "fs";
import { join } from "path";

// `bun create blueshed/duckdown my-site` copies this repository and is meant to
// run create/setup.ts afterwards, which makes site/, writes .env and clears
// away what belongs to developing duckdown itself.
//
// Bun 1.4.2 prints that command and never runs it — any command, not just this
// one: a bare `echo` in bun-create.postinstall prints its own command line and
// produces no output. So a new site can arrive here un-set-up, and the failure
// is quiet: with tests/ still in place, DUCKDOWN_PATH falls back to the example
// site and the owner edits duckdown's seed without knowing it isn't theirs.
//
// A copy made by `bun create` is told apart from this repository by one fact:
// bun strips the "bun-create" key from the package.json it writes.
export function scaffoldNotice(root = process.cwd()): string {
  const manifest = join(root, "package.json");
  if (!existsSync(manifest) || existsSync(join(root, "site"))) return "";
  if (!existsSync(join(root, "create", "setup.ts"))) return "";

  let scaffolded: boolean;
  try {
    scaffolded = !("bun-create" in JSON.parse(readFileSync(manifest, "utf8")));
  } catch {
    return ""; // an unreadable package.json is someone else's problem to report
  }
  if (!scaffolded) return ""; // duckdown's own checkout: nothing to set up

  return [
    "",
    "  This looks like a new site that hasn't been set up yet.",
    "  `bun create` should have done it and didn't (a Bun bug: it prints the",
    "  command and doesn't run it). One command finishes the job:",
    "",
    "      bun run setup",
    "",
    "  Until then there is no site/ of your own and no .env, so duckdown's own",
    "  example site and its development files are all still in place.",
    "",
  ].join("\n");
}
