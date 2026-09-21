import { createElement, signal, effect } from "@blueshed/railroad";
import { apiJson } from "../api";
import { resourceDraft } from "../store";
import { PreviewFrame } from "./PreviewFrame";

// A page has to exist for a template to wrap anything, so a template opened on
// its own gets one: enough markdown to show what the template does with a
// title, a date, headings, prose and a list. The server renders it through the
// draft, so the navigation and the stylesheets are the site's real ones.
const SAMPLE = `title: A sample page
description: What this template makes of a page.
date: 2026-09-21

# A sample page

A paragraph with **bold**, *italic*, [a link](/) and \`code\`, long enough to
show how wide the template lets a line of text run before it wraps.

## A heading

- Item one
- Item two

> [!TIP]
> A callout, for the templates that style one.
`;

export function TemplatePreview() {
  const html = signal("");

  // Rooted at the site's index, so the navigation and the canonical URL are
  // the ones a page at the top of the site would get.
  effect(() => {
    const through = resourceDraft.get();
    const timer = setTimeout(async () => {
      const data = await apiJson<{ html: string }>("render the template", "/edit/mark/?path=index.md", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: SAMPLE, through }),
      });
      if (data) html.set(data.html);
    }, 300);
    return () => clearTimeout(timer);
  });

  return <PreviewFrame srcdoc={html} />;
}
