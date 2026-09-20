import { signal, batch } from "@blueshed/railroad";
import { api, urlPath } from "./api";

// App state as signals
export const filePath = signal<string | null>(null);
export const fileContent = signal("");
export const editorContent = signal("");
export const browserRevision = signal(0);
export const showImages = signal(false);

// Actions. Each says whether it worked; api() has already spoken if not.
export async function loadFile(path: string): Promise<boolean> {
  const fp = path.replace(/^\//, "");
  const res = await api(`open ${fp}`, `/edit/pages/${urlPath(fp)}`);
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
  const body = name === "-theme.css"
    ? `/* Theme CSS for this folder */\n/* Set theme: mytheme in your page front-matter */\n/* Then target body.mytheme here */\n\nbody.mytheme {\n  \n}\n`
    : `title: ${name.replace(/\.md$/, "")}\n\n`;
  const res = await api(`create ${fp}`, `/edit/pages/${urlPath(fp)}`, { method: "PUT", headers: { "If-None-Match": "*" }, body }, [412]);
  if (res.status === 412) return `${fp} already exists`;
  if (!res.ok) return `Couldn't create ${fp}`;
  await loadFile(fp);
  reloadBrowser();
}

export async function saveFile(): Promise<boolean> {
  const fp = filePath.peek();
  if (!fp) return false;
  const res = await api(`save ${fp}`, `/edit/pages/${urlPath(fp)}`, { method: "PUT", body: editorContent.peek() });
  if (!res.ok) return false;
  fileContent.set(editorContent.peek());
  reloadBrowser();
  return true;
}

export async function deleteFile(): Promise<boolean> {
  const fp = filePath.peek();
  if (!fp) return false;
  const res = await api(`delete ${fp}`, `/edit/pages/${urlPath(fp)}`, { method: "DELETE" });
  if (!res.ok) return false;
  batch(() => {
    filePath.set(null);
    fileContent.set("");
    editorContent.set("");
  });
  reloadBrowser();
  return true;
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
