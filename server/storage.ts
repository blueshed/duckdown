import { resolve, join, dirname, basename, relative, sep } from "path";
import { readdir, stat, lstat, writeFile, unlink, mkdir, rename } from "fs/promises";
import { existsSync, cpSync, realpathSync, lstatSync, statSync, openSync, fstatSync, closeSync, constants } from "fs";
import { S3Client } from "bun";
import {
  IS_S3, APP_PATH, SEED_PATH, BUCKET, BUCKET_PREFIX, BUCKET_ENDPOINT, BUCKET_REGION,
  PAGE_PATH, STATIC_PATH, IMAGES_PATH, TEMPLATES_PATH, REPORTS_PATH, USERS_PATH,
} from "./config";
import { HISTORY_PATH } from "./history";
import { BadRequest } from "./utils";

// --- Types ---

// `path` is the entry's key in its storage ("guide/pages.md"), ready to read,
// list or put in a URL after a slash.
export interface FileEntry {
  name: string;
  path: string;
  file: true;
  size: number;
  type: string;
}

export interface FolderEntry {
  name: string;
  path: string;
  file: false;
}

export interface Listing {
  files: FileEntry[];
  folders: FolderEntry[];
}

export interface Storage {
  list(prefix: string): Promise<Listing>;
  read(key: string): Promise<string>;
  readBytes(key: string): Promise<Uint8Array>;
  write(key: string, body: string | Uint8Array): Promise<void>;
  remove(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  mime(key: string): string;
}

// --- MIME ---

// Bun's own table, by the name alone (Bun.file reads nothing until asked):
// the one the published server answers with, since serve.ts hands out a
// Bun.file, so the two can't disagree. duckdown kept a table of its own,
// which had no WebP or AVIF (n176).
function guessMime(path: string): string {
  return Bun.file(path).type;
}

// --- Local filesystem ---

// Inside the root, not merely sharing its prefix: "…/pages-old" must not
// pass for "…/pages".
function inside(root: string, path: string): boolean {
  return path === root || path.startsWith(root + sep);
}

// A key names a file: never the root, nor a folder, asked with its slash or
// (on disk, once it is one) without. On disk a write there failed half-way
// and left its temporary file beside it; a bucket took the name as a file
// beside the folder of that name, which no disk can hold.
const folderKey = (key: string) => !key.replace(/^\/+/, "") || key.endsWith("/");
const notAFile = (key: string) => new BadRequest(`${key || "/"} is a folder, not a file`);

// A key's leading slash is no part of it — as a bucket takes it (n169) —
// not a way to name the machine's root. A key that climbs out is the
// asking's fault, not ours: a 400, where every scanner's /static/..%2F…
// was a 500 with a stack in the log.
function safePath(base: string, userPath: string): string {
  const resolved = resolve(base, userPath.replace(/^\/+/, ""));
  if (!inside(resolve(base), resolved)) throw new BadRequest("Path traversal denied");
  return resolved;
}

// Where a path really is, through every link on the way. What isn't there
// yet is where its folder really is, and its name: a new file is judged by
// the folder it would be written into.
function real(path: string): string {
  if (existsSync(path)) return realpathSync(path);
  const folder = dirname(path);
  return folder === path ? path : join(real(folder), basename(path));
}

// What no link may lead to, from any section or from the whole site: the
// users' hashes, the history, the reports — the three `duckdown bucket` leaves
// where they are. Each is read by its own name or not at all: a folder's
// files, and the folder itself, which a link to it would list.
const BY_NAME = [USERS_PATH, HISTORY_PATH, REPORTS_PATH];
const byName = (key: string) => BY_NAME.find((name) => key === name.replace(/\/$/, "") || (name.endsWith("/") && key.startsWith(name)));

// A link left out, or a section refused, said once each rather than at every
// walk of the site (n172).
const said = new Set<string>();
function sayOnce(line: string): void {
  if (said.has(line)) return;
  said.add(line);
  console.warn(line);
}

export class LocalStorage implements Storage {
  // `site` is the folder every link is judged against, whichever section this
  // is: the site's for a storage inside it (storageAt, bucket.ts, remote.ts),
  // else this storage's own root.
  constructor(private root: string, private site = inside(APP_PATH, resolve(root)) ? APP_PATH : root) {}

  // The site's folder, really: kept once it is there, since every judgement
  // asks and a realpath is most of what one costs.
  private realSite = "";
  private siteReally(): string {
    if (this.realSite) return this.realSite;
    const site = real(this.site);
    if (existsSync(this.site)) this.realSite = site;
    return site;
  }

