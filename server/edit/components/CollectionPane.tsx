import {
  createElement, signal, computed, effect, list, when, batch, type ReadonlySignal,
} from "@blueshed/railroad";
import { PaneHeader } from "./PaneHeader";
import { ConfirmDialog } from "./ConfirmDialog";
import { Icon } from "./Icon";
import { Drawer } from "./Drawer";
import { api, apiJson, urlPath } from "../api";
import { speak, tell, hush, news } from "../notice";
import {
  collection, collectionKey, closeCollection, collectionChanged, reloadBrowser, shortName, leftDrawer,
} from "../store";
import { type Images, ownImages, imageUrl, thumbName } from "../../images";
import { slugger, aliasKey, itemHref } from "../../slugs";
import type { Field } from "../../collection";

// A folder's collection.json, edited as what it is: groups of items, each a
// picture and the fields the file declares — a title, a caption, a year. The
// alternative — and what a site lived with until now — is typing JSON with the
// commas in the right places, which is fine for three items and hopeless for
// four hundred.
//
// It opens in the slot a resource uses, below the page, because a collection
// belongs to the folder whose index page is its overview: you edit the works
// and watch the overview redraw beside them. The works are drawn as what they
// are, pictures in their groups, and the one you choose has its fields beside
// them: a pane that drew every work as a card of inputs showed two at a time,
// and this one shows the collection.
//
// Every change writes the whole file through /edit/pages/, which is the write
// path that drops the nav, the search index and the collection cache. Because
// every change is the whole file, undo is cheap: the pane keeps the files it
// replaced, and undo writes the one before. That lasts as long as the pane is
// open; after that, Earlier versions (the server's history) is the way back.

// The file as it is written, not as collection.ts reads it: the pane keeps
// every key it doesn't understand (an index, prints, anything undeclared)
// exactly where it found it, and touches only the fields it shows.
type RawItem = Record<string, unknown> & { title?: unknown; aliases?: unknown };
type RawGroup = Record<string, unknown> & { name?: unknown; label?: unknown; items?: RawItem[]; groups?: RawGroup[] };
type RawFile = Record<string, unknown> & { groups?: RawGroup[] };

// `fields` as the server reads them: the plain three when the file declares none.
type Info = { fields: Field[]; images: Images; uploads: boolean; problems: string[] };
type Upload = { name: string; src: string; thumb: string; v: string };

// A group by its position: [1] is the second group, [1, 0] the first subgroup
// of it. Positions, not names, because two groups may be called the same thing
// — the gallery this came from has two 1960 sections called London.
type Path = number[];
// A work by where it is: its group's path and its place in that group.
type Spot = { path: Path; i: number };

export const same = (a: Spot | null, b: Spot) =>
  !!a && a.i === b.i && a.path.length === b.path.length && a.path.every((n, k) => n === b.path[k]);

// The first work in the file, in the order the site shows them: a group's
// works, then its subgroups'.
export function firstWork(file: RawFile): Spot | null {
  const walk = (groups: RawGroup[] | undefined, path: Path): Spot | null => {
    for (const [g, group] of (groups ?? []).entries()) {
      if (group.items?.length) return { path: [...path, g], i: 0 };
      const inner = walk(group.groups, [...path, g]);
      if (inner) return inner;
    }
    return null;
  };
  return walk(file.groups, []);
}

let fieldIds = 0;

const said = (value: unknown) => (typeof value === "string" ? value : "");
// A value as the site reads it: a year written as 1961 rather than "1961" is
// still a year.
const asText = (value: unknown): string | null =>
  typeof value === "string" ? value : typeof value === "number" ? String(value) : null;
// The entries of a list the site will read, which are the objects in it.
const objects = <T,>(value: unknown): T[] =>
  (Array.isArray(value) ? value.filter((v) => typeof v === "object" && v !== null) : []) as T[];

// Every item's address, in the order the site hands them out — each group's
// items, then its subgroups — through the same slugger the server uses. The
// item is the object in the file, so a before and an after taken from the one
// file line up item for item.
export function itemAddresses(file: RawFile, folder: string): { item: RawItem; href: string }[] {
  const slugOf = slugger();
  const out: { item: RawItem; href: string }[] = [];
  const walk = (groups: unknown) => {
    for (const group of objects<RawGroup>(groups)) {
      for (const item of objects<RawItem>(group.items)) {
        out.push({ item, href: itemHref(folder, slugOf(asText(item.slug), asText(item.title) ?? "")) });
      }
      walk(group.groups);
    }
  };
  walk(file.groups);
  return out;
}

