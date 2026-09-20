import { createElement, computed } from "@blueshed/railroad";
import { editorContent } from "../store";

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

export function CssPreview() {
  const srcdoc = computed(() => {
    const css = editorContent.get();
    const classMatch = css.match(/body\.(\w[\w-]*)\s*\{/);
    const bodyClass = classMatch ? classMatch[1] : "";

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="/static/site.css" rel="stylesheet">
  <style>${css}</style>
</head>
<body class="${bodyClass}">
  ${sampleContent}
</body>
</html>`;
  });

  return (
    <div class="panel panel-preview">
      {/* allow-same-origin without allow-scripts: see Preview.tsx */}
      <iframe srcdoc={srcdoc} sandbox="allow-same-origin" style="width: 100%; height: 100%; border: none;" />
    </div>
  );
}
