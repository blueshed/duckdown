// A large site: N pages over F folders, each folder with an index that lists its pages, and a collection of C works.
import { mkdirSync, writeFileSync, cpSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { sourceHash } from "../server/languages";
// L is how many other languages (cy, fr, de), each with half the pages and works translated, a tenth of those behind.
const [root, N, F, C, L] = [process.argv[2]!, Number(process.argv[3]), Number(process.argv[4]), Number(process.argv[5]), Number(process.argv[6] ?? 0)];
rmSync(root, { recursive: true, force: true });
const seed = join(import.meta.dir, "..", "tests", "example");
for (const d of ["templates", "static"]) cpSync(join(seed, d), join(root, d), { recursive: true });
cpSync(join(seed, "users.json"), join(root, "users.json"));
const pages = join(root, "pages");
mkdirSync(pages, { recursive: true });
writeFileSync(join(pages, "index.md"), "title: Big\nnav: Home\n\n# Big site\n\n{{sitemap}}\n");
const words = "the quick brown fox jumps over the lazy dog while the site grows and grows ".repeat(20);
for (let f = 0; f < F; f++) {
  const dir = join(pages, `folder-${f}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.md"), `title: Folder ${f}\nnav: Folder ${f}\nfeed: true\n\n# Folder ${f}\n\n{{pages}}\n`);
  for (let p = 0; p < N / F; p++) {
    writeFileSync(join(dir, `page-${p}.md`), `title: Page ${p} of ${f}\ndate: 2026-0${1 + (p % 9)}-1${p % 9}\ndescription: Page ${p}\n\n# Page ${p}\n\n## A section\n\n${words}\n\n## Another\n\n${words}\n`);
  }
}
const LANGUAGES = ["cy", "fr", "de"].slice(0, L);
for (const lang of LANGUAGES) {
  mkdirSync(join(pages, lang), { recursive: true });
  writeFileSync(join(pages, lang, "index.md"), `lang: ${lang}\ntitle: Big (${lang})\nnav: Home\nuntranslated: Not yet.\n\n# Big site\n\n{{sitemap}}\n`);
  for (let f = 0; f < F; f++) {
    const dir = join(pages, lang, `folder-${f}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.md"), `title: Folder ${f}\nnav: Folder ${f}\n\n# Folder ${f}\n\n{{pages}}\n`);
    for (let p = 0; p < N / F; p += 2) {   // every other page
      const source = readFileSync(join(pages, `folder-${f}`, `page-${p}.md`), "utf8");
      const made = p % 20 === 0 ? "00000000" : sourceHash(source);   // a tenth behind
      writeFileSync(join(dir, `page-${p}.md`), `title: Page ${p} of ${f} (${lang})\ntranslated-from: ${made}\n\n# Page ${p}\n\n${words}\n`);
    }
  }
}
const works = join(pages, "works");
mkdirSync(works, { recursive: true });
const items = Array.from({ length: C }, (_, i) => ({ src: `w${i}.jpg`, title: `Work ${i}`, caption: `A caption for work ${i}` }));
writeFileSync(join(works, "collection.json"), JSON.stringify({ groups: [{ name: "All", items }] }));
writeFileSync(join(works, "item.md"), "each: true\ntitle: {{item-title}}\n\n# {{item-title}}\n\n{{item-caption}}\n");
writeFileSync(join(works, "index.md"), "title: Works\nnav: Works\n\n{{items}}\n");
for (const lang of LANGUAGES) {
  mkdirSync(join(pages, lang, "works"), { recursive: true });
  const said = Object.fromEntries(Array.from({ length: C / 2 }, (_, i) => [`work-${i * 2}`, { title: `Gwaith ${i * 2}`, "translated-from": "00000000" }]));
  writeFileSync(join(pages, lang, "works", "collection.json"), JSON.stringify({ items: said }));
}
console.log(`made ${N} pages in ${F} folders and ${C} works at ${root}${L ? `, and ${L} other language(s)` : ""}`);
