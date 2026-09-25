import { createElement, signal, computed, effect, list, when } from "@blueshed/railroad";
import { api } from "../api";
import { tell } from "../notice";
import { Icon } from "./Icon";
import { Drawer } from "./Drawer";
import {
  browserRevision, resourceRevision, collectionRevision, reloadBrowser,
  filePath, fileContent, editorContent, loadFile,
  drawer, toggleDrawer, closeDrawer,
} from "../store";

// Publishing from here (routes/publish.ts), when this copy of the site is
// edited on one machine and published by a push: a button in the header that
// says how much is waiting, and a drawer that shows it, publishes it, or
// pulls in what was published from somewhere else. With no DUCKDOWN_REMOTE
// the server answers 404 and there is no button at all.

type Change = { path: string; state: "added" | "changed" | "deleted" };
type Status = { remote: string; changes: Change[]; ahead: number; behind: number; problem?: string };
type Published = { committed: boolean; pushed: number; problems: string[] };
type Pulled = { changed: string[]; conflicts: string[] };

const URL_ = "/edit/publish";
const EXPLAINED = [404, 409];

// null: no remote. A string: why the status can't be known.
export const publishState = signal<Status | string | null>(null);
const waiting = computed(() => {
  const s = publishState.get();
  return s && typeof s !== "string" ? s.changes.length + s.ahead : 0;
});

export async function refreshPublish(): Promise<void> {
  const res = await api("check what would be published", URL_, undefined, EXPLAINED);
  if (res.status === 404) return publishState.set(null);
  publishState.set(res.status === 409 ? await res.text() : res.ok ? await res.json() as Status : publishState.peek());
}

export function PublishButton() {
  // Again whenever something is written: a save, a resource, the collection.
  effect(() => {
    browserRevision.get();
    resourceRevision.get();
    collectionRevision.get();
    const timer = setTimeout(refreshPublish, 400);
    return () => clearTimeout(timer);
  });
  return (
    <span class="publish">
      {when(() => publishState.get() !== null, () => (
        <button onclick={() => toggleDrawer("publish")} aria-expanded={drawer.map((d) => String(d === "publish"))}>
          <Icon name="cloud-upload" /> <span class="label">Publish</span>
          {when(waiting, () => <span class="badge">{waiting}</span>)}
        </button>
      ))}
    </span>
  );
}

const STATE = { added: "new", changed: "changed", deleted: "deleted" } as const;

export function PublishDrawer() {
  const busy = signal(false);
  const error = signal("");
  const found = signal<string[]>([]);       // what the checks said, or what a pull couldn't merge
  const foundTitle = signal("");
  refreshPublish();

  const status = computed(() => {
    const s = publishState.get();
    return s && typeof s !== "string" ? s : null;
  });
  const changes = computed(() => status.get()?.changes ?? []);
  const nothing = computed(() => waiting.get() === 0);

  const run = async (what: string, init: RequestInit, url: string) => {
    busy.set(true);
    error.set("");
    found.set([]);
    const res = await api(what, url, init, EXPLAINED);
    busy.set(false);
    if (EXPLAINED.includes(res.status)) error.set(await res.text());
    return res.ok ? res.json() : null;
  };

  const publish = async (e: Event) => {
    e.preventDefault();
    const input = (e.target as HTMLFormElement).elements.namedItem("message") as HTMLInputElement;
    const done = await run("publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: input.value }) }, URL_) as Published | null;
    if (!done) return;
    input.value = "";
    tell(done.pushed ? `Published: ${done.pushed} commit(s) pushed` : "Nothing to publish");
    if (done.problems.length) {
      foundTitle.set("Published, but the export found these — worth fixing:");
      found.set(done.problems);
    }
    await refreshPublish();
  };

  const pull = async () => {
    const done = await run("pull", { method: "POST" }, `${URL_}?pull`) as Pulled | null;
    if (!done) return;
    tell(done.changed.length ? `Pulled ${done.changed.length} change(s) from the published site`
      : done.conflicts.length ? "Pulled: everything that changed there was changed here too" : "Nothing new to pull");
    if (done.conflicts.length) {
      foundTitle.set("Changed here and there — yours is kept; theirs is in each file's Earlier versions:");
      found.set(done.conflicts);
    }
    reloadBrowser();
    // The open page again, if it changed and has nothing unsaved in it.
    const open = filePath.peek();
    if (open && done.changed.includes(`pages/${open}`) && editorContent.peek() === fileContent.peek()) await loadFile(open);
    await refreshPublish();
  };

  return (
    <Drawer icon="cloud-upload" title={() => (status.get() ? `Publish to ${status.get()?.remote}` : "Publish")}
      close="Close publish" onclose={closeDrawer}>
      <div class="drawer-body">
      {when(() => typeof publishState.get() === "string", () => <p class="dialog-error" role="alert">{() => publishState.get() as string}</p>)}
      {when(() => status.get()?.problem, () => <p class="dialog-error" role="alert">{() => status.get()?.problem}</p>)}
      {when(() => status.get() && nothing.get(), () => <p class="dialog-hint">Nothing here that isn't published.</p>)}
      <ul class="history-list">
        {list(changes, (c) => c.path, (row$) => (
          <li>
            <span class="history-label">{row$.map((c) => c.path)}</span>
            <span class="history-detail">{row$.map((c) => STATE[c.state])}</span>
          </li>
        ))}
      </ul>
      {when(() => (status.get()?.ahead ?? 0) > 0, () => (
        <p class="dialog-hint">{() => `${status.get()?.ahead} commit(s) made here, not yet published.`}</p>
      ))}
      {when(() => (status.get()?.behind ?? 0) > 0, () => (
        <p class="dialog-hint">{() => `The published site has ${status.get()?.behind} change(s) this copy hasn't: Pull first.`}</p>
      ))}
      {when(error, () => <p class="dialog-error" role="alert">{error}</p>)}
      {when(() => found.get().length > 0, () => (
        <div class="dialog-hint">
          <p>{foundTitle}</p>
          <ul>{list(found, (f) => f, (f$) => <li>{f$}</li>)}</ul>
        </div>
      ))}
      </div>
      <div class="drawer-foot">
        <form class="editor-add" onsubmit={publish}>
          <input name="message" placeholder="What changed (optional)" aria-label="What changed (optional)" autocomplete="off" />
          <button type="submit" class="primary" disabled={computed(() => busy.get() || nothing.get())}>
            <Icon name="cloud-upload" size={12} /> Publish
          </button>
        </form>
        <div class="drawer-line">
          <button type="button" disabled={busy} onclick={pull}><Icon name="cloud-download" size={12} /> Pull</button>
          <span class="drawer-note">Bring in what was published elsewhere.</span>
        </div>
      </div>
    </Drawer>
  );
}
