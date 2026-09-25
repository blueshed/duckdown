// A large site: N pages over F folders, each folder with an index that lists its pages, and a collection of C works.
import { mkdirSync, writeFileSync, cpSync, rmSync } from "fs";
import { join } from "path";
const [root, N, F, C] = [process.argv[2]!, Number(process.argv[3]), Number(process.argv[4]), Number(process.argv[5])];
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
const works = join(pages, "works");
mkdirSync(works, { recursive: true });
const items = Array.from({ length: C }, (_, i) => ({ src: `w${i}.jpg`, title: `Work ${i}`, caption: `A caption for work ${i}` }));
writeFileSync(join(works, "collection.json"), JSON.stringify({ groups: [{ name: "All", items }] }));
writeFileSync(join(works, "item.md"), "each: true\ntitle: {{item-title}}\n\n# {{item-title}}\n\n{{item-caption}}\n");
writeFileSync(join(works, "index.md"), "title: Works\nnav: Works\n\n{{items}}\n");
console.log(`made ${N} pages in ${F} folders and ${C} works at ${root}`);
