import { createElement, signal, computed, effect } from "@blueshed/railroad";
import { editorContent, filePath } from "../store";

export function Preview() {
  const html = signal("");
  const meta = signal<Record<string, string[]>>({});
  let timer: ReturnType<typeof setTimeout> | null = null;

  const update = async (raw: string) => {
    try {
      const res = await fetch("/edit/mark/", { method: "PUT", body: raw });
      if (!res.ok) return;
      const data = await res.json();
      html.set(data.content || "");
      meta.set(data.meta || {});
    } catch {}
  };

  // Debounced preview update — tracks both content and filePath
  effect(() => {
    const content = editorContent.get();
    filePath.get(); // track file changes too
    if (!content) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => update(content), 300);
  });

  const srcdoc = computed(() => {
    const h = html.get();
    if (!h) return "";
    const fp = filePath.get() || "";
    const m = meta.get();
    const theme = m.theme?.[0] || "";
    const title = m.title?.[0] || "preview";
    const dir = fp.includes("/") ? fp.substring(0, fp.lastIndexOf("/")) : "";
    const themeCssHref = `/edit/pages/${dir ? dir + "/" : ""}-theme.css`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link href="/static/site.css" rel="stylesheet">
  <link href="${themeCssHref}" rel="stylesheet" onerror="this.remove()">
</head>
<body class="${theme}">
  ${h}
</body>
</html>`;
  });

  return (
    <div class="panel panel-preview">
      <iframe srcdoc={srcdoc} style="width: 100%; height: 100%; border: none;" />
    </div>
  );
}
