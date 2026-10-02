import { createElement, signal, computed, effect, list, when } from "@blueshed/railroad";
import { Icon } from "./Icon";
import { Drawer } from "./Drawer";
import {
  refreshTranslations, languageName, translate, begin, markUpToDate, barFor, isBehind, isWanted, SAYS, SYMBOL,
} from "../translations";
import {
  translations, languages, browserRevision, resourceRevision, collectionRevision, filePath, loadFile, openCollection,
  drawer, toggleDrawer, closeDrawer, COLLECTION_FILE,
} from "../store";
import { joinKey } from "../../slugs";
import type { Standing } from "../../standing";

// A site in more than one language, in the editor (translations.ts): the
// header's button and its badge, the bar over the open page, and the drawer
// that lists what wants attention across the site.

const words = (standing: Standing, draft: boolean) => `${SAYS[standing]}${draft ? " · draft" : ""}`;

// How many translations have fallen behind: what the button says, since it is
// the thing to look at before the next Publish.
const behind = computed(() => (translations.get()?.rows ?? []).filter((r) => r.standing === "stale" && !r.draft).length);

// The header's button, with the count of what is out of date. It is always
// there: a site with one language adds its second from the drawer. It asks the
// server again whenever something is written, as Publish does.
export function TranslationsButton() {
  effect(() => {
    browserRevision.get();
    resourceRevision.get();
    collectionRevision.get();
    const timer = setTimeout(refreshTranslations, 400);
    return () => clearTimeout(timer);
  });
  return (
    <button class="translations-button" onclick={() => toggleDrawer("translations")} aria-expanded={drawer.map((d) => String(d === "translations"))}>
      <Icon name="languages" /> <span class="label">Translations</span>
      {when(behind, () => <span class="badge" role="img" aria-label={behind.map((n) => `${n} out of date`)}>{behind}</span>)}
    </button>
  );
}

// Over the open page: where its translations stand, and the two things to do
// about them. The original lists each language; a translation says where it
// stands against its original, and — when the original has moved on — lets the
// person say they have caught up.
export function TranslationBar() {
  const bar = computed(() => barFor(filePath.get()));
  const entries = computed(() => {
    const b = bar.get();
    return b?.kind === "original" ? b.entries : [];
  });
  const translation = computed(() => {
    const b = bar.get();
    return b?.kind === "translation" ? b : null;
  });
  const original = computed(() => bar.get()?.key ?? "");

  return when(bar, () => (
    <div class="translation-bar" role="group" aria-label="Translations of this page">
      {when(() => entries.get().length > 0, () => (
        <ul class="translation-entries">
          {list(entries, (e) => e.lang, (e$) => (
            <li>
              <span class="translation-lang" lang={e$.map((e) => e.lang)}>{e$.map((e) => languageName(e.lang))}</span>
              <span class="translation-state">{e$.map((e) => words(e.standing, e.draft))}</span>
              <button type="button"
                aria-label={e$.map((e) => `${e.standing === "missing" ? "Translate into" : "Open the"} ${languageName(e.lang)}${e.standing === "missing" ? "" : " translation"}`)}
                onclick={() => begin(e$.peek().lang, original.peek(), e$.peek().standing)}>
                {e$.map((e) => (e.standing === "missing" ? "Translate" : "Open"))}
              </button>
            </li>
          ))}
        </ul>
      ))}
      {when(translation, () => (
        <div class="translation-line">
          <span class="translation-lang" lang={translation.map((t) => t?.lang ?? "")}>{translation.map((t) => (t ? languageName(t.lang) : ""))}</span>
          <span class="translation-state">{translation.map((t) => (t ? words(t.standing, t.draft) : ""))}</span>
          {when(() => translation.get()?.standing !== "own", () => (
            <button type="button" onclick={() => loadFile(translation.peek()!.key)}>Open original</button>
          ))}
          {when(() => isBehind(translation.get()?.standing ?? "own"), () => (
            <button type="button" onclick={markUpToDate}
              title="You have read what changed, and this says the same">
              <Icon name="refresh-cw" size={12} /> Mark up to date
            </button>
          ))}
        </div>
      ))}
    </div>
  ));
}

