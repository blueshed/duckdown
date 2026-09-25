import { signal, batch, computed } from "@blueshed/railroad";
import { api, urlPath } from "./api";
import { speak, tell } from "./notice";

// App state as signals
export const filePath = signal<string | null>(null);
export const fileContent = signal("");
export const editorContent = signal("");
export const browserRevision = signal(0);

// Where you are: the folder the tree is showing. The trail above says it and
// walks back up it, and a page opened from anywhere takes the tree to its
// folder, so the two never disagree about where "here" is.
export const folder = signal("");
export const folderOf = (key: string) => (key.includes("/") ? key.slice(0, key.lastIndexOf("/")) : "");

export function openFolder(to: string): void {
  folder.set(to);
}

// A file's name as the trail has already said its folder: "index.md" when it
// is in the folder you are in, and the whole key when it isn't.
export function shortName(key: string): string {
  const here = folder.get();
  return folderOf(key) === here ? key.slice(here ? here.length + 1 : 0) : key;
}

// The drawer at the right: Resources, Editors or Publish, one at a time. Each
// is chosen from the header and leaves the page in view behind it.
export type DrawerName = "resources" | "editors" | "publish";
export const drawer = signal<DrawerName | null>(null);
export const showImages = computed(() => drawer.get() === "resources");

export function toggleDrawer(name: DrawerName): void {
  drawer.update((open) => (open === name ? null : name));
}

export function closeDrawer(): void {
  drawer.set(null);
}

// The tree on the left is the content: pages, and the navigation derived from
// their front matter. Templates and stylesheets are not content — they are what
// a page is composed with — so they are reached from the resource sidebar and
// edited in a pane below the page, against the page you are already looking at.
export type Resource = { section: "templates" | "static"; path: string };

export const resource = signal<Resource | null>(null);
export const resourceSaved = signal("");   // what is on the server
export const resourceDraft = signal("");   // what is in the pane
export const resourceRevision = signal(0); // bumped when the folders change
// The template the preview last put the open page through, as the server
// resolved it: a page's layout: may name one that isn't there, and then it is
// wearing site.html whatever it asked for.
export const pageLayout = signal("");
// Every templates/*.html the page's template pulled in with {{include}},
// alongside pageLayout: a draft template shows in the preview whether the
// page wears it directly or reaches it through one of these.
export const pageIncludes = signal<string[]>([]);
export const resourceDirty = computed(() => resourceDraft.get() !== resourceSaved.get());

// A folder's collection.json, open in the same slot a resource uses: both are
// the one thing below the page, and two of them in a column leaves no room for
// either. The signal carries an object, not the folder's name, because the
// site root's collection lives in a folder called "" and when() swaps on
// truthiness.
export const COLLECTION_FILE = "collection.json";
export const collection = signal<{ folder: string } | null>(null);
// Bumped when the pane writes collection.json: the preview renders the
// overview from it, and nothing else it tracks has changed.
export const collectionRevision = signal(0);

const at = (path: string) => `/edit/pages/${urlPath(path)}`;
const resourceUrl = (r: Resource) => `/edit/${r.section}/${urlPath(r.path)}`;
export const collectionKey = (folder: string) => `${folder ? `${folder}/` : ""}${COLLECTION_FILE}`;

export function openCollection(folder: string): void {
  batch(() => {
    collection.set({ folder });
    closeResource();      // the slot holds one thing
    closeDrawer();
  });
}

export function closeCollection(): void {
  collection.set(null);
}

export function collectionChanged(): void {
  collectionRevision.update((n) => n + 1);
}

// A folder's index page is its collection's overview, so opening one offers
// the collection beneath it — unless you already have something open there,
// which you were presumably looking at on purpose. A page in another folder
// takes the pane away: it belongs to the folder, not to the session.
async function offerCollection(fp: string): Promise<void> {
  const own = folderOf(fp);
  if (collection.peek() && collection.peek()!.folder !== own) closeCollection();
  if (!fp.endsWith("index.md") || resource.peek() || collection.peek()) return;
  const res = await api(`look for ${collectionKey(own)}`, at(collectionKey(own)), undefined, [404]);
  if (res.ok) openCollection(own);
}

