import type { BunRequest } from "bun";
import { requireAuth } from "../auth";
import { renderMarkdown, loadThemeCss } from "../markdown";
import { createPageStorage } from "../storage";

const pages = createPageStorage();

export const handleMark = {
  // ?path= is the page being edited: its [[wiki links]] and its theme (the
  // cascade the site will use) depend on where it lives.
  async PUT(req: BunRequest) {
    const denied = await requireAuth(req);
    if (denied) return denied;
    const path = new URL(req.url).searchParams.get("path") ?? "";
    const { content, meta } = renderMarkdown(await req.text(), path);
    return Response.json({ content, meta, theme: await loadThemeCss(pages, path) });
  },
};
