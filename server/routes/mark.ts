import type { BunRequest } from "bun";
import { requireAuth } from "../auth";
import { parsePage, pageHtml, type DraftTemplate } from "../page";
import { createPageStorage } from "../storage";
import { folderOf } from "../markdown";
import { collectionProblems } from "../collection";
import { siteOrigin } from "./site";

const pages = createPageStorage();

type MarkRequest = { source: string; draft?: DraftTemplate; through?: string };

export const handleMark = {
  // The preview, rendered the way the site renders: the page's markdown inside
  // the template it asks for, with the nav, its stylesheets and the rest
  // filled in. It used to build a shell of its own, which looked close enough
  // until you edited the template and nothing changed.
  //
  // ?path= is the page being edited: its [[wiki links]] and its place in the
  // nav both depend on where it lives. `draft` is a template
  // open in the editor and not yet saved, used in place of the saved one when
  // it is the template this page wears; `through` renders in exactly the
  // template given, which is how the editor previews one with no page open.
  async PUT(req: BunRequest) {
    const denied = await requireAuth(req);
    if (denied) return denied;
    const path = new URL(req.url).searchParams.get("path") ?? "";
    const { source, draft, through } = (await req.json()) as MarkRequest;
    const page = parsePage(path, source);
    // No edit link: the preview shows the page a reader gets, and a link into
    // the editor from inside the editor helps nobody.
    const { html, layout, includes } = await pageHtml(page, { origin: siteOrigin(req), draft, through });
    // If this page's folder has a collection, anything wrong with it comes
    // back here: a slug that collides with a page, or a file that won't parse.
    // Failures speak, and the editor is where the person who can fix it is.
    const problems = await collectionProblems(pages, folderOf(path));
    return Response.json({ html, layout, includes, meta: page.meta, problems });
  },
};