// Transient: a resource is open for as long as you are working on it, and the
// page in the middle stays put, so you can click through pages and watch a
// stylesheet against each one.
export async function openResource(next: Resource): Promise<boolean> {
  const res = await api(`open ${next.path}`, resourceUrl(next));
  if (!res.ok) return false;
  const body = await res.text();
  batch(() => {
    resource.set(next);
    resourceSaved.set(body);
    resourceDraft.set(body);
    collection.set(null);  // the slot below the page holds one thing
    closeDrawer();         // the drawer was the chooser; it gets out of the way
  });
  return true;
}

// What a new one starts as. A template that renders nothing useful, or a
// stylesheet that is an empty file, teaches you nothing about what goes in it.
const STARTER = {
  templates: {
    ext: ".html",
    body: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{title}}</title>
  <link rel="canonical" href="{{url}}">
  <link rel="stylesheet" href="/static/site.css">
  <link rel="stylesheet" href="/static/theme.css">
  {{css}}
</head>
<body>
  <nav class="nav">{{nav}}</nav>
  <main>{{content}}</main>
</body>
</html>
`,
  },
  static: {
    ext: ".css",
    body: `/* Name this from a page's front matter: css: ${"{{name}}"} */\n\n`,
  },
} as const;

// Made in the folder it belongs to, and opened at once: a new stylesheet or
// template is no use until you can see what it does.
export async function createResource(
  section: "templates" | "static",
  name: string,
): Promise<string | void> {
  const { ext, body } = STARTER[section];
  const file = name.endsWith(ext) ? name : `${name}${ext}`;
  return writeNew(section, file, body.replace("{{name}}", file));
}


async function writeNew(section: Resource["section"], file: string, body: string): Promise<string | void> {
  const res = await api(`create ${file}`, `/edit/${section}/${urlPath(file)}`,
    { method: "PUT", headers: { "If-None-Match": "*" }, body }, [412]);
  if (res.status === 412) return `${file} already exists`;
  if (!res.ok) return `Couldn't create ${file}`;
  reloadResources();
  await openResource({ section, path: file });
}

export function reloadResources() {
  resourceRevision.update((n) => n + 1);
}

export function closeResource() {
  batch(() => {
    resource.set(null);
    resourceSaved.set("");
    resourceDraft.set("");
  });
}

export async function deleteResource(): Promise<boolean> {
  const open = resource.peek();
  if (!open) return false;
  const res = await api(`delete ${open.path}`, resourceUrl(open), { method: "DELETE" });
  if (!res.ok) return false;
  closeResource();
  reloadResources();
  return true;
}

export async function saveResource(): Promise<boolean> {
  const open = resource.peek();
  if (!open) return false;
  const res = await api(`save ${open.path}`, resourceUrl(open), { method: "PUT", body: resourceDraft.peek() });
  if (!res.ok) return false;
  resourceSaved.set(resourceDraft.peek());
  return true;
}

