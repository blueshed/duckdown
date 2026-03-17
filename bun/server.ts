import { resolve, join, extname, dirname, relative } from "path";
import { readdir, stat, readFile, writeFile, unlink, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { Marked } from "marked";
import editor from "./editor.html";

// --- Config ---

const APP_PATH = process.env.DUCKDOWN_PATH || resolve("..", "tests", "example");
const PAGES_PATH = join(APP_PATH, "pages");
const STATIC_PATH = join(APP_PATH, "static");
const TEMPLATES_PATH = join(APP_PATH, "templates");
const IMAGES_PATH = "static/images/";
const PORT = parseInt(process.env.PORT || "8080");
const COOKIE_SECRET = process.env.COOKIE_SECRET || "duckdown-bun-secret";

// --- Markdown ---

const marked = new Marked({
  gfm: true,
  breaks: false,
});

function parseMarkdownMeta(source: string): { meta: Record<string, string[]>; body: string } {
  const meta: Record<string, string[]> = {};
  const lines = source.split("\n");
  let i = 0;

  // Parse YAML-like front matter (key: value lines before first blank line)
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

  // Skip blank line after meta
  if (i < lines.length && lines[i].trim() === "") i++;

  const body = Object.keys(meta).length > 0 ? lines.slice(i).join("\n") : source;
  return { meta, body };
}

async function convertMarkdown(source: string) {
  const { meta, body } = parseMarkdownMeta(source);
  const content = await marked.parse(body);
  return { content, meta };
}

// --- File utilities ---

const MIME_TYPES: Record<string, string> = {
  ".md": "text/markdown",
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
};

function guessMime(path: string): string {
  return MIME_TYPES[extname(path).toLowerCase()] || "application/octet-stream";
}

function safePath(base: string, userPath: string): string {
  const resolved = resolve(base, userPath);
  if (!resolved.startsWith(resolve(base))) {
    throw new Error("Path traversal denied");
  }
  return resolved;
}

async function listFolder(dirPath: string, root: string) {
  const files: object[] = [];
  const folders: object[] = [];
  if (!existsSync(dirPath)) return { files, folders };

  const rootLen = resolve(root).length;
  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = join(dirPath, entry.name);
    const relPath = fullPath.substring(rootLen);
    if (entry.isFile()) {
      const s = await stat(fullPath);
      files.push({
        name: entry.name,
        path: relPath,
        file: true,
        size: s.size,
        type: guessMime(entry.name),
      });
    } else if (entry.isDirectory()) {
      folders.push({
        name: entry.name,
        path: relPath,
        file: false,
        size: null,
        type: null,
      });
    }
  }
  return { files, folders };
}

// --- Navigation builder ---

async function buildNav(pagesRoot: string): Promise<string> {
  const result: string[] = ['<ul class="nav">'];

  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const dirs: string[] = [];

    for (const entry of entries) {
      if (entry.name === "index.md" && entry.isFile()) {
        const filePath = join(dir, entry.name);
        const raw = await readFile(filePath, "utf-8");
        const { meta } = parseMarkdownMeta(raw);
        const title = meta.nav?.[0] || meta.title?.[0];
        if (title) {
          const rel = relative(pagesRoot, filePath).replace(/\.md$/, ".html");
          result.push(`  <li><a href="/${rel}">${title}</a></li>`);
        }
      }
      if (entry.isDirectory() && !entry.name.startsWith(".") && !entry.name.startsWith("-")) {
        dirs.push(join(dir, entry.name));
      }
    }

    for (const d of dirs.sort()) {
      await walk(d);
    }
  }

  await walk(pagesRoot);
  result.push("</ul>");
  return result.join("\n");
}

// --- Site template rendering ---

