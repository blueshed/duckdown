import {
  createElement, signal, computed, effect, list, when, batch, type ReadonlySignal,
} from "@blueshed/railroad";
import { PaneHeader } from "./PaneHeader";
import { ConfirmDialog } from "./ConfirmDialog";
import { Icon } from "./Icon";
import { api, apiJson, urlPath } from "../api";
import { speak } from "../notice";
import {
  collection, collectionKey, closeCollection, collectionChanged, reloadBrowser,
} from "../store";
import { type Images, ownImages, imageUrl, thumbName } from "../../images";

// A folder's collection.json, edited as what it is: groups of pictures with a
// title and a caption each. The alternative — and what a site lived with until
// now — is typing JSON with the commas in the right places, which is fine for
// three items and hopeless for four hundred.
//
// It opens in the slot a resource uses, below the page, because a collection
// belongs to the folder whose index page is its overview: you edit the works
// and watch the overview redraw beside them.
//
// Every change writes the whole file through /edit/pages/, which is the write
// path that drops the nav, the search index and the collection cache. There is
// no undo in duckdown: what the pane has written is what the site serves, and
// a bucket's versioning is the only way back.

// The file as it is written, not as collection.ts reads it: the pane keeps
// every key it doesn't understand (a year, an index, aliases, prints) exactly
// where it found it, and touches only the three it shows.
type RawItem = Record<string, unknown> & { src?: unknown; title?: unknown; caption?: unknown };
type RawGroup = Record<string, unknown> & { name?: unknown; label?: unknown; items?: RawItem[]; groups?: RawGroup[] };
type RawFile = Record<string, unknown> & { groups?: RawGroup[] };

type Info = { images: Images; uploads: boolean; problems: string[] };
type Upload = { name: string; src: string; thumb: string; v: string };

// A group by its position: [1] is the second group, [1, 0] the first subgroup
// of it. Positions, not names, because two groups may be called the same thing
// — the gallery this came from has two 1960 sections called London.
type Path = number[];

const said = (value: unknown) => (typeof value === "string" ? value : "");

export function groupAt(file: RawFile | null, path: Path): RawGroup | null {
  let groups = file?.groups ?? [];
  let group: RawGroup | null = null;
  for (const i of path) {
    group = groups[i] ?? null;
    if (!group) return null;
    groups = group.groups ?? [];
  }
  return group;
}

// The array a group sits in: its parent's, or the file's own for a top group.
export function siblingsOf(file: RawFile, path: Path): RawGroup[] {
  const parent = groupAt(file, path.slice(0, -1));
  if (parent) return (parent.groups ??= []);
  return (file.groups ??= []);
}

// Out of its place and into another, which for a move down past a row means
// after it: splice takes the item out first, so the row you dropped on has
// already moved up one.
export function moveWithin<T>(arr: T[], from: number, to: number): void {
  const held = arr.splice(from, 1);
  arr.splice(Math.max(0, Math.min(to, arr.length)), 0, ...held);
}

// A picture's file name as a starting title: "First Light.jpg" → "First
// Light". It is a guess, shown in an input, and changed in a second.
const titleFrom = (name: string) => name.replace(/\.[^.]+$/, "");