  // Whether a link is on the way from the site's folder down to this path.
  private throughLink(path: string): boolean {
    const site = resolve(this.site);
    for (let at = resolve(path); at !== site && inside(site, at); at = dirname(at)) {
      if (lstatSync(at, { throwIfNoEntry: false })?.isSymbolicLink()) return true;
    }
    return false;
  }

  // Where a path really is, and why the site may not go there ("" when it
  // may), judged against the one site every section is in (n172, after
  // review). The section must be the site's own folder of that name: one
  // that is a link made its target the root, and served it — keys and all.
  // Past that, a link may lead anywhere in the site, pages/ to static/ say,
  // but not out of it, not to what is read only by its own name, and not to
  // the site's own folder, whose listing names users.json and its size.
  private judge(path: string): { to: string; why: string } {
    const to = real(path);
    if (this.throughLink(this.root)) {
      sayOnce(`${this.root} is a link, and a section of the site is read only from its own folder there: nothing in it is read, listed or written`);
      return { to, why: "in a section that is a link" };
    }
    const site = this.siteReally();
    if (!inside(site, to)) return { to, why: "out of the site" };
    const key = relative(site, to).split(sep).join("/");
    const name = key && byName(key);
    const why = !key ? "to the site's own folder" : name ? `to ${name}, which is read only by its own name` : "";
    return { to, why: why && this.throughLink(path) ? why : "" };
  }

  // Where a key is on disk: never out of the site, by ".." or through a link.
  private at(key: string): string {
    const fullPath = safePath(this.root, key);
    if (this.judge(fullPath).why) throw new Error("Path traversal denied");
    return fullPath;
  }

  // A file's bytes, from the very file that was judged. It is opened, then
  // judged by where the one opened really is — the file there must be the
  // one held open (its device and inode) — because a link swapped between a
  // check and a read handed over whatever it led to by then: SECRET 2,431
  // times in 2.8 seconds, in review. It is judged before it is opened, too,
  // and must be a file: a named pipe is opened only once something writes to
  // it, and a link out to one froze the whole server until it was killed. It
  // is opened without waiting, so one swapped in between is refused, not
  // waited on. Opened and closed by descriptor, which costs a fifth of a
  // FileHandle; the read itself is not in the way.
  private async opened(key: string): Promise<Uint8Array> {
    const fullPath = this.at(key);
    if (!statSync(fullPath).isFile()) throw new Error(`${key} is not a file`);
    const fd = openSync(fullPath, constants.O_RDONLY | constants.O_NONBLOCK);
    try {
      const { to, why } = this.judge(fullPath);
      const [held, there] = [fstatSync(fd), why ? null : lstatSync(to)];   // gone since: a miss
      if (!there || !held.isFile() || there.ino !== held.ino || there.dev !== held.dev) throw new Error("Path traversal denied");
      return await Bun.file(fd).bytes();
    } finally {
      closeSync(fd);
    }
  }

  // Whether a walk takes this entry: anything but a link, and a link only to
  // a file in the site, which it then is — as a bucket holds it, once pushed,
  // a copy (n172). Not one out of the site, which would be a way out of it;
  // not one to what is read only by its own name; not one to a folder, since
  // two such can send a walk round forever; not one to nothing. Each of those
  // is said, where a page used to vanish from the nav, the listings and the
  // export without a word.
  private async follows(path: string): Promise<boolean> {
    if (!(await lstat(path)).isSymbolicLink()) return true;
    const to = await stat(path).catch(() => null);   // a link to nothing has nothing to stat
    const why = !to ? "to nothing" : this.judge(path).why || (to.isDirectory() ? "to a folder" : to.isFile() ? "" : "to what is not a file");
    if (why) sayOnce(`${path} is a link ${why}: duckdown lists only a link to a file in the site, so this one is left out`);
    return !why;
  }

  async list(prefix: string): Promise<Listing> {
    const dirPath = safePath(this.root, prefix);
    const files: FileEntry[] = [];
    const folders: FolderEntry[] = [];

    // A folder the site may not go into lists as a bucket's does, which has
    // nothing there.
    if (!existsSync(dirPath) || this.judge(dirPath).why) return { files, folders };

    const entries = await readdir(dirPath, { withFileTypes: true });
    const rootLen = resolve(this.root).length;

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = join(dirPath, entry.name);
      const relPath = fullPath.substring(rootLen + 1);   // past the root and its slash

      if (entry.isFile() || (entry.isSymbolicLink() && await this.follows(fullPath))) {
        const s = await stat(fullPath);
        files.push({
          name: entry.name, path: relPath, file: true,
          size: s.size, type: guessMime(entry.name),
        });
      } else if (entry.isDirectory()) {
        folders.push({ name: entry.name, path: relPath, file: false });
      }
    }
    return { files, folders };
  }

