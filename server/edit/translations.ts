import { api, urlPath } from "./api";
import { tell } from "./notice";
import type { Row } from "../languages";
import { translations, languages, languageOf, refreshTranslations, loadFile, saveFile, editorContent, filePath, reloadBrowser, type Standings } from "./store";

export { translations, languages, languageOf, refreshTranslations, type Standings };

// A site in more than one language, in the editor (languages.ts): where each
// page and each item of a collection stands in each language, what the tree
// marks, what the open page says of its translations, and the two things that
// are done to them — start one, say one is up to date. The server keeps the
// count (routes/translations.ts); this is what the editor knows of it.
const URL_ = "/edit/translations";

// A language by its own name, which is how the person who wrote it knows it.
export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames([code], { type: "language" }).of(code) ?? code;
  } catch {
    return code;   // a tag the browser can't name is shown as it is
  }
}

// How each standing is said, to a person.
export const SAYS = {
  fresh: "up to date",
  stale: "out of date",
  unchecked: "not checked",
  own: "has no original",
  missing: "not translated yet",
} as const;

// What the tree marks on a row. A page in the default's tree says which
// language needs attention and how; one in a language's says it of itself; a
// folder counts what in it is out of date. A row that is as it should be has no
// mark: the tree is quiet until something wants attention.
export type Mark = { kind: "stale" | "unchecked" | "missing" | "draft"; text: string; title: string };

const WANTED = ["stale", "unchecked", "missing"] as const;
const SYMBOL = { stale: "↻", unchecked: "?", missing: "–" } as const;

export function marksFor(key: string, folder = false): Mark[] {
  const rows = translations.get()?.rows ?? [];
  const lang = languageOf(key);
  // A language's own tree, named by the default's: cy/blog/a.md is blog/a.md.
  const rest = lang ? key.slice(lang.length + 1) : key;

  if (folder) {
    const inside = (row: Row) => (!lang || row.lang === lang) && !row.draft && row.standing === "stale"
      && (rest === "" || row.key.startsWith(`${rest}/`));
    const count = rows.filter(inside).length;
    return count ? [{ kind: "stale", text: `↻ ${count}`, title: `${count} translation(s) out of date in here` }] : [];
  }
  if (lang) {
    const row = rows.find((r) => r.lang === lang && r.key === rest);
    if (!row) return [];
    return [
      ...(row.standing === "stale" || row.standing === "unchecked"
        ? [{ kind: row.standing, text: `${SYMBOL[row.standing]} ${SAYS[row.standing]}`, title: `${languageName(lang)}: ${SAYS[row.standing]}` } as Mark]
        : []),
      ...(row.draft ? [{ kind: "draft", text: "draft", title: "A draft: readers still have the original" } as Mark] : []),
    ];
  }
  return rows
    .filter((r) => r.key === key && !r.draft && (WANTED as readonly string[]).includes(r.standing))
    .map((r) => ({
      kind: r.standing as Mark["kind"],
      text: `${r.lang} ${SYMBOL[r.standing as keyof typeof SYMBOL]}`,
      title: `${languageName(r.lang)}: ${SAYS[r.standing]}`,
    }));
}

// What the open page's bar says. The original lists each language and where its
// translation stands; a translation says where it stands against its original.
export type Bar =
  | { kind: "original"; key: string; entries: { lang: string; standing: Row["standing"]; draft: boolean }[] }
  | { kind: "translation"; lang: string; key: string; standing: Row["standing"]; draft: boolean };

export function barFor(path: string | null): Bar | null {
  const found = translations.get();
  if (!path || !path.endsWith(".md") || !found?.others.length) return null;
  const lang = found.others.find((l) => path.startsWith(`${l}/`));
  if (lang) {
    const key = path.slice(lang.length + 1);
    const row = found.rows.find((r) => r.lang === lang && r.key === key);
    return { kind: "translation", lang, key, standing: row?.standing ?? "own", draft: row?.draft ?? false };
  }
  return {
    kind: "original",
    key: path,
    entries: found.others.map((l) => {
      const row = found.rows.find((r) => r.lang === l && r.key === path);
      return { lang: l, standing: row?.standing ?? "missing", draft: row?.draft ?? false };
    }),
  };
}

// Open a language's page.
export const openTranslation = (lang: string, key: string) => loadFile(`${lang}/${key}`);

// Begin one: the server says what it starts as (the page, a draft, saying what it
// is made from), and it is made like any page — create-only, so a translation
// already there is opened and never written over. Adding a language is
// translating its home into it. Resolves to a message when it can't be done.
export async function translate(lang: string, key: string): Promise<string | void> {
  const target = `${lang}/${key}`;
  const res = await api(`start translating ${key}`, `${URL_}?draft=${encodeURIComponent(lang)}&key=${encodeURIComponent(key)}`, undefined, [400, 412]);
  if (res.status === 400) return res.text();
  if (res.status !== 412) {
    if (!res.ok) return `Couldn't start translating ${key}`;
    const created = await api(`create ${target}`, `/edit/pages/${urlPath(target)}`,
      { method: "PUT", headers: { "If-None-Match": "*" }, body: await res.text() }, [412]);
    if (!created.ok && created.status !== 412) return `Couldn't create ${target}`;
    reloadBrowser();
  }
  await loadFile(target);
  await refreshTranslations();
  if (res.status !== 412) tell(`${target} begun as a draft, from ${key}: readers have ${key} until you take draft: off it`);
}

// The open translation says it was made from its original as it is now — the
// person has read what changed and made theirs say the same. Saved at once: it
// is an act, not an edit.
export async function markUpToDate(): Promise<boolean> {
  const bar = barFor(filePath.peek());
  if (bar?.kind !== "translation") return false;
  const res = await api(`mark ${bar.lang}/${bar.key} up to date`,
    `${URL_}?stamp=${encodeURIComponent(bar.lang)}&key=${encodeURIComponent(bar.key)}`, { method: "POST", body: editorContent.peek() });
  if (!res.ok) return false;
  editorContent.set(await res.text());
  if (!await saveFile()) return false;
  await refreshTranslations();
  return true;
}
