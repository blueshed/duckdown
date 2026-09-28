// What a reader downloads for a first search (n166): the exported site's own
// static/search.js, in happy-dom, answering from the files the export wrote in
// dist/ — every byte it asks for counted. A fresh start per query, as a reader
// arriving on a page and searching once.
//
//   bun bench/search.ts <dist> <query>...
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { join } from "path";

const [dist, ...queries] = process.argv.slice(2) as [string, ...string[]];
const script = await Bun.file(join(dist, "static", "search.js")).text();
GlobalRegistrator.register({ url: "http://localhost/" });
const kb = (n: number) => `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;

for (const query of queries) {
  let bytes = 0;
  const asked: string[] = [];
  globalThis.fetch = (async (url: string) => {
    const file = Bun.file(join(dist, decodeURIComponent(String(url).replace(/^https?:\/\/[^/]+/, "").split(/[?#]/)[0]!)));
    asked.push(String(url));
    if (!await file.exists()) return new Response("", { status: 404 });
    const body = await file.bytes();
    bytes += body.length;
    return new Response(body);
  }) as unknown as typeof fetch;
  document.body.innerHTML = `<form class="search"><button type="button" class="search-toggle"></button>
    <input type="search"><div class="search-results"></div></form>`;
  (0, eval)(script);
  const input = document.querySelector("input")!;
  const results = document.querySelector(".search-results")!;
  const started = performance.now();
  input.value = query;
  input.dispatchEvent(new Event("input"));
  while (!results.children.length) await Bun.sleep(5);
  const ms = performance.now() - started;
  const found = results.querySelectorAll("a").length;
  console.log(`first search for "${query}"`.padEnd(46), `${kb(bytes).padStart(10)} in ${asked.length} request(s), ${found} result(s) shown, ${ms.toFixed(0)} ms`);
}
