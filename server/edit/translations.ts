import { computed } from "@blueshed/railroad";
import { api, urlPath } from "./api";
import { tell } from "./notice";
import type { Row } from "../languages";
import { SAYS, isWanted, type Standing, type Wanted } from "../standing";
import { translations, languages, languageOf, refreshTranslations, loadFile, saveFile, editorContent, filePath, reloadBrowser } from "./store";

export { refreshTranslations, SAYS, isWanted, type Wanted };

// A site in more than one language, in the editor (languages.ts): where each
// page and each item of a collection stands in each language, what the tree
// marks, what the open page says of its translations, and the two things that
// are done to them — start one, say one is up to date. The server keeps the
// count (routes/translations.ts); this is what the editor knows of it.
const URL_ = "/edit/translations";

// A language by its own name, which is how the person who wrote it knows it:
// the server's (translations.names), since the browser's locale data may not
// have it. A code it hasn't been told is shown as it is.
export const languageName = (code: string): string => translations.peek()?.names[code] ?? code;

// The symbol each standing that wants attention is marked with.
export const SYMBOL: Record<Wanted, string> = { stale: "↻", unchecked: "?", missing: "–" };
export const isBehind = (standing: Standing) => standing === "stale" || standing === "unchecked";

// What the tree and the bar ask of the rows, found once per refresh rather than
// by a scan of all of them for each row drawn: a row by language and key, a
// page's row in each language, and how many translations are out of date
// under each folder, of one language ("cy\0blog") and of any ("\0blog").
const index = computed(() => {
  const byLang = new Map<string, Row>();
  const byKey = new Map<string, Row[]>();
  const stale = new Map<string, number>();
  for (const row of translations.get()?.rows ?? []) {
    byLang.set(`${row.lang}\0${row.key}`, row);
    byKey.set(row.key, [...byKey.get(row.key) ?? [], row]);
    if (row.standing !== "stale" || row.draft) continue;
    const folders = row.key.split("/");
    folders.pop();                                   // the file's own name
    for (let i = 0; i <= folders.length; i++) {      // "", "a", "a/b": every folder it is in
      const folder = folders.slice(0, i).join("/");
      for (const at of [`${row.lang}\0${folder}`, `\0${folder}`]) stale.set(at, (stale.get(at) ?? 0) + 1);
    }
  }
  return { byLang, byKey, stale };
});

const rowFor = (lang: string, key: string) => index.get().byLang.get(`${lang}\0${key}`);

// What the tree marks on a row. A page in the default's tree says which
// language needs attention and how; one in a language's says it of itself; a
// folder counts what in it is out of date. A row that is as it should be has no
// mark: the tree is quiet until something wants attention.
export type Mark = { kind: Wanted | "draft"; text: string; title: string };

export function marksFor(key: string): Mark[] {
  const lang = languageOf(key);
  if (!lang) {
    return (index.get().byKey.get(key) ?? [])
      .filter((r) => !r.draft && isWanted(r.standing))
      .map((r) => ({ kind: r.standing as Wanted, text: `${r.lang} ${SYMBOL[r.standing as Wanted]}`, title: `${languageName(r.lang)}: ${SAYS[r.standing]}` }));
  }
  // A language's own tree, named by the default's: cy/blog/a.md is blog/a.md.
  const row = rowFor(lang, key.slice(lang.length + 1));
  const marks: Mark[] = [];
  if (row && isBehind(row.standing)) {
    marks.push({ kind: row.standing as Wanted, text: `${SYMBOL[row.standing as Wanted]} ${SAYS[row.standing]}`, title: `${languageName(lang)}: ${SAYS[row.standing]}` });
  }
  if (row?.draft) marks.push({ kind: "draft", text: "draft", title: "A draft: readers still have the original" });
  return marks;
}

// A folder says how many translations in it are out of date.
export function folderMarks(path: string): Mark[] {
  const lang = languageOf(path);
  const count = index.get().stale.get(`${lang ?? ""}\0${lang ? path.slice(lang.length + 1) : path}`) ?? 0;
  return count ? [{ kind: "stale", text: `${SYMBOL.stale} ${count}`, title: `${count} translation(s) out of date in here` }] : [];
}

// What the open page's bar says. The original lists each language and where its
// translation stands; a translation says where it stands against its original.
export type Bar =
  | { kind: "original"; key: string; entries: { lang: string; standing: Standing; draft: boolean }[] }
  | { kind: "translation"; lang: string; key: string; standing: Standing; draft: boolean };

export function barFor(path: string | null): Bar | null {
  if (!path || !path.endsWith(".md") || !languages.get().length) return null;
  const lang = languageOf(path);
  if (lang) {
    const key = path.slice(lang.length + 1);
    const row = rowFor(lang, key);
    return { kind: "translation", lang, key, standing: row?.standing ?? "own", draft: row?.draft ?? false };
  }
  return {
    kind: "original",
    key: path,
    entries: languages.get().map((l) => {
      const row = rowFor(l, path);
      return { lang: l, standing: row?.standing ?? "missing", draft: row?.draft ?? false };
    }),
  };
}

// Open a language's page.
export const openTranslation = (lang: string, key: string) => loadFile(`${lang}/${key}`);

// Open a page's translation, or begin it when there is none.
export const begin = (lang: string, key: string, standing: Standing) =>
  standing === "missing" ? translate(lang, key) : openTranslation(lang, key);

// Begin one: the server says what it starts as (the page, a draft, saying what it
// is made from), and it is made like any page — create-only, so a translation
// already there is opened and never written over. Adding a language is
// translating its home into it. Resolves to a message when it can't be done.
export async function translate(lang: string, key: string): Promise<string | void> {
  const target = `${lang}/${key}`;
  const res = await api(`start translating ${key}`, `${URL_}?draft=${encodeURIComponent(lang)}&key=${encodeURIComponent(key)}`, undefined, [400, 412]);
  if (res.status === 400) return res.text();
  const begun = res.status !== 412;   // 412: it is there already, and is only opened
  if (begun) {
    if (!res.ok) return `Couldn't start translating ${key}`;
    const created = await api(`create ${target}`, `/edit/pages/${urlPath(target)}`,
      { method: "PUT", headers: { "If-None-Match": "*" }, body: await res.text() }, [412]);
    if (!created.ok && created.status !== 412) return `Couldn't create ${target}`;
    reloadBrowser();
  }
  await loadFile(target);
  await refreshTranslations();
  if (begun) tell(`${target} begun as a draft, from ${key}: readers have ${key} until you take draft: off it`);
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
