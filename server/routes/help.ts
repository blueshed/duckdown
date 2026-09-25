import type { BunRequest } from "bun";
import { join } from "path";
import { requireAuth } from "../auth";
import { renderMarkdown } from "../markdown";
import { DEBUG } from "../config";
import { escapeHtml } from "../utils";

// /edit/help — the editor's Help drawer: short pages in server/help/, written
// for the person editing the site, not for a developer. They ship with
// duckdown rather than living in a site, so every site has them and they
// change when duckdown does.
//
// A fenced block marked `example` is shown twice: what you type, and — under
// it — what readers get, rendered by the site's own renderer, so the two can't
// disagree. In the result a link is only a link's look (a click in the drawer
// must not take the editor away) and a picture is its words in a box (the
// example's file isn't on the site).

export const HELP_DIR = join(import.meta.dir, "../help");

// Base order; the drawer puts whatever fits what's open first.
export const HELP_ORDER = ["page", "top", "extras", "collection", "each", "template", "look", "editor"];

export type HelpSection = { id: string; title: string; html: string };

const EXAMPLE = /```example\n([\s\S]*?)```/g;
const EXAMPLE_HTML = /<pre><code class="language-example">[\s\S]*?<\/code><\/pre>/g;

// What readers get, made safe to show in the drawer.
const HEADING_LINK = /<(h[1-6]) id="[^"]*"><a href="#[^"]*">([\s\S]*?)<\/a><\/\1>/g;

function result(source: string): string {
  return renderMarkdown(source).content
    .replace(HEADING_LINK, "<$1>$2</$1>")
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/g, '<span class="help-link">$1</span>')
    .replace(/<img\b[^>]*\balt="([^"]*)"[^>]*>/g, '<span class="help-picture">$1</span>');
}

export function helpSection(id: string, source: string): HelpSection {
  const title = source.match(/^# (.+)$/m)?.[1]?.trim() ?? id;
  const body = source.replace(/^# .+\n+/, "");
  const examples = [...body.matchAll(EXAMPLE)].map((m) => m[1]!);
  let i = 0;
  const html = renderMarkdown(body).content
    // A heading here is a label, not somewhere to link to.
    .replace(HEADING_LINK, "<$1>$2</$1>")
    .replace(EXAMPLE_HTML, () => {
      const source = examples[i++] ?? "";
      return `<div class="help-example"><pre><code>${escapeHtml(source.replace(/\n$/, ""))}</code></pre>`
        + `<div class="help-result">${result(source)}</div></div>`;
    });
  return { id, title, html };
}

let kept: Promise<HelpSection[]> | null = null;

export function helpSections(dir = HELP_DIR, debug = DEBUG): Promise<HelpSection[]> {
  if (kept && !debug) return kept;
  kept = Promise.all(HELP_ORDER.map(async (id) => helpSection(id, await Bun.file(join(dir, `${id}.md`)).text())));
  kept.catch(() => { kept = null; });   // a read that failed isn't kept: the next one tries again
  return kept;
}

export const handleHelp = {
  async GET(req: BunRequest) {
    const denied = await requireAuth(req);
    if (denied) return denied;
    return Response.json({ sections: await helpSections() });
  },
};
