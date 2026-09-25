import { createElement, when, computed, type ReadonlySignal } from "@blueshed/railroad";

// The right-hand column, whatever is in it. One place for the sandbox, because
// getting it wrong is the kind of mistake that only shows up once.
// `busy`, when given, is a page on its way: the line across the top and the
// last page dimmed until `onload` says the new one has arrived, pictures and
// stylesheets included.
// A page's scripts, taken out before it goes in: the sandbox would block each
// one anyway, and say so in red in the console, every render.
const SCRIPT = /<script\b[\s\S]*?<\/script\s*>/gi;
export const withoutScripts = (html: string) => html.replace(SCRIPT, "");

export function PreviewFrame({ srcdoc, title, busy, onload }: {
  srcdoc: { get(): string }; title: string; busy?: ReadonlySignal<boolean>; onload?: () => void;
}) {
  return (
    <div class="panel panel-preview" aria-busy={busy ? busy.map(String) : "false"}>
      {busy ? when(busy, () => <div class="loading-line" role="progressbar" aria-label="Rendering the page" />) : null}
      {/* allow-same-origin without allow-scripts: page script can't run, but
          stylesheets, images and the session cookie still load. Never both. */}
      <iframe title={title} srcdoc={computed(() => withoutScripts(srcdoc.get()))} sandbox="allow-same-origin" onload={onload} class="preview-frame" />
    </div>
  );
}