// Actions. Each says whether it worked; api() has already spoken if not.
export async function loadFile(path: string): Promise<boolean> {
  const fp = path.replace(/^\//, "");
  const res = await api(`open ${fp}`, at(fp));
  if (!res.ok) return false;
  const content = await res.text();
  batch(() => {
    filePath.set(fp);
    fileContent.set(content);
    editorContent.set(content);
    folder.set(folderOf(fp));
  });
  await offerCollection(fp);
  return true;
}

// Create-only: If-None-Match: * has the server refuse (412) rather than
// replace a file that already exists. Returns a message for the dialog if so.
export async function createFile(path: string, name: string): Promise<string | void> {
  const fp = path.replace(/^\//, "");
  const body = `title: ${name.replace(/\.md$/, "")}\n\n`;
  const res = await api(`create ${fp}`, at(fp), { method: "PUT", headers: { "If-None-Match": "*" }, body }, [412]);
  if (res.status === 412) return `${fp} already exists`;
  if (!res.ok) return `Couldn't create ${fp}`;
  await loadFile(fp);
  reloadBrowser();
}

// A collection starts as the smallest thing that is one: the data, the page
// every item gets, and an overview — so the first picture dropped in the pane
// is at once a work with a page of its own and a thumbnail on its folder's
// index. Each file is create-only, like a page: a folder that already has a
// collection says so, and one that already has an index keeps it.
const FIELDS = [
  { name: "src", kind: "image", label: "Picture" },
  { name: "title", label: "Title" },
  { name: "caption", kind: "long", label: "Caption" },
];

// The heading is HTML rather than "# …": markdown would give every item's
// heading the same id, made from the placeholder rather than the title.
const eachPage = () => `each: true

<h1>{{item-title}}</h1>

![{{item-title}}]({{item-src}})

{{item-caption}}

{{prev}} {{next}}
`;

export async function createCollection(parent: string, name: string): Promise<string | void> {
  const own = name.replace(/^\/+|\/+$/g, "");
  if (!own) return "A collection is a folder: give it a name";
  const folder = parent ? `${parent}/${own}` : own;
  const key = collectionKey(folder);
  const data = {
    fields: FIELDS,
    images: { src: `/static/images/${urlPath(folder)}/` },
    groups: [{ name: own, items: [] }],
  };
  const create = (path: string, body: string) =>
    api(`create ${path}`, at(path), { method: "PUT", headers: { "If-None-Match": "*" }, body }, [412]);

  const res = await create(key, `${JSON.stringify(data, null, 2)}\n`);
  if (res.status === 412) return `${key} already exists`;
  if (!res.ok) return `Couldn't create ${key}`;
  // Failures speak: without an each: page the works are shown but have no
  // pages, and the one person who can see why is the one who just made it.
  const item = `${folder}/item.md`;
  if ((await create(item, eachPage())).status === 412) {
    speak(`${item} was already a page, so ${folder}'s works have no pages of their own yet — `
      + `give one page in ${folder} the line "each: true"`);
  }
  await create(`${folder}/index.md`, `title: ${own}\n\n{{items}}\n`);
  reloadBrowser();
  await loadFile(`${folder}/index.md`);
  // Its index offers the collection already, unless something else was open
  // below the page; this is what was asked for, so it takes the slot.
  if (collection.peek()?.folder !== folder) openCollection(folder);
}

export async function saveFile(): Promise<boolean> {
  const fp = filePath.peek();
  if (!fp) return false;
  const res = await api(`save ${fp}`, at(fp), { method: "PUT", body: editorContent.peek() });
  if (!res.ok) return false;
  fileContent.set(editorContent.peek());
  reloadBrowser();
  return true;
}

// A new name, or a new folder, for the open page: `to` is its whole key
// ("blog/renamed.md"), .md added when it's left off. Unsaved changes are saved
// first — the move is of the page as you see it. The server keeps the old
// address among its aliases, and says which, which is news worth telling.
// Returns a message for the dialog when it didn't move.
export async function moveFile(to: string): Promise<string | void> {
  const fp = filePath.peek();
  if (!fp) return;
  const trimmed = to.trim().replace(/^\/+/, "");
  const dest = trimmed.endsWith(".md") ? trimmed : `${trimmed}.md`;
  if (dest === fp) return `It is already ${fp}`;
  if (editorContent.peek() !== fileContent.peek() && !(await saveFile())) return `Couldn't save ${fp} first`;
  const res = await api(`move ${fp}`, `${at(fp)}?move=${encodeURIComponent(dest)}`, { method: "POST" }, [400, 412]);
  if (res.status === 412) return `${dest} already exists`;
  if (res.status === 400) return res.text();
  if (!res.ok) return `Couldn't move ${fp}`;
  const { kept } = await res.json() as { kept: string | null };
  reloadBrowser();
  await loadFile(dest);
  tell(kept ? `${fp} is now ${dest}; ${kept} still answers, and leads there` : `${fp} is now ${dest}`);
}

export async function deleteFile(): Promise<boolean> {
  const fp = filePath.peek();
  if (!fp) return false;
  const res = await api(`delete ${fp}`, at(fp), { method: "DELETE" });
  if (!res.ok) return false;
  closeFile();
  reloadBrowser();
  return true;
}

// The page closes like the resource below it does, and the column gives the
// room back to whatever is still open. pageLayout goes with it: it describes
// the open page, and left behind it has the resource pane telling you what
// "the page you are looking at" wears when you are not looking at one.
export function closeFile() {
  batch(() => {
    filePath.set(null);
    fileContent.set("");
    editorContent.set("");
    pageLayout.set("");
    pageIncludes.set([]);
  });
}

export function reloadBrowser() {
  browserRevision.update((n) => n + 1);
}

export function toggleImages() {
  toggleDrawer("resources");
}

export function closeImages() {
  closeDrawer();
}