// A work renamed is a work moved: its slug comes from its title, so the
// address it was published at would 404. Every item whose address changed
// between `before` and now keeps the old one as an alias — when the site had
// served it (it is in `published`, the addresses the file had when the pane
// opened it: a work added in this session, or a title half-way through being
// changed, was never an address anyone linked to) and when no item answers at
// it now (an item wins over an alias, so that alias would be dead). Renaming
// back takes the alias off again. Answers a line to say for each alias made.
export function keepAddresses(
  before: { item: RawItem; href: string }[], file: RawFile, folder: string, published: Set<string>,
): string[] {
  const after = itemAddresses(file, folder);
  const live = new Set(after.map((a) => aliasKey(a.href)));
  const at = (key: string, alias: unknown) => typeof alias === "string" && aliasKey(alias) === key;
  const lines: string[] = [];
  after.forEach(({ item, href }, k) => {
    const was = before[k]!.href;
    if (was === href) return;
    const had = Array.isArray(item.aliases) ? item.aliases as unknown[] : [];
    const now = aliasKey(href);
    const kept = had.filter((alias) => !at(now, alias));
    const old = aliasKey(was);
    if (published.has(old) && !live.has(old) && !kept.some((alias) => at(old, alias))) {
      kept.push(was);
      lines.push(`${asText(item.title) || "That item"} is now ${href}; the old address still leads there.`);
    }
    if (kept.length) item.aliases = kept;
    else delete item.aliases;
  });
  return lines;
}

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

// Steps an open pane can take back. Each is a whole file, so this is a bound
// on memory rather than on patience: four hundred works is ~100KB a step.
export const UNDO_LIMIT = 100;

// A picture's file name as a starting title: "First Light.jpg" → "First
// Light". It is a guess, shown in an input, and changed in a second.
const titleFrom = (name: string) => name.replace(/\.[^.]+$/, "");

