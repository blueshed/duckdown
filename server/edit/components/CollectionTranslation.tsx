import { createElement, signal, computed, list, when, batch } from "@blueshed/railroad";
import { PaneHeader } from "./PaneHeader";
import { Icon } from "./Icon";
import { api, apiJson, urlPath } from "../api";
import { speak } from "../notice";
import { collection, closeCollection, collectionChanged, reloadBrowser, shortName } from "../store";
import { languageName, refreshTranslations, SAYS } from "../translations";
import type { TranslationView, ItemView } from "../../collection";

// A collection in a language: the default's items beside the words the
// language gives each — a title, a caption, whatever text the collection has —
// and how each stands against the item as it is now (collection.ts). What is
// written is the language's own collection.json, which says only what is said
// differently, keyed by each item's slug: pages/cy/works/collection.json.
//
// The file is kept as it was written, so a key this pane doesn't show (the
// labels of a field's values, say) survives a save; and it is written through
// /edit/pages/ like any page, which keeps its history and drops what the site
// knows about itself. Words typed against an item that had none say what they
// were made from, since the translator is reading the item as it is; one that
// had them keeps what it said until the person says it is up to date.
type Entry = Record<string, string>;
type Raw = Record<string, unknown> & { items?: Record<string, Entry>; groups?: Record<string, string> };

export function CollectionTranslation() {
  const { folder, lang } = collection.peek()!;
  const base = folder === lang ? "" : folder.slice(lang!.length + 1);
  const view = signal<TranslationView | null>(null);
  const raw = signal<Raw>({});
  const edits = signal(0);          // bumped by each edit, so the standings follow what is typed
  const dirty = signal(false);
  const trouble = signal("");
  const name = computed(() => view.get()?.file ?? "");

  const itemsUrl = `/edit/translations?items=${encodeURIComponent(lang!)}&folder=${encodeURIComponent(base)}`;
  const fileUrl = () => `/edit/pages/${urlPath(name.peek())}`;

  const load = async () => {
    const found = await apiJson<TranslationView>(`read the translations of ${base || "the site"}`, itemsUrl);
    if (!found) { trouble.set("This folder's collection can't be read."); return; }
    // What is written now, not what the view derived from it: a 404 is just no file yet.
    const res = await api(`read ${found.file}`, `/edit/pages/${urlPath(found.file)}`, undefined, [404]);
    let file: Raw = {};
    if (res.ok) {
      try {
        file = JSON.parse(await res.text()) as Raw;
      } catch {
        trouble.set(`${found.file} isn't JSON this pane can read: fix it as text first.`);
        return;
      }
    }
    batch(() => {
      view.set(found);
      raw.set(file);
      trouble.set("");
      dirty.set(false);
    });
  };
  load();

  const entry = (slug: string): Entry => raw.peek().items?.[slug] ?? {};
  const touch = () => batch(() => { edits.update((n) => n + 1); dirty.set(true); });

  // One field of one item. The first words of an item stamp it with what it is now.
  const setWord = (item: ItemView, field: string, value: string) => {
    const items = (raw.peek().items ??= {});
    const mine = (items[item.slug] ??= {});
    const first = !Object.keys(mine).some((k) => k !== "translated-from");
    if (value) mine[field] = value; else delete mine[field];
    if (first && value) mine["translated-from"] = item.hash;
    if (!Object.keys(mine).some((k) => k !== "translated-from")) delete items[item.slug];
    touch();
  };

  const setGroup = (group: string, value: string) => {
    const groups = (raw.peek().groups ??= {});
    if (value) groups[group] = value; else delete groups[group];
    touch();
  };

  const upToDate = (item: ItemView) => {
    entry(item.slug)["translated-from"] = item.hash;
    touch();
  };

  const standing = (item: ItemView): ItemView["standing"] => {
    edits.get();
    const mine = entry(item.slug);
    if (!Object.keys(mine).some((k) => k !== "translated-from")) return "missing";
    if (!mine["translated-from"]) return "unchecked";
    return mine["translated-from"] === item.hash ? "fresh" : "stale";
  };

  const save = async (): Promise<boolean> => {
    const res = await api(`save ${name.peek()}`, fileUrl(), { method: "PUT", body: `${JSON.stringify(raw.peek(), null, 2)}\n` });
    if (!res.ok) return false;
    dirty.set(false);
    collectionChanged();
    reloadBrowser();
    await refreshTranslations();
    return true;
  };

  const remove = async () => {
    const res = await api(`delete ${name.peek()}`, fileUrl(), { method: "DELETE" }, [404]);
    if (!res.ok && res.status !== 404) return;
    closeCollection();
    reloadBrowser();
    await refreshTranslations();
  };

  const field = (item: ItemView, f: TranslationView["fields"][number]) => {
    const id = `tr-${item.slug}-${f.name}`;
    const words = entry(item.slug)[f.name] ?? "";
    const commit = (e: Event) => setWord(item, f.name, (e.target as HTMLInputElement).value);
    return (
      <div class="item-field">
        <label for={id}>{f.label}</label>
        <span class="field-default" lang="und">{item.fields[f.name] ?? ""}</span>
        {f.kind === "long"
          ? <textarea id={id} class="item-input item-long" data-field={f.name} lang={lang} rows={3} value={words} onchange={commit} />
          : <input id={id} class="item-input" data-field={f.name} lang={lang} value={words} onchange={commit} />}
      </div>
    );
  };

  return (
    <div class="panel-collection" tabindex="-1">
      <PaneHeader icon="languages" name={name} shown={computed(() => shortName(name.get()))} dirty={dirty}
        onsave={save} ondelete={remove} onclose={closeCollection}
        url={fileUrl} onrestored={load} />
      {when(view, () => (
        <div class="collection-body">
          <div class="collection-grid translation-pane">
            <p class="pane-note">{`The words of ${languageName(lang!)} for the works of ${base || "the site"}: what the original says is above each box.`}</p>
            {when(() => view.get()!.groups.length > 0, () => (
              <section class="translation-groups">
                <h4>Group names</h4>
                {list(computed(() => view.get()!.groups), (g) => g.name, (g$) => {
                  const id = `tr-group-${g$.peek().name}`;
                  return (
                    <div class="item-field">
                      <label for={id}>{g$.map((g) => g.label)}</label>
                      <input id={id} class="item-input" data-group={g$.peek().name} lang={lang}
                        value={raw.peek().groups?.[g$.peek().name] ?? ""} onchange={(e: Event) => setGroup(g$.peek().name, (e.target as HTMLInputElement).value)} />
                    </div>
                  );
                })}
              </section>
            ))}
            <ul class="translation-items">
              {list(computed(() => view.get()!.items), (i) => i.slug, (i$) => (
                <li class="translation-item">
                  <div class="translation-item-head">
                    {when(() => !!i$.get().thumb, () => <img class="thumb" src={i$.map((i) => i.thumb)} alt="" />)}
                    <strong class="item-title">{i$.map((i) => i.fields.title || i.slug)}</strong>
                    <span class="translation-state">{computed(() => SAYS[standing(i$.get())])}</span>
                    {when(() => ["stale", "unchecked"].includes(standing(i$.get())), () => (
                      <button type="button" class="up-to-date" onclick={() => upToDate(i$.peek())}
                        title="You have read what changed, and the words here say the same">
                        <Icon name="refresh-cw" size={12} /> Up to date
                      </button>
                    ))}
                  </div>
                  {view.peek()!.fields.map((f) => field(i$.peek(), f))}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ), () => (
        <div class="placeholder">{() => trouble.get() || "reading the collection…"}</div>
      ))}
    </div>
  );
}
