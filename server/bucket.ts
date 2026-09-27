// `duckdown bucket pull|push [folder]`: a served site's content, between the
// bucket it lives in and a folder here. Run it with the site's environment —
// `railway run --service <name> bunx duckdown bucket pull` — which names the
// bucket and its keys for the length of the run and no longer.
//
// pull brings the site home: every file the bucket has that the folder
// doesn't hold the same, written into the folder, so git and duckdown
// upgrade's before-and-after export see what is live. Nothing is deleted: a
// file only the folder has is listed, to remove by hand if it was deleted at
// /edit. push goes the other way, and is the dangerous one — it replaces what
// someone wrote at /edit — so it refuses a bucket that already has a site
// unless told (--force), keeps each file it replaces in .history/ first,
// where Earlier versions and Restore find it, and deletes nothing.
//
// Either way users.json (the passwords' hashes), .history/ and reports/ stay
// where they are: they are the running site's, not its content.

import { resolve } from "path";
import { History, HISTORY_PATH } from "./history";
import { LocalStorage, S3Storage } from "./storage";
import { PAGE_PATH, REPORTS_PATH, USERS_PATH } from "./config";

const INDEX = `${PAGE_PATH}index.md`;
export const stays = (key: string) => key === USERS_PATH || key.startsWith(HISTORY_PATH) || key.startsWith(REPORTS_PATH);
const junk = (key: string) => key.split("/").at(-1) === ".DS_Store";
const same = (a: Uint8Array, b: Uint8Array) => Buffer.from(a).equals(Buffer.from(b));

export type Store = Pick<LocalStorage, "keys" | "readBytes" | "write" | "exists">;
type Say = (line: string) => void;

export async function pull(bucket: Store, folder: Store, say: Say): Promise<number> {
  const keys = await bucket.keys();
  if (!keys.includes(INDEX)) throw new Error(`the bucket has no ${INDEX} (${keys.length} files): nothing was written`);
  const content = keys.filter((k) => !stays(k) && !junk(k));
  let written = 0;
  for (const key of content) {
    const body = await bucket.readBytes(key);
    if ((await folder.exists(key)) && same(await folder.readBytes(key), body)) continue;
    await folder.write(key, body);
    say(`  ${key}`);
    written++;
  }
  const there = new Set(keys);
  const only = (await folder.keys()).filter((k) => !there.has(k) && !stays(k) && !junk(k));
  say(`${written} of ${content.length} files changed from the bucket.`);
  if (only.length) {
    say("Here but not in the bucket (remove them if they were deleted at /edit):");
    for (const key of only) say(`  ${key}`);
  }
  return written;
}

// `keep(section)` is the history a file of that section (pages/, templates/,
// static/, or "" at the root) is kept in, as the editor keeps it.
export async function push(bucket: Store, folder: Store, force: boolean, say: Say, keep: (section: string) => History): Promise<number> {
  const keys = (await folder.keys()).filter((k) => !stays(k) && !junk(k));
  if (!keys.includes(INDEX)) throw new Error(`the folder has no ${INDEX}: nothing was sent`);
  if (!force && (await bucket.exists(INDEX))) {
    throw new Error(`the bucket has a site already, and what is written at /edit lives only there: pull it first, or push --force to replace what differs (each file replaced is kept in ${HISTORY_PATH}, where Restore finds it)`);
  }
  let written = 0;
  for (const key of keys) {
    const body = await folder.readBytes(key);
    if (await bucket.exists(key)) {
      const was = await bucket.readBytes(key);
      if (same(was, body)) continue;
      const cut = key.indexOf("/") + 1;
      await keep(key.slice(0, cut)).save(key.slice(cut), was, true);
    }
    await bucket.write(key, body);
    say(`  ${key}`);
    written++;
  }
  say(`${written} of ${keys.length} files sent to the bucket; nothing in it was deleted.`);
  return written;
}

export async function bucketCommand(
  args: string[],
  o: { env?: Record<string, string | undefined>; say?: Say; cwd?: string; credentials?: { accessKeyId?: string; secretAccessKey?: string } } = {},
): Promise<number> {
  const { env = process.env, say = console.log, cwd = process.cwd(), credentials } = o;
  const [how, ...rest] = args;
  if (how !== "pull" && how !== "push") throw new Error("say which: duckdown bucket pull [folder], or push [folder] [--force]");
  // The folder named, else the one a served site seeded its bucket from, else the one it edits.
  const dir = rest.find((a) => !a.startsWith("--")) ?? env.DUCKDOWN_SEED ?? env.DUCKDOWN_PATH;
  if (!dir) throw new Error("which folder? name it, or set DUCKDOWN_SEED or DUCKDOWN_PATH");
  const name = env.DUCKDOWN_BUCKET;
  if (!name) throw new Error(`no DUCKDOWN_BUCKET here: run it with the site's environment, as \`railway run --service <name> bunx duckdown bucket ${how}\``);
  const prefix = env.DUCKDOWN_PREFIX ?? "";
  const at = (sub: string) => new S3Storage(name, prefix + sub, env.DUCKDOWN_ENDPOINT ?? "", env.DUCKDOWN_REGION || "us-east-1", credentials);
  const folder = new LocalStorage(resolve(cwd, dir));
  if (how === "pull") {
    say(`s3://${name}/${prefix} into ${dir}:`);
    await pull(at(""), folder, say);
  } else {
    say(`${dir} into s3://${name}/${prefix}:`);
    await push(at(""), folder, rest.includes("--force"), say, (section) => new History(at(`${HISTORY_PATH}${section}`)));
  }
  return 0;
}
