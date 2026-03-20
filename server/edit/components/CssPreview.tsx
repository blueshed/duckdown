import { createElement, computed } from "@blueshed/railroad";
import { editorContent } from "../store";

const sampleContent = `
  <h1>Heading 1</h1>
  <h2>Heading 2</h2>
  <p>A paragraph with <strong>bold</strong> and <em>italic</em> text.</p>
  <ul><li>Item one</li><li>Item two</li><li>Item three</li></ul>
  <blockquote>A blockquote</blockquote>
  <pre><code>code block</code></pre>
  <p><a href="#">A link</a></p>
  <img id="logo" src="/static/images/logo.svg" alt="duckdown" style="width:80px;height:80px;">
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
      <iframe srcdoc={srcdoc} style="width: 100%; height: 100%; border: none;" />
    </div>
  );
}