  async read(key: string): Promise<string> {
    return Buffer.from(await this.opened(key)).toString("utf-8");   // as readFile had it: a BOM kept
  }

  async readBytes(key: string): Promise<Uint8Array> {
    return this.opened(key);
  }

  // Written beside the file and moved onto it, because a write is not the
  // only thing happening: a reader — the site, the editor's preview — can ask
  // for the same key mid-write and would otherwise be handed half a file. The
  // collection pane writes on every change, so "a few times a day" becomes
  // "while you are watching". Rename within a folder is atomic; the temporary
  // name starts with a dot, so nothing lists it if a crash leaves one behind.
  // Written to, a link becomes a file of its own: the rename replaces the
  // link, never what it led to. A folder is refused before anything is
  // written, and a rename that fails anyway (a folder made there meanwhile)
  // takes the temporary file with it: keys() lists . names, so `duckdown
  // bucket push` and a git Publish would carry it.
  async write(key: string, body: string | Uint8Array): Promise<void> {
    const fullPath = this.at(key);
    if (folderKey(key) || lstatSync(fullPath, { throwIfNoEntry: false })?.isDirectory()) throw notAFile(key);
    const dir = dirname(fullPath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    const temp = join(dir, `.${basename(fullPath)}.${Math.random().toString(36).slice(2)}.tmp`);
    await writeFile(temp, body);
    try {
      await rename(temp, fullPath);
    } catch (e) {
      await unlink(temp);
      throw e;
    }
  }

  async remove(key: string): Promise<void> {
    const fullPath = this.at(key);
    await unlink(fullPath);
  }

  async exists(key: string): Promise<boolean> {
    if (!key) return false;
    const fullPath = safePath(this.root, key);
    return existsSync(fullPath) && !this.judge(fullPath).why && (await stat(fullPath)).isFile();
  }

  mime(key: string): string {
    return guessMime(key);
  }

  // Every file, flat and sorted, . names too: what a copy of the whole site
  // is made of (duckdown bucket), where list() is what a person is shown.
  // The links list() follows, and no other.
  async keys(): Promise<string[]> {
    if (!existsSync(this.root) || this.judge(this.root).why) return [];
    return (await filesUnder(this.root, (path) => this.follows(path))).sort();
  }
}

// --- S3 ---

export class S3Storage implements Storage {
  private client: InstanceType<typeof S3Client>;
  private prefix: string;

  // Credentials default to Bun's own S3_* / AWS_* environment (read at startup).
  constructor(bucket: string, prefix: string, endpoint: string, region: string,
    credentials: { accessKeyId?: string; secretAccessKey?: string } = {}) {
    this.prefix = prefix;
    this.client = new S3Client({
      bucket,
      endpoint: endpoint || undefined,
      region,
      ...credentials,
    });
  }

