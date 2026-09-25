import type { Storage } from "./storage";
import { createImageStorage } from "./storage";
import { DEBUG } from "./config";
import { kept } from "./kept";
import { WIDTHS, WIDTH_NAME, widthName, imageUrl } from "./images";
import { hidden } from "./listed";

// A picture in static/images/ kept at narrower widths too, so a phone is sent
// the 960 rather than a 4000-pixel original (n162). They are made when a
// picture is uploaded (the Resources images and a collection's pictures) or
// by `duckdown images` for pictures already there, and each folder says in
// its hidden .widths.json which pictures have them and how wide the original
// is. A page's <img> of such a picture then gets a srcset; any other picture
// is drawn exactly as before.

export const MANIFEST = ".widths.json";
export type Widths = Record<string, { width: number; widths: number[] }>;   // a picture's name → its width, and the narrower ones kept

const images = createImageStorage();
const FORMATS = [".jpg", ".jpeg", ".png", ".webp"];   // what Bun.Image reads and writes; SVG needs none

const folderOf = (key: string) => (key.includes("/") ? key.slice(0, key.lastIndexOf("/")) : "");
const manifestKey = (folder: string) => (folder ? `${folder}/${MANIFEST}` : MANIFEST);

async function manifestOf(store: Storage, folder: string): Promise<Widths> {
  const key = manifestKey(folder);
  return await store.exists(key) ? JSON.parse(await store.read(key)) as Widths : {};
}

// Makes a picture's narrower widths beside it and says so in its folder's
// manifest. The widths made, none for a picture already narrow, or one this
// can't read.
export async function makeWidths(key: string, bytes: Uint8Array, store: Storage = images): Promise<number[]> {
  const ext = key.slice(key.lastIndexOf(".")).toLowerCase();
  if (!FORMATS.includes(ext) || WIDTH_NAME.test(key)) return [];
  const meta = await new Bun.Image(bytes).metadata().catch(() => null);
  if (!meta) return [];
  const made: number[] = [];
  for (const width of WIDTHS.filter((w) => w < meta.width)) {
    const narrower = new Bun.Image(bytes).resize(width);
    const encoded = ext === ".png" ? narrower.png() : ext === ".webp" ? narrower.webp({ quality: 80 }) : narrower.jpeg({ quality: 82 });
    const out = new Uint8Array(await encoded.bytes());
    // Narrower but no smaller (an original saved at a lower quality than this
    // one): not worth offering — a phone would be sent more, not less.
    if (out.length >= bytes.length) continue;
    await store.write(widthName(key, width), out);
    made.push(width);
  }
  const folder = folderOf(key);
  const manifest = await manifestOf(store, folder);
  const name = key.slice(folder ? folder.length + 1 : 0);
  if (made.length) manifest[name] = { width: meta.width, widths: made };
  else delete manifest[name];
  await store.write(manifestKey(folder), JSON.stringify(manifest, null, 1));
  return made;
}

// Every picture under static/images/ without its widths yet: what `duckdown
// images` makes. Says what it made.
export async function makeMissingWidths(say: (line: string) => void, store: Storage = images, prefix = ""): Promise<number> {
  const { files, folders } = await store.list(prefix);
  const manifest = await manifestOf(store, prefix);
  let made = 0;
  for (const f of files) {
    if (hidden(f.name) || WIDTH_NAME.test(f.name) || manifest[f.name]) continue;
    const widths = await makeWidths(f.path, await store.readBytes(f.path), store);
    if (widths.length) {
      say(`${f.path}: ${widths.join(", ")}`);
      made++;
    }
  }
  for (const folder of folders) if (!hidden(folder.name)) made += await makeMissingWidths(say, store, folder.path);
  return made;
}

// `duckdown images`: the widths for every picture that hasn't them yet.
export async function imagesCommand(say: (line: string) => void = console.log, store: Storage = images): Promise<number> {
  const made = await makeMissingWidths(say, store);
  say(made ? `made the widths of ${made} picture(s)` : "every picture that can have its widths has them");
  return 0;
}

// What a page's pictures need to know, per folder, kept like everything else
// the site knows about itself: an upload calls siteChanged().
const manifests = kept((store, folder) => manifestOf(store, folder));

const IMG = /<img\b[^>]*?\bsrc="\/static\/images\/([^"]+)"[^>]*>/g;

// A srcset on each <img> of a picture that has its widths. The sizes say
// what the base stylesheet does: as wide as the screen, up to the text's
// 46rem measure.
export async function withWidths(html: string, store: Storage = images, debug = DEBUG): Promise<string> {
  const found = [...html.matchAll(IMG)].filter(([tag]) => !/\bsrcset=/.test(tag));
  if (!found.length) return html;
  const sets = new Map<string, string>();
  for (const [, src] of found) {
    const key = decodeURI(src!);
    const folder = folderOf(key);
    const entry = (await manifests(store, folder, debug))[key.slice(folder ? folder.length + 1 : 0)];
    if (entry) {
      const url = (name: string) => imageUrl("/static/images/", name);
      sets.set(src!, [...entry.widths.map((w) => `${url(widthName(key, w))} ${w}w`), `${url(key)} ${entry.width}w`].join(", "));
    }
  }
  return html.replace(IMG, (tag, src: string) => {
    const set = sets.get(src);
    return set && !/\bsrcset=/.test(tag) ? tag.replace(/^<img\b/, `<img srcset="${set}" sizes="(max-width: 46rem) 100vw, 46rem"`) : tag;
  });
}
