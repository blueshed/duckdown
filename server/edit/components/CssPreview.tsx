import { createElement, computed } from "@blueshed/railroad";
import { PreviewFrame } from "./PreviewFrame";

// A bit of everything site.css styles, so a theme's variables show.
const sampleContent = `
  <nav><ul class="nav"><li><a href="#" aria-current="page">Home</a></li><li><a href="#">Guide</a></li></ul></nav>
  <h1>Heading 1</h1>
  <p>A paragraph with <strong>bold</strong>, <em>italic</em>, <a href="#">a link</a> and <code>code</code>.</p>
  <h2>Heading 2</h2>
  <ul><li>Item one</li><li>Item two</li></ul>
  <blockquote><p>A quote</p></blockquote>
  <blockquote class="callout tip"><p class="callout-title">Tip</p><p>A callout</p></blockquote>
  <pre><code>code block</code></pre>
  <table><thead><tr><th>Name</th><th>Value</th></tr></thead><tbody><tr><td>duck</td><td>1</td></tr></tbody></table>
  <span id="logo" role="img" aria-label="duckdown" style="width:80px"></span>
  <img src="/static/images/logo.svg" alt="duckdown" style="width:80px;height:80px;">
`;

// A stylesheet with no page to try it on: sample content, styled by what you
// are typing. `css` says where the text comes from — the editor when a .css is
// open as the page, the pane's draft when one is open as a resource.
//
// The body carries no class, because no page does either: a theme styles the
// folder it sits in, so it writes plain rules. A preview that invented a class
// would show you something the site will never render.
export function CssPreview({ css }: { css: () => string }) {
  const srcdoc = computed(() => {
    const text = css();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="/static/site.css" rel="stylesheet">
  <style>${text}</style>
</head>
<body>
  ${sampleContent}
</body>
</html>`;
  });

  return <PreviewFrame srcdoc={srcdoc} title="Preview of the stylesheet" />;
}