  private key(path: string): string {
    return this.prefix + path.replace(/^\//, "");
  }

  async list(prefix: string): Promise<Listing> {
    // "news" or "news/": the editor asks for a folder with its slash (so
    // "v1.2" isn't taken for a file), and "news//" is a prefix nothing has —
    // which emptied every folder of vashti's bucket in the tree.
    const folder = prefix.replace(/\/+$/, "");
    const fullPrefix = this.key(folder ? `${folder}/` : "");
    const result = await this.client.list({ prefix: fullPrefix, delimiter: "/" });

    // With a delimiter, deeper keys come back as commonPrefixes; what to skip
    // is a folder marker (an object named exactly the prefix) and a . name.
    const files: FileEntry[] = (result.contents || [])
      .filter((obj) => obj.key !== fullPrefix)
      // A . name is listed nowhere, as on disk (n169): .widths.json, .history.
      .filter((obj) => !obj.key.slice(fullPrefix.length).startsWith("."))
      .map((obj) => {
        const name = obj.key.slice(fullPrefix.length);
        return {
          name,
          path: obj.key.slice(this.prefix.length),
          file: true as const,
          size: obj.size || 0,
          type: guessMime(name),
        };
      });

    const folders: FolderEntry[] = (result.commonPrefixes || []).filter((p) => !p.prefix.slice(fullPrefix.length).startsWith(".")).map((p) => {
      const name = p.prefix.slice(fullPrefix.length).replace(/\/$/, "");
      return {
        name,
        path: p.prefix.slice(this.prefix.length).replace(/\/$/, ""),
        file: false as const,
      };
    });

    return { files, folders };
  }

  async read(key: string): Promise<string> {
    return this.client.file(this.key(key)).text();
  }

  async readBytes(key: string): Promise<Uint8Array> {
    return this.client.file(this.key(key)).bytes();
  }

  // A folder is a prefix something is under, or a folder marker.
  async write(key: string, body: string | Uint8Array): Promise<void> {
    if (folderKey(key) || (await this.client.list({ prefix: `${this.key(key)}/`, maxKeys: 1 })).contents?.length) throw notAFile(key);
    await this.client.write(this.key(key), body);
  }

  async remove(key: string): Promise<void> {
    await this.client.delete(this.key(key));
  }

  async exists(key: string): Promise<boolean> {
    return this.client.exists(this.key(key));
  }

  mime(key: string): string {
    return guessMime(key);
  }

  // Every object under the prefix, flat and sorted, . names too, a page of
  // the listing at a time; a folder marker (a key ending "/") is no file.
  async keys(): Promise<string[]> {
    const found: string[] = [];
    let continuationToken: string | undefined;
    do {
      const page = await this.client.list({ prefix: this.prefix, continuationToken });
      for (const obj of page.contents ?? []) if (!obj.key.endsWith("/")) found.push(obj.key.slice(this.prefix.length));
      continuationToken = page.isTruncated ? page.nextContinuationToken : undefined;
    } while (continuationToken);
    return found.sort();
  }
}

// --- Seeding a new site ---

// Local dev: the first run copies DUCKDOWN_SEED into DUCKDOWN_PATH, so the
// editor works on a copy and never changes the seed site itself.
export function seedLocalSite(seed = SEED_PATH, target = APP_PATH, s3 = IS_S3): void {
  if (s3 || !seed || existsSync(target)) return;
  cpSync(seed, target, { recursive: true });
  console.log(`seeded ${target} from ${seed}`);
}

// Every file under `root`, as keys relative to it and separated by "/", less
// what `follows` turns away: a site's links it doesn't follow (n172). A seed
// is copied whole, through its links.
async function filesUnder(root: string, follows: (path: string) => Promise<boolean> = async () => true, dir = root): Promise<string[]> {
  const found: string[] = [];
  for (const name of await readdir(dir)) {
    const path = join(dir, name);
    if (!(await follows(path))) continue;
    if ((await stat(path)).isDirectory()) found.push(...(await filesUnder(root, follows, path)));
    else found.push(relative(root, path).split(sep).join("/"));
  }
  return found;
}

// The same for a bucket: the first run uploads DUCKDOWN_SEED. Without this a
// fresh deployment serves 404s and nobody can sign in, with nothing in the log
// to say why — the bucket is simply empty. Seeded only when it holds no
// index.md, so it can never overwrite a site someone has been writing.
export async function seedBucketSite(seed = SEED_PATH, store?: Storage, s3 = IS_S3): Promise<number> {
  if (!s3 || !seed) return 0;
  if (!existsSync(seed)) {
    console.error(`DUCKDOWN_SEED is ${seed}, which isn't there: the bucket was left alone.`);
    return 0;
  }
  const site = store ?? storageAt();
  if (await site.exists(`${PAGE_PATH}index.md`)) return 0;

  const keys = await filesUnder(seed);
  for (const key of keys) await site.write(key, await Bun.file(join(seed, key)).bytes());
  console.log(`seeded the bucket from ${seed} (${keys.length} files)`);
  return keys.length;
}

// --- Factory ---

// Storage rooted at a sub-path of the site (pages/, static/, …), on S3 or disk.
export function storageAt(sub = "", s3 = IS_S3): Storage {
  if (s3) return new S3Storage(BUCKET, BUCKET_PREFIX + sub, BUCKET_ENDPOINT, BUCKET_REGION);
  return new LocalStorage(join(APP_PATH, sub), APP_PATH);
}

export const createStorage = () => storageAt();
export const createPageStorage = () => storageAt(PAGE_PATH);
export const createStaticStorage = () => storageAt(STATIC_PATH);
export const createTemplateStorage = () => storageAt(TEMPLATES_PATH);
export const createImageStorage = () => storageAt(IMAGES_PATH);
export const createReportStorage = () => storageAt(REPORTS_PATH);
