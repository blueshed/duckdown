import type { BunRequest } from "bun";
import { requireAuth } from "../auth";
import { createStaticStorage, createTemplateStorage, createPageStorage, storageAt } from "../storage";
import { History, HISTORY_PATH } from "../history";
import { rootFile } from "../base";
import { ICONS, CARD } from "../icons";
import { siteChanged } from "../kept";
import { parseFrontMatter } from "../markdown";

// /edit/site-icon — the site's icon, set from the editor. The site answers
// two files at its root (base.ts): favicon.ico on a browser tab and
// apple-touch-icon.png on a phone's home screen. Both live in static/ itself,
// where the editor's Upload (static/images/) can't put anything, so this is
// the one way a person in the editor sets them.
//
// The editor makes the pictures, not the server: Bun.Image can't cut a square
// or fill a background, and a browser's canvas can — and reads an SVG, which
// Bun.Image can't either. So what arrives is one PNG per file, already the
// size it should be, and this checks that it is before writing it. What it
// replaces is kept in static's history, like any other save.
//
// Nothing puts these in a page's head: a browser asks the root for them when
// a page names no icon. A template that names one of its own wins, though, so
// the tab would show an icon its readers never see — GET says which templates
// do, and what they name.
//
// ?card is the site's sharing card (icons.ts): the picture a link to the site
// shows when it's shared, for any page that names none of its own. A JPEG,
// 1200×630, made the same way; DELETE takes it away, and the pages go back to
// sharing the home-screen icon. A write here changes what every page shares,
// so it drops what the site knows about itself, as a page's save does.

type IconName = keyof typeof ICONS;
const NAMES = Object.keys(ICONS) as IconName[];

const statics = createStaticStorage();
const pages = createPageStorage();
const templates = createTemplateStorage();
const history = new History(storageAt(`${HISTORY_PATH}static/`));

// Where one is now, with ?v= so a new one isn't hidden by the browser's copy
// of the old; null when the site doesn't have it.
const where = async (name: string) =>
  await statics.exists(name) ? `/static/${name}?v=${Bun.hash(await statics.readBytes(name)).toString(36)}` : null;

async function icons(): Promise<Record<IconName, string | null>> {
  const out = {} as Record<IconName, string | null>;
  for (const name of NAMES) out[name] = await where(name);
  return out;
}

// What a shared link to the front page says under its picture, for the tab
// to draw the card as it will look.
async function home(): Promise<{ title: string; description: string }> {
  const meta = await pages.exists("index.md") ? parseFrontMatter(await pages.read("index.md")).meta : {};
  return { title: meta.title?.[0] ?? "", description: meta.description?.[0] ?? "" };
}

// <link rel="icon">, and the home-screen kind; not Safari's mask-icon, which
// is a pinned tab's outline, not a picture.
const ICON_RELS = new Set(["icon", "shortcut icon", "apple-touch-icon", "apple-touch-icon-precomposed"]);
const LINK = /<link\b[^>]*>/gi;
const ATTR = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;

// Whether a link names one of the two files set here, wherever it names them
// from: the root, static/, or the site's own address.
export function ours(href: string): boolean {
  const path = href.replace(/^[a-z]+:\/\/[^/]+/i, "").replace(/[?#].*$/, "").replace(/^\.?\//, "");
  const name = path.startsWith("static/") ? path.slice("static/".length) : path;
  return rootFile(name) !== null && name !== "robots.txt";
}

// The icons a template names that aren't these two, in the order it names them.
export function otherIcons(html: string): string[] {
  const out: string[] = [];
  for (const [tag] of html.matchAll(LINK)) {
    const attrs = new Map([...tag.matchAll(ATTR)].map((m) => [m[1]!.toLowerCase(), m[2] ?? m[3] ?? m[4] ?? ""]));
    const rel = attrs.get("rel")?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
    const href = attrs.get("href");
    if (ICON_RELS.has(rel) && href && !ours(href)) out.push(href);
  }
  return out;
}

// Each template that names icons of its own, with what it names.
async function elsewhere(): Promise<{ template: string; icons: string[] }[]> {
  const { files } = await templates.list("");
  const out: { template: string; icons: string[] }[] = [];
  for (const { name } of files.filter((f) => f.name.endsWith(".html")).sort((a, b) => a.name.localeCompare(b.name))) {
    const icons = otherIcons(await templates.read(name));
    if (icons.length) out.push({ template: name, icons });
  }
  return out;
}

// What the tab shows: the two icons, any template naming its own, the card.
const answer = async () => ({
  ...(await icons()), elsewhere: await elsewhere(), card: await where(CARD.name), home: await home(),
});

// Why these bytes aren't the picture they're sent as, or null when they are.
async function wrong(name: string, bytes: Uint8Array, format: "png" | "jpeg", width: number, height: number): Promise<string | null> {
  const meta = await new Bun.Image(bytes).metadata().catch(() => null);
  if (meta?.format !== format) return `${name} wasn't sent as a ${format === "png" ? "PNG" : "JPEG"}`;
  if (meta.width !== width || meta.height !== height) {
    return `${name} should be ${width}×${height}, and was ${meta.width}×${meta.height}`;
  }
  return null;
}

// Keep what was there, as any save does, then write.
async function put(name: string, bytes: Uint8Array): Promise<void> {
  if (await statics.exists(name)) await history.save(name, await statics.readBytes(name), true);
  await statics.write(name, bytes);
}

export const handleSiteIcon = {
  async GET(req: BunRequest) {
    const denied = await requireAuth(req);
    if (denied) return denied;
    return Response.json(await answer());
  },

  // The icons: both or neither — a tab and a home screen showing two
  // different icons is worse than either one old. With ?card, the card.
  async POST(req: BunRequest) {
    const denied = await requireAuth(req);
    if (denied) return denied;
    const form = await req.formData();
    const card = new URL(req.url).searchParams.has("card");
    const wanted: [string, "png" | "jpeg", number, number][] = card
      ? [[CARD.name, "jpeg", CARD.width, CARD.height]]
      : NAMES.map((name) => [name, "png", ICONS[name], ICONS[name]]);
    const sent = new Map<string, Uint8Array>();
    for (const [name, format, width, height] of wanted) {
      const file = form.get(name);
      if (!(file instanceof File)) return new Response(`No ${name} was sent`, { status: 400 });
      const bytes = new Uint8Array(await file.arrayBuffer());
      const why = await wrong(name, bytes, format, width, height);
      if (why) return new Response(why, { status: 422 });
      sent.set(name, bytes);
    }
    for (const [name, bytes] of sent) await put(name, bytes);
    siteChanged();
    return Response.json(await answer());
  },

  // ?card only: the icons are never taken away, only replaced.
  async DELETE(req: BunRequest) {
    const denied = await requireAuth(req);
    if (denied) return denied;
    if (!new URL(req.url).searchParams.has("card")) return new Response("Only the card can be taken away", { status: 400 });
    if (await statics.exists(CARD.name)) {
      await history.save(CARD.name, await statics.readBytes(CARD.name), true);
      await statics.remove(CARD.name);
    }
    siteChanged();
    return Response.json(await answer());
  },
};
