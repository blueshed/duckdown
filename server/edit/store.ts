import { signal, batch, computed } from "@blueshed/railroad";
import { api, urlPath } from "./api";

// App state as signals
export const filePath = signal<string | null>(null);
export const fileContent = signal("");
export const editorContent = signal("");
export const browserRevision = signal(0);
export const showImages = signal(false);

// The tree on the left is the content: pages, and the navigation derived from
// their front matter. Templates and stylesheets are not content — they are what
// a page is composed with — so they are reached from the resource sidebar and
// edited in a pane below the page, against the page you are already looking at.
export type Resource = { section: "templates" | "static" | "pages"; path: string };

export const resource = signal<Resource | null>(null);
export const resourceSaved = signal("");   // what is on the server
export const resourceDraft = signal("");   // what is in the pane
export const resourceRevision = signal(0); // bumped when the folders change
// The template the preview last put the open page through, as the server
// resolved it: a page's layout: may name one that isn't there, and then it is
// wearing site.html whatever it asked for.
export const pageLayout = signal("");
export const resourceDirty = computed(() => resourceDraft.get() !== resourceSaved.get());

const at = (path: string) => `/edit/pages/${urlPath(path)}`;
const resourceUrl = (r: Resource) => `/edit/${r.section}/${urlPath(r.path)}`;

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
    showImages.set(false); // the sidebar was the chooser; it gets out of the way
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
  {{theme_css}}
</head>
<body class="{{theme}}">
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

// Made where it is used from: a stylesheet or template in its own folder, a
// theme beside the page it themes, because that is how the cascade finds it.
export async function createResource(
  section: "templates" | "static",
  name: string,
): Promise<string | void> {
  const { ext, body } = STARTER[section];
  const file = name.endsWith(ext) ? name : `${name}${ext}`;
  return writeNew(section, file, body.replace("{{name}}", file));
}

export async function createTheme(dir: string): Promise<string | void> {
  const file = `${dir ? `${dir}/` : ""}-theme.css`;
  return writeNew("pages", file, THEME_STARTER);
}

const THEME_STARTER = `/* A theme for this folder and the ones under it.
   Put theme: mytheme in a page's front matter, then set site.css's
   variables on body.mytheme here. */

body.mytheme {
  --accent: #5856d6;
}
`;

async function writeNew(section: Resource["section"], file: string, body: string): Promise<string | void> {
  const res = await api(`create ${file}`, `/edit/${section}/${urlPath(file)}`,
    { method: "PUT", headers: { "If-None-Match": "*" }, body }, [412]);
  if (res.status === 412) return `${file} already exists`;
  if (!res.ok) return `Couldn't create ${file}`;
  changed(section);
  await openResource({ section, path: file });
}

// A stylesheet or template shows in the sidebar; a theme shows in the tree,
// in its folder. Tell whichever one lists it.
function changed(section: Resource["section"]) {
  reloadResources();
  if (section === "pages") reloadBrowser();
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
  changed(open.section);
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
  });
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

export async function saveFile(): Promise<boolean> {
  const fp = filePath.peek();
  if (!fp) return false;
  const res = await api(`save ${fp}`, at(fp), { method: "PUT", body: editorContent.peek() });
  if (!res.ok) return false;
  fileContent.set(editorContent.peek());
  reloadBrowser();
  return true;
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
  });
}

export function reloadBrowser() {
  browserRevision.update((n) => n + 1);
}

export function toggleImages() {
  showImages.update((v) => !v);
}

export function closeImages() {
  showImages.set(false);
}
