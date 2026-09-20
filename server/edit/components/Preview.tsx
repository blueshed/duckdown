import { createElement, signal, computed, effect, batch } from "@blueshed/railroad";
import { apiJson } from "../api";
import { editorContent, filePath } from "../store";

// The server renders the page as the site will: its content, its front
// matter, and its theme (the whole cascade, root first).
type Rendered = { content: string; meta: Record<string, string[]>; theme: string };

export function Preview() {
  const html = signal("");
  const meta = signal<Record<string, string[]>>({});
  const theme = signal("");

  const update = async (raw: string) => {
    const path = encodeURIComponent(filePath.peek() || "");
    const data = await apiJson<Rendered>("render the preview", `/edit/mark/?path=${path}`, { method: "PUT", body: raw });
    if (!data) return;
    batch(() => {
      html.set(data.content);
      meta.set(data.meta);
      theme.set(data.theme);
    });
  };

  // Debounced preview update — tracks both content and filePath. The cleanup
  // cancels a render still pending when anything changes again, or when the
  // preview goes away, so nothing is rendered after the fact.
  effect(() => {
    const content = editorContent.get();
    filePath.get(); // track file changes too
    if (!content) return;
    const timer = setTimeout(() => update(content), 300);
    return () => clearTimeout(timer);
  });

  const srcdoc = computed(() => {
    const h = html.get();
    if (!h) return "";
    const m = meta.get();
    const title = m.title?.[0] || "preview";

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link href="/static/site.css" rel="stylesheet">
  <style>${theme.get()}</style>
</head>
<body class="${m.theme?.[0] || ""}">
  ${h}
</body>
</html>`;
  });

  return (
    <div class="panel panel-preview">
      {/* allow-same-origin without allow-scripts: page script can't run, but
          stylesheets, images and the session cookie still load. Never both. */}
      <iframe srcdoc={srcdoc} sandbox="allow-same-origin" style="width: 100%; height: 100%; border: none;" />
    </div>
  );
}
