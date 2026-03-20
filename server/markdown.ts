import type { Storage } from "./storage";

// Front-matter parser + Bun.markdown wrapper

export interface MarkdownResult {
  content: string;
  meta: Record<string, string[]>;
  body: string;
}

export function parseFrontMatter(source: string): { meta: Record<string, string[]>; body: string } {
  const meta: Record<string, string[]> = {};
  const lines = source.split("\n");
  let i = 0;

  while (i < lines.length && lines[i].trim() !== "") {
    const match = lines[i].match(/^(\w[\w-]*)\s*:\s*(.*)$/);
    if (match) {
      const key = match[1].toLowerCase();
      const val = match[2].trim();
      meta[key] = meta[key] ? [...meta[key], val] : [val];
      i++;
    } else {
      break;
    }
  }

  // skip blank line after front-matter
  if (i < lines.length && lines[i].trim() === "") i++;

  const body = Object.keys(meta).length > 0 ? lines.slice(i).join("\n") : source;
  return { meta, body };
}

export function renderMarkdown(source: string): MarkdownResult {
  const { meta, body } = parseFrontMatter(source);
  const content = Bun.markdown.html(body, {
    tables: true,
    strikethrough: true,
    tasklists: true,
    autolinks: true,
  });
  return { content, meta, body };
}

// Build nav from index.md files — walks folders looking for nav/title metadata
export async function buildNav(pages: Storage, prefix = ""): Promise<string> {
  const { folders, files } = await pages.list(prefix);
  const items: string[] = [];

  // Check current folder's index.md for a nav entry
  for (const f of files) {
    if (f.name === "index.md") {
      const raw = await pages.read(f.path.replace(/^\//, ""));
      const { meta } = parseFrontMatter(raw);
      const title = meta.nav?.[0] || meta.title?.[0];
      if (title) {
        const href = "/" + f.path.replace(/\.md$/, ".html").replace(/^\//, "");
        items.push(`<li><a href="${href}">${title}</a></li>`);
      }
    }
  }

  // Recurse into subfolders
  for (const folder of folders.sort((a, b) => a.name.localeCompare(b.name))) {
    if (folder.name.startsWith(".") || folder.name.startsWith("-")) continue;
    const sub = await buildNav(pages, folder.path.replace(/^\//, ""));
    if (sub) items.push(sub);
  }

  return items.length > 0 ? items.join("\n") : "";
}

// Load theme CSS from -theme.css in the same directory as the page
export async function loadThemeCss(pages: Storage, pagePath: string): Promise<string> {
  const dir = pagePath.includes("/") ? pagePath.substring(0, pagePath.lastIndexOf("/")) : "";
  const themeKey = dir ? `${dir}/-theme.css` : "-theme.css";
  try {
    if (await pages.exists(themeKey)) {
      return await pages.read(themeKey);
    }
  } catch {
    // no theme
  }
  return "";
}