export function CollectionPane() {
  let folder = collection.peek()?.folder ?? "";
  const name = signal("");
  const model = signal<RawFile | null>(null);
  const images = signal<Images>(ownImages());
  const uploads = signal(true);
  const dirty = signal(false);
  const busy = signal(false);
  const trouble = signal("");
  // A picture swapped in place keeps its address, so the browser has the old
  // bytes: ?v= is what makes it fetch the new ones.
  const busts = signal<Record<string, string>>({});
  const dragging = signal<{ path: Path; i: number } | null>(null);
  const asking = signal<{ title: string; run: () => void } | null>(null);

  const key = () => collectionKey(folder);
  const fileUrl = () => `/edit/pages/${urlPath(key())}`;
  const infoUrl = () => `/edit/collection/${urlPath(folder)}`;

  // --- reading and writing ---------------------------------------------

  let spoken = "";
  const check = async () => {
    const info = await apiJson<Info>(`read ${key()}`, infoUrl());
    if (!info) return;
    batch(() => {
      images.set(info.images);
      uploads.set(info.uploads);
    });
    // Failures speak: a slug that collides with a page is a work nobody can
    // reach, and the person who can fix it is looking at this pane.
    const problems = info.problems.join(" ");
    if (problems && problems !== spoken) speak(problems);
    spoken = problems;
  };

  const load = async () => {
    // Where the pictures are first, so no item is ever drawn against the
    // wrong base and no thumbnail is fetched from an address it never had.
    await check();
    const res = await api(`open ${key()}`, fileUrl());
    if (!res.ok) return;
    const body = await res.text();
    try {
      const parsed: unknown = JSON.parse(body);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("it isn't an object");
      }
      model.set(parsed as RawFile);
    } catch (e) {
      // Not editable here, and saying nothing would leave an empty pane
      // looking like an empty collection.
      trouble.set(`${key()} can't be read: ${(e as Error).message} — edit it as a file`);
      speak(trouble.peek());
    }
  };

  // One write at a time: two changes in quick succession both send the whole
  // file, and the one that arrives last should be the one written last.
  let queue: Promise<unknown> = Promise.resolve();
  const put = async () => {
    const res = await api(`save ${key()}`, fileUrl(), {
      method: "PUT",
      body: `${JSON.stringify(model.peek(), null, 2)}\n`,
    });
    if (!res.ok) return;           // api has spoken; the pane stays dirty
    dirty.set(false);
    collectionChanged();           // the preview renders the overview again
    await check();
  };
  const write = () => (queue = queue.then(put));

  const change = (fn: (file: RawFile) => void) => {
    const next = structuredClone(model.peek()) as RawFile | null;
    if (!next) return Promise.resolve();
    fn(next);
    batch(() => {
      model.set(next);
      dirty.set(true);
    });
    return write();
  };

  const removeFile = async () => {
    const res = await api(`delete ${key()}`, fileUrl(), { method: "DELETE" });
    if (!res.ok) return;
    closeCollection();
    collectionChanged();
    reloadBrowser();
  };

  // The pane follows the folder: opening another collection while this one is
  // open doesn't rebuild it (when() swaps on truthiness, and both are open).
  effect(() => {
    const open = collection.get();
    if (!open) return;
    folder = open.folder;
    batch(() => {
      model.set(null);
      trouble.set("");
      name.set(key());
    });
    load();
  });

  // --- pictures ---------------------------------------------------------

  const send = async (file: File, name: string | null): Promise<Upload | null> => {
    const form = new FormData();
    form.append("file", file);
    if (name) form.append("name", name);
    busy.set(true);
    const up = await apiJson<Upload>(`put ${file.name} in ${key()}`, infoUrl(), { method: "POST", body: form });
    busy.set(false);
    return up;
  };

  const bust = (src: string, v: string) => busts.update((b) => ({ ...b, [src]: v }));

  const addItem = async (path: Path, file: File | undefined) => {
    if (!file) return;
    const up = await send(file, null);
    if (!up) return;
    bust(up.name, up.v);
    await change((next) => {
      const group = groupAt(next, path);
      if (group) (group.items ??= []).push({ src: up.name, title: titleFrom(up.name), caption: "" });
    });
  };

  // In place, under the same file name: collection.json doesn't change, so the
  // item keeps its address and every link to it goes on working.
  const swapItem = async (path: Path, i: number, file: File | undefined) => {
    if (!file) return;
    const src = said(groupAt(model.peek(), path)?.items?.[i]?.src);
    if (!src) {
      speak("That item has no picture to replace — its src is empty.");
      return;
    }
    const up = await send(file, src);
    if (up) bust(src, up.v);
  };

  const thumbUrl = (src: string) => {
    if (!src) return "";
    const rule = images.get();
    const url = imageUrl(rule.thumb, thumbName(src, rule));
    const v = busts.get()[src];
    return v ? `${url}?v=${v}` : url;
  };

  // --- the shape of the file -------------------------------------------

  const setField = (path: Path, i: number, field: string, value: string) =>
    change((next) => {
      const item = groupAt(next, path)?.items?.[i];
      if (item) item[field] = value;
    });

  const moveItem = (from: { path: Path; i: number }, to: { path: Path; i: number }) =>
    change((next) => {
      const source = groupAt(next, from.path)?.items;
      const target = groupAt(next, to.path)?.items;
      if (!source || !target) return;
      if (source === target) return moveWithin(source, from.i, to.i);
      const [held] = source.splice(from.i, 1);
      target.splice(to.i, 0, held!);
    });

  const removeItem = (path: Path, i: number) =>
    change((next) => {
      groupAt(next, path)?.items?.splice(i, 1);
    });

  const addGroup = (path: Path | null) =>
    change((next) => {
      const fresh: RawGroup = { name: "New group", items: [] };
      if (!path) (next.groups ??= []).push(fresh);
      else {
        const group = groupAt(next, path);
        if (group) (group.groups ??= []).push(fresh);
      }
    });

  // A group shows its label when it has one and its name when it doesn't —
  // exactly what the site shows — so that is the key the heading writes to.
  const nameKeyOf = (group: RawGroup | null) => (group && "label" in group ? "label" : "name");
  const nameOf = (group: RawGroup | null) => said(group?.[nameKeyOf(group)]);

  const renameGroup = (path: Path, value: string) =>
    change((next) => {
      const group = groupAt(next, path);
      if (group) group[nameKeyOf(group)] = value;
    });

  const moveGroup = (path: Path, step: -1 | 1) =>
    change((next) => {
      const here = path[path.length - 1]!;
      moveWithin(siblingsOf(next, path), here, here + step);
    });

  const removeGroup = (path: Path) =>
    change((next) => {
      siblingsOf(next, path).splice(path[path.length - 1]!, 1);
    });

  const ask = (title: string, run: () => void) => asking.set({ title, run });

  // --- the pane ---------------------------------------------------------

  // A file chooser that is a button: the input itself is unstyleable and the
  // one thing every browser agrees on is that clicking it opens the chooser.
  const chooser = (onpick: (file: File | undefined) => unknown) => (
    <input type="file" accept="image/*" class="hidden-file"
      onchange={(e: Event) => {
        const el = e.target as HTMLInputElement;
        const file = el.files?.[0];
        el.value = "";
        onpick(file);
      }} />
  ) as unknown as HTMLInputElement;

  type Row = { i: number; item: RawItem };

  const itemRow = (path: Path, row$: ReadonlySignal<Row>) => {
    const here = () => ({ path, i: row$.peek().i });
    const input = chooser((file) => swapItem(path, row$.peek().i, file));
    const src = () => said(row$.peek().item.src);

    return (
      <li class="collection-item" draggable="true"
        ondragstart={(e: DragEvent) => {
          dragging.set(here());
          e.dataTransfer?.setData("text/plain", src());
        }}
        ondragend={() => dragging.set(null)}
        ondragover={(e: DragEvent) => { if (dragging.peek()) e.preventDefault(); }}
        ondrop={(e: DragEvent) => {
          const from = dragging.peek();
          if (!from) return;
          e.preventDefault();
          dragging.set(null);
          moveItem(from, here());
        }}
      >
        <div class="item-thumb" role="button" tabindex="0"
          aria-label="Replace this picture (same file name)"
          title="Replace this picture (same file name)"
          onclick={() => input.click()}
          onkeydown={(e: KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
          }}
          ondragover={(e: DragEvent) => e.preventDefault()}
          ondrop={(e: DragEvent) => {
            e.preventDefault();
            swapItem(path, row$.peek().i, e.dataTransfer?.files?.[0]);
          }}
        >
          <img alt="" loading="lazy" src={computed(() => thumbUrl(said(row$.get().item.src)))} />
          <span class="item-swap"><Icon name="refresh-cw" size={12} /></span>
          {input}
        </div>
        <div class="item-fields">
          <input class="item-title" placeholder="Title" aria-label="Title"
            value={row$.map((r) => said(r.item.title))}
            onchange={(e: Event) => setField(path, row$.peek().i, "title", (e.target as HTMLInputElement).value)} />
          <textarea class="item-caption" placeholder="Caption" aria-label="Caption" rows={2}
            value={row$.map((r) => said(r.item.caption))}
            onchange={(e: Event) => setField(path, row$.peek().i, "caption", (e.target as HTMLTextAreaElement).value)} />
          <span class="item-src">{row$.map((r) => said(r.item.src))}</span>
        </div>
        <div class="item-tools">
          <button class="icon-btn" aria-label="Move up" title="Move up"
            onclick={() => moveItem(here(), { path, i: row$.peek().i - 1 })}>
            <Icon name="arrow-up" size={12} />
          </button>
          <button class="icon-btn" aria-label="Move down" title="Move down"
            onclick={() => moveItem(here(), { path, i: row$.peek().i + 1 })}>
            <Icon name="arrow-down" size={12} />
          </button>
          <button class="icon-btn danger-subtle" aria-label="Remove item" title="Remove item"
            onclick={() => ask(`Remove ${said(row$.peek().item.title) || "this item"}?`,
              () => removeItem(path, row$.peek().i))}>
            <Icon name="trash-2" size={12} />
          </button>
        </div>
      </li>
    );
  };

  const groupBlock = (path: Path) => {
    const group = computed(() => groupAt(model.get(), path));
    const items = computed(() => (group.get()?.items ?? []).map((item, i) => ({ i, item })));
    const subs = computed(() => (group.get()?.groups ?? []).map((_, i) => ({ i })));
    const input = chooser((file) => addItem(path, file));

    return (
      <section class="collection-group">
        <div class="group-head">
          <input class="group-name" placeholder="Group name" aria-label="Group name"
            value={group.map(nameOf)}
            onchange={(e: Event) => renameGroup(path, (e.target as HTMLInputElement).value)} />
          <button class="icon-btn" aria-label="Move group up" title="Move group up"
            onclick={() => moveGroup(path, -1)}><Icon name="arrow-up" size={12} /></button>
          <button class="icon-btn" aria-label="Move group down" title="Move group down"
            onclick={() => moveGroup(path, 1)}><Icon name="arrow-down" size={12} /></button>
          <button class="icon-btn" aria-label="Add subgroup" title="Add subgroup"
            onclick={() => addGroup(path)}><Icon name="plus" size={12} /></button>
          <button class="icon-btn danger-subtle" aria-label="Remove group" title="Remove group"
            onclick={() => ask(`Remove ${nameOf(group.peek()) || "this group"} and its items?`,
              () => removeGroup(path))}>
            <Icon name="trash-2" size={12} />
          </button>
        </div>

        <ul class="collection-items">
          {list(items, (x) => x.i, (row$) => itemRow(path, row$))}
        </ul>

        {when(uploads, () => (
          <div class="item-drop" onclick={() => input.click()}
            ondragover={(e: DragEvent) => e.preventDefault()}
            ondrop={(e: DragEvent) => {
              e.preventDefault();
              addItem(path, e.dataTransfer?.files?.[0]);
            }}>
            <Icon name="image-plus" size={13} />
            {when(busy, () => <span>Adding…</span>, () => <span>Drop a picture here, or choose one</span>)}
            {input}
          </div>
        ))}

        {list(subs, (x) => x.i, (sub$) => groupBlock([...path, sub$.peek().i]))}
      </section>
    );
  };

  const groups = computed(() => (model.get()?.groups ?? []).map((_, i) => ({ i })));

  return (
    <div class="panel-collection">
      <PaneHeader icon="layout-grid" name={name} dirty={dirty}
        onsave={write} ondelete={removeFile} onclose={closeCollection} />
      {when(model, () => (
        <div class="collection-body">
          {when(() => !uploads.get(), () => (
            <p class="pane-note">
              This collection keeps its pictures somewhere this editor can't write
              (<code>{() => images.get().src}</code>), so items are named here and the files
              are put there another way.
            </p>
          ))}
          {list(groups, (x) => x.i, (g$) => groupBlock([g$.peek().i]))}
          <div class="collection-tools">
            <button onclick={() => addGroup(null)}><Icon name="plus" /> Add group</button>
          </div>
        </div>
      ), () => (
        <div class="placeholder">{() => trouble.get() || "reading the collection…"}</div>
      ))}
      {when(asking, () => (
        <ConfirmDialog
          title={asking.peek()!.title}
          message="This cannot be undone: duckdown has no undo."
          confirmLabel="Remove"
          onconfirm={() => { const run = asking.peek()!.run; asking.set(null); run(); }}
          oncancel={() => asking.set(null)}
        />
      ))}
    </div>
  );
}