async function renderSitePage(path: string): Promise<Response> {
  const file = path === "" || path === "index.html" ? "index" : path.replace(/\.html$/, "");
  const mdPath = join(PAGES_PATH, `${file}.md`);

  if (!existsSync(mdPath)) {
    return new Response("Not Found", { status: 404 });
  }

  const raw = await readFile(mdPath, "utf-8");
  const { content, meta } = await convertMarkdown(raw);
  const title = meta.title?.[0] || "duckdown";
  const theme = meta.theme?.[0] || "";

  // Load theme CSS
  const themeFile = join(PAGES_PATH, dirname(file), "-theme.css");
  let themeCss = "";
  if (existsSync(themeFile)) {
    themeCss = await readFile(themeFile, "utf-8");
  }

  // Load nav
  const siteNav = await buildNav(PAGES_PATH);

  // Load site template or use default
  const tmplPath = join(TEMPLATES_PATH, "site_tmpl.html");
  let html: string;
  if (existsSync(tmplPath)) {
    const tmpl = await readFile(tmplPath, "utf-8");
    // Simple template substitution (replaces Tornado template tags)
    html = tmpl
      .replace(/\{\{\s*handler\.one_meta_value\('title',\s*'duckdown'\)\s*\}\}/g, title)
      .replace(/\{\{\s*handler\.one_meta_value\('theme'\)\s*\}\}/g, theme)
      .replace(/\{\{\s*static_url\('site\.css'\)\s*\}\}/g, "/static/site.css")
      .replace(/\{%\s*if theme_css\s*%\}(.*?)\{%\s*end\s*%\}/gs, themeCss ? `<style type="text/css">${themeCss}</style>` : "")
      .replace(/\{%\s*raw content\s*%\}/g, content);
  } else {
    html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link href="/static/site.css" rel="stylesheet" type="text/css" />
  ${themeCss ? `<style type="text/css">${themeCss}</style>` : ""}
</head>
<body class="${theme}">
  ${siteNav}
  ${content}
</body>
</html>`;
  }

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// --- Bun Server ---

const server = Bun.serve({
  port: PORT,

  routes: {
    // Editor — Bun HTML import (bundled, transpiled, cached)
    "/edit": editor,

    // API: file/folder CRUD
    "/edit/pages/*": async (req) => {
      const url = new URL(req.url);
      const path = url.pathname.replace("/edit/pages/", "");

      if (req.method === "GET") {
        const fullPath = safePath(PAGES_PATH, path);

        if (existsSync(fullPath) && (await stat(fullPath)).isFile()) {
          const body = await readFile(fullPath);
          return new Response(body, {
            headers: { "Content-Type": guessMime(fullPath) },
          });
        }
        // Directory listing
        const listing = await listFolder(fullPath, PAGES_PATH);
        return Response.json(listing);
      }

      if (req.method === "PUT") {
        const fullPath = safePath(PAGES_PATH, path);
        const dir = dirname(fullPath);
        if (!existsSync(dir)) await mkdir(dir, { recursive: true });
        const body = Buffer.from(await req.arrayBuffer());
        await writeFile(fullPath, body);
        return new Response("saved");
      }

      if (req.method === "DELETE") {
        const fullPath = safePath(PAGES_PATH, path);
        if (!existsSync(fullPath)) {
          return new Response("Not Found", { status: 404 });
        }
        await unlink(fullPath);
        return new Response("deleted");
      }

      return new Response("Method Not Allowed", { status: 405 });
    },

    // API: markdown preview
    "/edit/mark/": async (req) => {
      if (req.method !== "PUT") {
        return new Response("Method Not Allowed", { status: 405 });
      }
      const raw = await req.text();
      const { content, meta } = await convertMarkdown(raw);
      return Response.json({ content, meta, toc: "" });
    },

    // API: image browsing (local filesystem)
    "/edit/browse/*": async (req) => {
      const url = new URL(req.url);
      const path = url.pathname.replace("/edit/browse/", "");
      const imagesDir = join(APP_PATH, IMAGES_PATH);

      if (req.method === "GET") {
        const fullPath = safePath(imagesDir, path);
        const listing = await listFolder(fullPath, imagesDir);
        return Response.json(listing);
      }

      if (req.method === "PUT") {
        return Response.json({ img_path: `/${IMAGES_PATH}` });
      }

      if (req.method === "POST") {
        const formData = await req.formData();
        const results: string[] = [];
        for (const [, file] of formData.entries()) {
          if (file instanceof File) {
            const dest = safePath(imagesDir, `${path}${file.name}`);
            const dir = dirname(dest);
            if (!existsSync(dir)) await mkdir(dir, { recursive: true });
            await writeFile(dest, Buffer.from(await file.arrayBuffer()));
            results.push(`${IMAGES_PATH}${path}${file.name}`);
          }
        }
        return Response.json({ result: results });
      }

      return new Response("Method Not Allowed", { status: 405 });
    },

    // Static files
    "/static/*": async (req) => {
      const url = new URL(req.url);
      const path = url.pathname.replace("/static/", "");
      const fullPath = safePath(STATIC_PATH, path);

      if (!existsSync(fullPath)) {
        return new Response("Not Found", { status: 404 });
      }

      const body = await readFile(fullPath);
      return new Response(body, {
        headers: { "Content-Type": guessMime(fullPath) },
      });
    },
  },

  // Catch-all: render markdown site pages
  fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\//, "");
    return renderSitePage(path);
  },
});

console.log(`duckdown bun running on http://localhost:${server.port}`);
