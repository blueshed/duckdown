import { createElement } from "@blueshed/railroad";

// The right-hand column, whatever is in it. One place for the sandbox, because
// getting it wrong is the kind of mistake that only shows up once.
export function PreviewFrame({ srcdoc, title }: { srcdoc: { get(): string }; title: string }) {
  return (
    <div class="panel panel-preview">
      {/* allow-same-origin without allow-scripts: page script can't run, but
          stylesheets, images and the session cookie still load. Never both. */}
      <iframe title={title} srcdoc={srcdoc} sandbox="allow-same-origin" style="width: 100%; height: 100%; border: none;" />
    </div>
  );
}
