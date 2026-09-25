import { createStorage, type Storage } from "./storage";
import { USERS_PATH } from "./config";

// Who can sign in: users.json at the site root, a name and an argon2 hash
// each — { "admin": "$argon2id$…" } — in none of the folders the editor edits,
// so no hash ever reaches a browser. Its shape never changes: an older
// duckdown can read a file a newer one wrote, so going back a version never
// locks anybody out.
//
// A session is signed with the site's secret and carries a fingerprint of the
// hash its user had when they signed in (fingerprint(), below). A new password
// is a new hash, and a removed user has none, so either ends every session
// made before it — without a list of sessions, and without a new field in the
// file. A session from before fingerprints (0.8 and earlier) has none, and is
// good until it expires, as it always was.

export type Users = Record<string, string>;

// The names, as a table with nothing in it but them. Parsed JSON is a plain
// object, so users["constructor"] or users["__proto__"] would find Object's
// own properties and read as someone who can sign in (n118): with no
// prototype, a name is there only when the file says so. The file's shape
// doesn't change — it is written and read as the same JSON.
export const usersFrom = (entries: object = {}): Users => Object.assign(Object.create(null), entries);

const site = createStorage();

// No users file means nobody can sign in: said in the log, rather than every
// attempt looking like a wrong password. A broken one throws, for the caller
// to say what it means where it is.
export async function readUsers(store: Storage = site): Promise<Users> {
  if (!(await store.exists(USERS_PATH))) {
    console.error(`No ${USERS_PATH} in the site folder, so nobody can sign in.`);
    return usersFrom();
  }
  return usersFrom(JSON.parse(await store.read(USERS_PATH)));
}

export async function writeUsers(users: Users, store: Storage = site): Promise<void> {
  await store.write(USERS_PATH, JSON.stringify(users, null, 2) + "\n");
  usersChanged();
}

// Every signed-in request asks who its user is, and a page view with a cookie
// is one: on a bucket that would be a GET each. So what was read is kept for
// a few seconds, and dropped at once when this server writes the file. A
// change made outside it (`duckdown user`, or an edit by hand) takes effect
// within FRESH.
export const FRESH = 5000;
let kept: { at: number; users: Promise<Users> } | null = null;

export function currentUsers(store: Storage = site, now = Date.now()): Promise<Users> {
  if (kept && now - kept.at < FRESH) return kept.users;
  kept = { at: now, users: readUsers(store) };
  return kept.users;
}

export function usersChanged(): void {
  kept = null;
}

// What a session knows of its user's password: enough to tell that it has
// changed, and nothing that helps anyone guess it. The session is signed, so
// it can't be forged either.
export const fingerprint = (hash: string) =>
  new Bun.CryptoHasher("sha256").update(hash).digest("base64url").slice(0, 16);

// A name is what someone signs in with — "admin", or an email address: no
// spaces, and not a paragraph. A password set here is eight characters or
// more; the environment's admin is the platform's business.
export const NAME = /^\S{1,100}$/;
export const MIN_PASSWORD = 8;

export function nameProblem(name: unknown): string | null {
  return typeof name === "string" && NAME.test(name) ? null : "A name is one word — no spaces — of up to 100 characters";
}

export function passwordProblem(password: unknown): string | null {
  return typeof password === "string" && password.length >= MIN_PASSWORD
    ? null
    : `A password is at least ${MIN_PASSWORD} characters`;
}

// The user DUCKDOWN_ADMIN_PASSWORD sets at every start, or null. The editor
// can't change or remove them: the next restart would put them back.
export function envAdmin(env: Record<string, string | undefined> = process.env): string | null {
  return env.DUCKDOWN_ADMIN_PASSWORD ? env.DUCKDOWN_ADMIN_USER || "admin" : null;
}

// --- duckdown user ------------------------------------------------------

// A password from the terminal, not echoed; or the first line of what is
// piped in (`echo … | duckdown user add ann`). Never an argument, where it
// would sit in the shell's history and the process list.
export async function askPassword(
  question: string,
  input: NodeJS.ReadStream = process.stdin,
  output: { write(text: string): unknown } = process.stderr,
): Promise<string> {
  output.write(question);
  const tty = Boolean(input.isTTY);
  if (tty) input.setRawMode(true);
  let typed = "";
  try {
    for await (const chunk of input) {
      for (const ch of String(chunk)) {
        if (ch === "\r" || ch === "\n") return typed;
        if (ch === "\u0003") throw new Error("cancelled");
        typed = ch === "\u007f" || ch === "\b" ? typed.slice(0, -1) : typed + ch;
      }
    }
    return typed;
  } finally {
    if (tty) input.setRawMode(false);
    output.write("\n");
  }
}

const USAGE = "duckdown user list | add <name> | passwd <name> | remove <name>";

// Who can sign in, for a site with no server running (or before the first
// editor exists): the same users.json the editor's Editors dialog changes,
// through the same storage, on disk or in a bucket. A server that is running
// sees the change within FRESH.
export async function userCommand(
  args: string[],
  ask: (question: string) => Promise<string> = askPassword,
  store: Storage = site,
  say: (line: string) => void = console.log,
): Promise<number> {
  const [verb, name] = args;
  // No file yet is a site whose first editor this is, not a problem to report.
  const users = (await store.exists(USERS_PATH)) ? await readUsers(store) : usersFrom();
  if (verb === "list") {
    for (const known of Object.keys(users).sort()) say(known);
    return 0;
  }
  if (!["add", "passwd", "remove"].includes(verb ?? "") || !name) throw new Error(`usage: ${USAGE}`);
  const problem = nameProblem(name);
  if (problem) throw new Error(problem);
  if (verb === "add" && users[name]) throw new Error(`${name} can already sign in`);
  if (verb !== "add" && !users[name]) throw new Error(`No one called ${name} can sign in`);
  if (verb === "remove") {
    delete users[name];
    await writeUsers(users, store);
    say(`${name} removed: they can't sign in, and any session they had has ended`);
    return 0;
  }
  const password = await ask(`Password for ${name}: `);
  const weak = passwordProblem(password);
  if (weak) throw new Error(weak);
  users[name] = await Bun.password.hash(password);
  await writeUsers(users, store);
  say(verb === "add" ? `${name} can sign in` : `${name}'s password changed: their other sessions have ended`);
  return 0;
}