export function CollectionPane() {
  let folder = collection.peek()?.folder ?? "";
  const name = signal("");
  const model = signal<RawFile | null>(null);
  const images = signal<Images>(ownImages());
  const fields = signal<Field[]>([]);
  const uploads = signal(true);
  // The addresses the file had when it was opened: the ones worth keeping.
  let published = new Set<string>();
  const dirty = signal(false);
  const busy = signal(false);
  const trouble = signal("");
  // A picture swapped in place keeps its address, so the browser has the old
  // bytes: ?v= is what makes it fetch the new ones.
  const busts = signal<Record<string, string>>({});
  const dragging = signal<Spot | null>(null);
  const asking = signal<{ title: string; run: () => void } | null>(null);
  // The files this sitting has replaced, and the ones undo has stepped back
  // from. Each is a whole file: the model is never changed in place, only
  // replaced (change() clones), so keeping one is keeping a reference.
  const past = signal<RawFile[]>([]);
  const future = signal<RawFile[]>([]);
  const canUndo = computed(() => past.get().length > 0);
  const canRedo = computed(() => future.get().length > 0);
  // The work whose properties the drawer at the left shows, by position, like
  // a group. Choosing one opens the drawer; closing it leaves the choice.
  const chosen = signal<Spot | null>(null);
  const showing = signal(false);
  const chosenItem = computed(() => {
    const at = chosen.get();
    return at ? groupAt(model.get(), at.path)?.items?.[at.i] ?? null : null;
  });

  const key = () => collectionKey(folder);
  const fileUrl = () => `/edit/pages/${urlPath(key())}`;
  const infoUrl = () => `/edit/collection/${urlPath(folder)}`;

  // --- reading and writing ---------------------------------------------

  let spoken = "";
  const check = async () => {
    const info = await apiJson<Info>(`read ${key()}`, infoUrl());
    if (!info) return false;
    batch(() => {
      images.set(info.images);
      fields.set(info.fields);
      uploads.set(info.uploads);
    });
    // Failures speak: a slug that collides with a page is a work nobody can
    // reach, and the person who can fix it is looking at this pane.
    const problems = info.problems.join(" ");
    if (problems && problems !== spoken) speak(problems);
    spoken = problems;
    return true;
  };

  const load = async () => {
    // Where the pictures are and what the fields are first, so no item is
    // ever drawn against the wrong base or with the wrong inputs, and no
    // thumbnail is fetched from an address it never had. Without them (the
    // failure has spoken) nothing is drawn at all.
    if (!(await check())) return;
    const res = await api(`open ${key()}`, fileUrl());
    if (!res.ok) return;
    const body = await res.text();
    try {
      const parsed: unknown = JSON.parse(body);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("it isn't an object");
      }
      published = new Set(itemAddresses(parsed as RawFile, folder).map((a) => aliasKey(a.href)));
      batch(() => {
        model.set(parsed as RawFile);
        past.set([]);
        future.set([]);
      });
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
  // What the next write that lands should tell you it did (an old address
  // kept). Said once the file is written, not when it is asked for: a rename
  // that never reached the server kept nothing, and Save says it when it does.
  let kept: string[] = [];
  const put = async () => {
    const res = await api(`save ${key()}`, fileUrl(), {
      method: "PUT",
      body: `${JSON.stringify(model.peek(), null, 2)}\n`,
    });
    if (!res.ok) return;           // api has spoken; the pane stays dirty
    dirty.set(false);
    if (kept.length) tell(kept.splice(0).join(" "));
    collectionChanged();           // the preview renders the overview again
    await check();                 // and a problem the change made outranks the news
  };
  const write = () => (queue = queue.then(put));

  const change = (fn: (file: RawFile) => void) => {
    const next = structuredClone(model.peek()) as RawFile | null;
    if (!next) return Promise.resolve();
    fn(next);
    batch(() => {
      past.update((p) => [...p.slice(1 - UNDO_LIMIT), model.peek()!]);
      future.set([]);
      model.set(next);
      dirty.set(true);
    });
    return write();
  };

  // One step back, or forward again, written like any other change. An old
  // address a rename kept goes with the rename: the file it is undone to never
  // had it, and news of it on screen is no longer true. A failure stays said.
  const step = (from: typeof past, to: typeof past) => {
    const stack = from.peek();
    if (!stack.length) return Promise.resolve();
    kept.length = 0;
    if (news.peek()) hush();
    batch(() => {
      to.update((t) => [...t, model.peek()!]);
      from.set(stack.slice(0, -1));
      model.set(stack.at(-1)!);
      dirty.set(true);
    });
    return write();
  };
  const undo = () => step(past, future);
  const redo = () => step(future, past);

  // ⌘Z and ⇧⌘Z (or Ctrl), anywhere in the pane but a field being typed in,
  // which has its own undo for the words not yet committed.
  const onkeydown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (!(e.metaKey || e.ctrlKey) || (key !== "z" && key !== "y")) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    e.preventDefault();
    if (e.shiftKey || key === "y") redo();
    else undo();
  };

  // A version put back from Earlier versions is a new starting point: the
  // sitting's steps were steps from a file that is no longer there.
  const restored = async () => {
    await load();
    collectionChanged();
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

  // Whatever the file becomes — an undo, a removal, another collection — a
  // work is chosen while there is one, and the first when the last is gone.
  effect(() => {
    const file = model.get();
    if (!file) return;
    const at = chosen.peek();
    if (!at || !groupAt(file, at.path)?.items?.[at.i]) chosen.set(firstWork(file));
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

  // The field that is the picture — "" when the file declares none, and then
  // an item is words only — and the ones that are typed.
  const imageField = () => fields.peek().find((f) => f.kind === "image")?.name ?? "";
  const typed = () => fields.peek().filter((f) => f.kind !== "image");

  // A new item says every declared field, empty, so the file shows what an
  // item is made of; a title starts as the picture's name.
  const blank = (picture: string): RawItem => {
    const item: RawItem = {};
    const image = imageField();
    if (image) item[image] = picture;
    for (const f of typed()) item[f.name] = f.name === "title" ? titleFrom(picture) : "";
    return item;
  };

  // A new work is the one you are about to name, so it is chosen.
  const pushItem = (path: Path, item: RawItem) => {
    let at: Spot | null = null;
    const done = change((next) => {
      const group = groupAt(next, path);
      if (group) at = { path, i: (group.items ??= []).push(item) - 1 };
    });
    if (at) chosen.set(at);
    return done;
  };

  const addItem = async (path: Path, file: File | undefined) => {
    if (!file) return;
    const up = await send(file, null);
    if (!up) return;
    bust(up.name, up.v);
    await pushItem(path, blank(up.name));
  };

  // In place, under the same file name: collection.json doesn't change, so the
  // item keeps its address and every link to it goes on working.
  const swapItem = async (path: Path, i: number, file: File | undefined) => {
    if (!file) return;
    const image = imageField();
    const src = said(groupAt(model.peek(), path)?.items?.[i]?.[image]);
    if (!src) {
      speak(`That item has no picture to replace — its ${image} is empty.`);
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

  // The picture itself, for the drawer, where a thumbnail would be a blur.
  const pictureUrl = (src: string) => {
    if (!src) return "";
    const url = imageUrl(images.get().src, src);
    const v = busts.get()[src];
    return v ? `${url}?v=${v}` : url;
  };

  // --- the shape of the file -------------------------------------------

  // A committed edit — the input's change, not each keystroke — so the address
  // an item had before is the one it was published at, not half a title.
  const setField = (path: Path, i: number, field: string, value: string) =>
    change((next) => {
      const item = groupAt(next, path)?.items?.[i];
      if (!item) return;
      const before = itemAddresses(next, folder);
      item[field] = value;
      kept.push(...keepAddresses(before, next, folder, published));
    });

  // The choice goes with the work, wherever it lands.
  const moveItem = (from: Spot, to: Spot) => {
    let landed: Spot | null = null;
    const done = change((next) => {
      const source = groupAt(next, from.path)?.items;
      const target = groupAt(next, to.path)?.items;
      if (!source || !target) return;
      const [held] = source.splice(from.i, 1);
      const i = Math.max(0, Math.min(to.i, target.length));
      target.splice(i, 0, held!);
      landed = { path: to.path, i };
    });
    if (landed && same(chosen.peek(), from)) chosen.set(landed);
    return done;
  };

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

  // What a button does with the keyboard, for the two places that can't be a
  // <button> because the chooser's <input> sits inside them.
  const onpress = (run: () => void) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); run(); }
  };

  type Row = { i: number; item: RawItem };

  // One input per declared field, named as the file labels it, for the chosen
  // work: a line for text and numbers, a box for long text. Every value stays
  // a string — a number field may say "skip", which an <input type=number>
  // would refuse.
  const fieldInput = (field: Field) => {
    const value = chosenItem.map((item) => asText(item?.[field.name]) ?? "");
    const commit = (e: Event) => {
      const at = chosen.peek();
      if (at) setField(at.path, at.i, field.name, (e.target as HTMLInputElement).value);
    };
    const id = `field-${++fieldIds}`;
    return (
      <div class="item-field">
        <label for={id}>{field.label}</label>
        {field.kind === "long"
          ? <textarea id={id} class="item-input item-long" data-field={field.name} rows={3} value={value} onchange={commit} />
          : <input id={id} class="item-input" data-field={field.name} value={value} onchange={commit} />}
      </div>
    );
  };

  // A work in the grid: its picture (or, with no picture field, its title),
  // and a button that chooses it. Dragged, it moves.
  const tile = (path: Path, row$: ReadonlySignal<Row>) => {
    const here = () => ({ path, i: row$.peek().i });
    const image = imageField();
    const title = row$.map((r) => said(r.item.title) || said(r.item[image]) || "Untitled");
    const on = computed(() => same(chosen.get(), { path, i: row$.get().i }));

    return (
      <li class="collection-item" draggable="true"
        ondragstart={(e: DragEvent) => {
          dragging.set(here());
          e.dataTransfer?.setData("text/plain", said(row$.peek().item[image]));
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
        <button type="button" class="item-tile" aria-pressed={on.map(String)} title={title}
          onclick={() => batch(() => { chosen.set(here()); showing.set(true); })}>
          {image
            ? <img alt="" loading="lazy" src={computed(() => thumbUrl(said(row$.get().item[image])))} />
            : null}
          <span class="item-title">{title}</span>
        </button>
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
          {list(items, (x) => x.i, (row$) => tile(path, row$))}
          {/* A work begins as its picture — or, in a collection with no
              picture field, as a row of empty fields. The last tile adds one. */}
          <li class="collection-add">
            {imageField() ? when(uploads, () => (
              <div class="item-drop" role="button" tabindex="0"
                aria-label="Add a work: drop a picture here, or choose one"
                title="Drop a picture here, or choose one"
                onclick={() => input.click()} onkeydown={onpress(() => input.click())}
                ondragover={(e: DragEvent) => e.preventDefault()}
                ondrop={(e: DragEvent) => {
                  e.preventDefault();
                  addItem(path, e.dataTransfer?.files?.[0]);
                }}>
                <Icon name="image-plus" size={16} />
                {when(busy, () => <span class="item-title">Adding…</span>)}
                {input}
              </div>
            )) : (
              <button class="item-drop" aria-label="Add item" title="Add item" onclick={() => pushItem(path, blank(""))}>
                <Icon name="plus" size={16} /><span class="visually-hidden">Add item</span>
              </button>
            )}
          </li>
        </ul>

        {list(subs, (x) => x.i, (sub$) => groupBlock([...path, sub$.peek().i]))}
      </section>
    );
  };

  // The chosen work's properties, in the drawer at the left. Its picture is the
  // control that replaces it, as it always was: click it, or drop one on it.
  const chosenPanel = () => {
    const image = imageField();
    const input = chooser((file) => { const at = chosen.peek(); if (at) swapItem(at.path, at.i, file); });
    const src = chosenItem.map((item) => said(item?.[image]));
    const at = () => chosen.peek()!;
    return (
      <aside class="collection-chosen" aria-label={chosenItem.map((item) => `The work: ${said(item?.title) || "untitled"}`)}>
        {image ? (
          <div class="item-thumb" role="button" tabindex="0"
            aria-label="Replace this picture (same file name)"
            title="Replace this picture (same file name)"
            onclick={() => input.click()}
            onkeydown={onpress(() => input.click())}
            ondragover={(e: DragEvent) => e.preventDefault()}
            ondrop={(e: DragEvent) => {
              e.preventDefault();
              swapItem(at().path, at().i, e.dataTransfer?.files?.[0]);
            }}
          >
            <img alt="" src={computed(() => pictureUrl(src.get()))} />
            <span class="item-swap"><Icon name="refresh-cw" size={12} /></span>
            {input}
          </div>
        ) : null}
        {typed().map(fieldInput)}
        <div class="item-tools">
          {image ? <span class="item-src">{src}</span> : null}
          <span class="pane-gap" />
          <button class="icon-btn" aria-label="Move up" title="Move up"
            onclick={() => moveItem(at(), { path: at().path, i: at().i - 1 })}>
            <Icon name="arrow-up" size={12} />
          </button>
          <button class="icon-btn" aria-label="Move down" title="Move down"
            onclick={() => moveItem(at(), { path: at().path, i: at().i + 1 })}>
            <Icon name="arrow-down" size={12} />
          </button>
          <button class="icon-btn danger-subtle" aria-label="Remove item" title="Remove item"
            onclick={() => { const was = at(); ask(`Remove ${said(chosenItem.peek()?.title) || "this item"}?`, () => removeItem(was.path, was.i)); }}>
            <Icon name="trash-2" size={12} />
          </button>
        </div>
      </aside>
    );
  };

  const groups = computed(() => (model.get()?.groups ?? []).map((_, i) => ({ i })));

  // The drawer at the left holds the chosen work while it is shown — over the
  // tree, so the preview keeps showing the page as the work changes. Escape or
  // its close button puts it away; the choice stays marked in the grid. It
  // goes with the pane, and with the last work.
  const workDrawer = () => (
    <Drawer side="left" icon="image" close="Close the work" onclose={() => showing.set(false)} onkey={onkeydown}
      title={() => said(chosenItem.get()?.title) || "Untitled"}>
      {when(chosenItem, chosenPanel)}
    </Drawer>
  );
  effect(() => {
    const open = showing.get() && chosenItem.get() !== null;
    leftDrawer.set(open ? workDrawer : null);
  });
  effect(() => () => { if (leftDrawer.peek() === workDrawer) leftDrawer.set(null); });

  return (
    <div class="panel-collection" tabindex="-1" onkeydown={onkeydown}>
      <PaneHeader icon="layout-grid" name={name} shown={computed(() => shortName(name.get()))} dirty={dirty}
        onsave={write} ondelete={removeFile} onclose={closeCollection}
        url={fileUrl} onrestored={restored}
        undo={{ onundo: undo, onredo: redo, canUndo, canRedo }} />
      {when(model, () => (
        <div class="collection-body">
          <div class="collection-grid">
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
        </div>
      ), () => (
        <div class="placeholder">{() => trouble.get() || "reading the collection…"}</div>
      ))}
      {when(asking, () => (
        <ConfirmDialog
          title={asking.peek()!.title}
          message="Undo (⌘Z) brings it back."
          confirmLabel="Remove"
          onconfirm={() => { const run = asking.peek()!.run; asking.set(null); run(); }}
          oncancel={() => asking.set(null)}
        />
      ))}
    </div>
  );
}
