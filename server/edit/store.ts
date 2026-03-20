import { signal, batch } from "@blueshed/railroad";

// App state as signals
export const filePath = signal<string | null>(null);
export const fileContent = signal("");
export const editorContent = signal("");
export const browserRevision = signal(0);
export const showImages = signal(false);

// Actions
export async function loadFile(path: string): Promise<boolean> {
  try {
    const res = await fetch(`/edit/pages${path.startsWith("/") ? path : `/${path}`}`);
    if (!res.ok) return false;
    const content = await res.text();
    batch(() => {
      filePath.set(path.replace(/^\//, ""));
      fileContent.set(content);
      editorContent.set(content);
    });
    return true;
  } catch {
    return false;
  }
}

export async function createFile(path: string, name: string) {
  const fp = path.replace(/^\//, "");
  const body = name === "-theme.css"
    ? `/* Theme CSS for this folder */\n/* Set theme: mytheme in your page front-matter */\n/* Then target body.mytheme here */\n\nbody.mytheme {\n  \n}\n`
    : `title: ${name.replace(/\.md$/, "")}\n\n`;
  await fetch(`/edit/pages/${fp}`, { method: "PUT", body });
  await loadFile(path);
  reloadBrowser();
}

export async function saveFile() {
  const fp = filePath.peek();
  if (!fp) return;
  await fetch(`/edit/pages/${fp}`, { method: "PUT", body: editorContent.peek() });
  fileContent.set(editorContent.peek());
  reloadBrowser();
}

export async function deleteFile() {
  const fp = filePath.peek();
  if (!fp) return;
  await fetch(`/edit/pages/${fp}`, { method: "DELETE" });
  batch(() => {
    filePath.set(null);
    fileContent.set("");
    editorContent.set("");
  });
  reloadBrowser();
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
