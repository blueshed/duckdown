import { resolve, join, extname, dirname, sep } from "path";
import { readdir, stat, readFile, writeFile, unlink, mkdir } from "fs/promises";
import { existsSync, cpSync } from "fs";
import { S3Client } from "bun";
import {
  IS_S3, APP_PATH, SEED_PATH, BUCKET, BUCKET_PREFIX, BUCKET_ENDPOINT, BUCKET_REGION,
  PAGE_PATH, STATIC_PATH, IMAGES_PATH,
} from "./config";

// --- Types ---

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

const MIME_TYPES: Record<string, string> = {
  ".md": "text/markdown", ".html": "text/html", ".css": "text/css",
  ".js": "application/javascript", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf",
  ".txt": "text/plain", ".xml": "application/xml",
};

function guessMime(path: string): string {
  return MIME_TYPES[extname(path).toLowerCase()] || "application/octet-stream";
}

// --- Local filesystem ---

function safePath(base: string, userPath: string): string {
  const resolved = resolve(base, userPath);
  // Inside the root, not merely sharing its prefix: "…/pages-old" must not
  // pass for "…/pages".
  const root = resolve(base);
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    throw new Error("Path traversal denied");
  }
  return resolved;
}

export class LocalStorage implements Storage {
  constructor(private root: string) {}

  async list(prefix: string): Promise<Listing> {
    const dirPath = safePath(this.root, prefix);
    const files: FileEntry[] = [];
    const folders: FolderEntry[] = [];

    if (!existsSync(dirPath)) return { files, folders };

    const entries = await readdir(dirPath, { withFileTypes: true });
    const rootLen = resolve(this.root).length;

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = join(dirPath, entry.name);
      const relPath = fullPath.substring(rootLen);

      if (entry.isFile()) {
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
    const fullPath = safePath(this.root, key);
    return readFile(fullPath, "utf-8");
  }

  async readBytes(key: string): Promise<Uint8Array> {
    const fullPath = safePath(this.root, key);
    return new Uint8Array(await readFile(fullPath));
  }

  async write(key: string, body: string | Uint8Array): Promise<void> {
    const fullPath = safePath(this.root, key);
    const dir = dirname(fullPath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(fullPath, body);
  }

  async remove(key: string): Promise<void> {
    const fullPath = safePath(this.root, key);
    await unlink(fullPath);
  }

  async exists(key: string): Promise<boolean> {
    if (!key) return false;
    const fullPath = safePath(this.root, key);
    return existsSync(fullPath) && (await stat(fullPath)).isFile();
  }

  mime(key: string): string {
    return guessMime(key);
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
    const fullPrefix = this.key(prefix ? `${prefix}/` : "");
    const result = await this.client.list({ prefix: fullPrefix, delimiter: "/" });

    // With a delimiter, deeper keys come back as commonPrefixes; the only key
    // to skip is a folder marker (an object named exactly the prefix).
    const files: FileEntry[] = (result.contents || [])
      .filter((obj) => obj.key !== fullPrefix)
      .map((obj) => {
        const name = obj.key.slice(fullPrefix.length);
        return {
          name,
          path: `/${obj.key.slice(this.prefix.length)}`,
          file: true as const,
          size: obj.size || 0,
          type: guessMime(name),
        };
      });

    const folders: FolderEntry[] = (result.commonPrefixes || []).map((p) => {
      const name = p.prefix.slice(fullPrefix.length).replace(/\/$/, "");
      return {
        name,
        path: `/${p.prefix.slice(this.prefix.length).replace(/\/$/, "")}`,
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

  async write(key: string, body: string | Uint8Array): Promise<void> {
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
}

// --- Dev seed ---

// Local dev: the first run copies DUCKDOWN_SEED into DUCKDOWN_PATH, so the
// editor works on a copy and never changes the seed site itself.
export function seedLocalSite(seed = SEED_PATH, target = APP_PATH, s3 = IS_S3): void {
  if (s3 || !seed || existsSync(target)) return;
  cpSync(seed, target, { recursive: true });
  console.log(`seeded ${target} from ${seed}`);
}

// --- Factory ---

// Storage rooted at a sub-path of the site (pages/, static/, …), on S3 or disk.
export function storageAt(sub = "", s3 = IS_S3): Storage {
  if (s3) return new S3Storage(BUCKET, BUCKET_PREFIX + sub, BUCKET_ENDPOINT, BUCKET_REGION);
  return new LocalStorage(join(APP_PATH, sub));
}

export const createStorage = () => storageAt();
export const createPageStorage = () => storageAt(PAGE_PATH);
export const createStaticStorage = () => storageAt(STATIC_PATH);
export const createImageStorage = () => storageAt(IMAGES_PATH);
