import { createElement, when, type ReadonlySignal } from "@blueshed/railroad";

// The right-hand column, whatever is in it. One place for the sandbox, because
// getting it wrong is the kind of mistake that only shows up once.
// `busy`, when given, is a page on its way: the line across the top and the
// last page dimmed until `onload` says the new one has arrived, pictures and
// stylesheets included.
export function PreviewFrame({ srcdoc, title, busy, onload }: {
  srcdoc: { get(): string }; title: string; busy?: ReadonlySignal<boolean>; onload?: () => void;
}) {
  return (
    <div class="panel panel-preview" aria-busy={busy ? busy.map(String) : "false"}>
      {busy ? when(busy, () => <div class="loading-line" role="progressbar" aria-label="Rendering the page" />) : null}
      {/* allow-same-origin without allow-scripts: page script can't run, but
          stylesheets, images and the session cookie still load. Never both. */}
      <iframe title={title} srcdoc={srcdoc} sandbox="allow-same-origin" onload={onload} style="width: 100%; height: 100%; border: none;" />
    </div>
  );
}
