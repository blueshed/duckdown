// The environment a git command is run in. git names the repository it works in
// by its working folder — unless these variables say otherwise, and a process
// started from a git hook, an `--exec` of a rebase or an editor's task has them
// set to *its* repository. A command that works in the repository a folder is
// in (remote.ts), or a test that makes one of its own, must not inherit them:
// run from `git rebase --exec`, the suite once wrote its scratch repositories'
// settings into duckdown's own .git/config (n180). It is what
// `git rev-parse --local-env-vars` lists, written out because that is a git to
// run, and this module is read before anything else.
export const REPOSITORY_ENV = [
  "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_COMMON_DIR", "GIT_CONFIG", "GIT_CONFIG_COUNT", "GIT_CONFIG_PARAMETERS",
  "GIT_DIR", "GIT_GRAFT_FILE", "GIT_IMPLICIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_NO_REPLACE_OBJECTS",
  "GIT_OBJECT_DIRECTORY", "GIT_PREFIX", "GIT_REPLACE_REF_BASE", "GIT_SHALLOW_FILE", "GIT_WORK_TREE",
];

// This process's environment without them, and never asking for a password:
// there is nobody at this terminal.
export function gitEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  for (const name of REPOSITORY_ENV) delete env[name];
  return env;
}