// What wants attention, by language: out of date first, then what can't be
// checked, then what nobody has begun — every page and every item of a
// collection, each a way to the thing itself. A draft is being worked on, and
// is nobody's problem yet. It stops at a hundred a language: past that the
// list is no use as a list.
const ORDER = Object.keys(SYMBOL);
const LIMIT = 100;
const collator = new Intl.Collator();
type Entry = { key: string; standing: Standing; draft: boolean };

const wanted = (lang: string): { entries: Entry[]; more: number } => {
  const all = (translations.get()?.rows ?? [])
    .filter((r) => r.lang === lang && !r.draft && isWanted(r.standing))
    .sort((a, b) => ORDER.indexOf(a.standing) - ORDER.indexOf(b.standing) || collator.compare(a.key, b.key));
  return { entries: all.slice(0, LIMIT), more: Math.max(all.length - LIMIT, 0) };
};

// An item's row is named for the collection: "works/collection.json#first-light".
const ITEM = `${COLLECTION_FILE}#`;
const itemOf = (key: string) => {
  const at = key.indexOf(ITEM);
  return at < 0 ? null : { folder: key.slice(0, Math.max(at - 1, 0)), slug: key.slice(at + ITEM.length) };
};
const labelOf = (key: string) => {
  const item = itemOf(key);
  return item ? `${item.slug}${item.folder ? ` (${item.folder})` : ""}` : key;
};

// An item opens its words; a page is opened, or begun when nobody has.
async function go(lang: string, entry: Entry): Promise<void> {
  const item = itemOf(entry.key);
  if (item) openCollection(joinKey(lang, item.folder), lang);
  else await begin(lang, entry.key, entry.standing);
}

export function TranslationsDrawer() {
  refreshTranslations();
  const error = signal("");
  const busy = signal(false);
  const groups = computed(() => languages.get().map((lang) => ({ lang, ...wanted(lang) })));

  const add = async (e: Event) => {
    e.preventDefault();
    const input = (e.target as HTMLFormElement).elements.namedItem("code") as HTMLInputElement;
    const code = input.value.trim().toLowerCase();
    if (!code) return;
    busy.set(true);
    error.set("");
    const message = await translate(code, "index.md");
    busy.set(false);
    if (message) error.set(message);
    else input.value = "";
  };

  return (
    <Drawer icon="languages" title="Translations" close="Close translations" onclose={closeDrawer}>
      <div class="drawer-body">
        {when(() => languages.get().length === 0, () => (
          <p class="dialog-hint">This site is in one language. Add another below: it starts with the home page, as a draft, and every other page is shown in the first language, with a note, until it is translated.</p>
        ))}
        {list(groups, (g) => g.lang, (g$) => (
          <section class="translation-group">
            <h4 lang={g$.map((g) => g.lang)}>{g$.map((g) => languageName(g.lang))}</h4>
            {when(() => g$.get().entries.length === 0, () => <p class="dialog-hint">Everything is translated, and up to date.</p>)}
            <ul class="history-list">
              {list(computed(() => g$.get().entries), (r) => r.key, (r$) => (
                <li>
                  <button type="button" class="row" onclick={() => go(g$.peek().lang, r$.peek())}>
                    <span class="history-label" title={r$.map((r) => labelOf(r.key))}>{r$.map((r) => labelOf(r.key))}</span>
                    <span class="history-detail">{r$.map((r) => SAYS[r.standing])}</span>
                  </button>
                </li>
              ))}
            </ul>
            {when(() => g$.get().more > 0, () => <p class="dialog-hint">{() => `…and ${g$.get().more} more.`}</p>)}
          </section>
        ))}
        {when(error, () => <p class="dialog-error" role="alert">{error}</p>)}
      </div>
      <div class="drawer-foot">
        <form class="editor-add" onsubmit={add}>
          <input name="code" placeholder="Add a language: cy, fr, pt-br" aria-label="Add a language: its code, like cy, fr or pt-br" autocomplete="off" />
          <button type="submit" class="primary" disabled={busy}><Icon name="plus" size={12} /> Add</button>
        </form>
      </div>
    </Drawer>
  );
}
