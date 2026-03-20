import type { BunRequest } from "bun";
import { requireAuth } from "../auth";
import { renderMarkdown } from "../markdown";

export const handleMark = {
  async PUT(req: BunRequest) {
    const denied = await requireAuth(req);
    if (denied) return denied;
    const raw = await req.text();
    const { content, meta } = renderMarkdown(raw);
    return Response.json({ content, meta, toc: "" });
  },
};
