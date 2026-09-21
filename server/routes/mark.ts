import type { BunRequest } from "bun";
import { requireAuth } from "../auth";
import { parsePage, pageHtml, type DraftTemplate } from "../page";
import { siteOrigin } from "./site";

type MarkRequest = { source: string; draft?: DraftTemplate };

export const handleMark = {
  // The preview, rendered the way the site renders: the page's markdown inside
  // the template it asks for, with the nav, the theme cascade and the rest
  // filled in. It used to build a shell of its own, which looked close enough
  // until you edited the template and nothing changed.
  //
  // ?path= is the page being edited: its [[wiki links]], its theme cascade and
  // its place in the nav all depend on where it lives. `draft` is a template
  // open in the editor and not yet saved, used in place of the saved one when
  // it is the template this page wears.
  async PUT(req: BunRequest) {
    const denied = await requireAuth(req);
    if (denied) return denied;
    const path = new URL(req.url).searchParams.get("path") ?? "";
    const { source, draft } = (await req.json()) as MarkRequest;
    const page = parsePage(path, source);
    // No edit link: the preview shows the page a reader gets, and a link into
    // the editor from inside the editor helps nobody.
    const { html, layout } = await pageHtml(page, { origin: siteOrigin(req), draft });
    return Response.json({ html, layout, meta: page.meta });
  },
};
