// Search, in the browser. duckdown builds the index — the served site on
// demand, `bun run export` as files — and the matching happens here: no search
// engine, and no server asked anything a static host can't answer.
//
// The index comes in parts, so a reader fetches what their search needs rather
// than every word on the site (68 MB at 20,000 pages):
//
//   /search/index.json        which shards of words there are
//   /search/words/<xy>.json   every word starting xy, and where each one is
//   /search/pages/<n>.json    page n's entries — its title, each section's
//                             heading and words — for the results shown
//
// Each is fetched once, the first time a search needs it. (/search.json, the
// whole index as one file, is still there for a site's own search.js from
// before this.)
//
// It is ordinary site code, in static/, and you can edit it: the template
// includes it, and duckdown's job ends at handing you the index.

(() => {
  // Arriving from a result. A result links to #id:~:text=…; the browser strips
  // the directive from location.hash and, where it can't find the words, some
  // browsers also give up on the id, and the reader lands at the top of a page
  // three thousand pixels above the heading. So this does the id's job itself:
  // once the page has loaded (images moving the heading are in place), and only
  // if nothing has scrolled it and the heading isn't in view already. Where the
  // text fragment worked the page has scrolled, and this does nothing.
  function arrive() {
    if (!location.hash || window.scrollY !== 0) return;
    let id;
    try {
      id = decodeURIComponent(location.hash.slice(1));
    } catch (e) {
      console.warn("search.js: a fragment that won't decode", location.hash, e);
      return;
    }
    const target = document.getElementById(id);
    if (!target) return;
    const top = target.getBoundingClientRect().top;
    if (top < 0 || top >= window.innerHeight) target.scrollIntoView();
  }
  if (document.readyState === "complete") arrive();
  else window.addEventListener("load", arrive);

  const form = document.querySelector(".search");
  if (!form) return;

  const toggle = form.querySelector(".search-toggle");
  const input = form.querySelector("input");
  const output = form.querySelector(".search-results");

  // Shut until asked for. A search box is chrome on a page nobody came to
  // search, so it is a button first and a box second.
  function open(wanted) {
    form.toggleAttribute("data-open", wanted);
    toggle.setAttribute("aria-expanded", String(wanted));
    if (wanted) input.focus();
    else { input.value = ""; output.innerHTML = ""; output.removeAttribute("aria-busy"); }
  }

  // A word is a run of letters, marks, digits and _ — duckdown cut the site's
  // words the same way (search.ts), so a query's words are looked up as they
  // were filed: "tree-lined" is tree and lined, and "café" is one word.
  const LETTER = "\\p{L}\\p{M}\\p{N}_";
  const words = (s) => s.toLowerCase().match(new RegExp(`[${LETTER}]+`, "gu")) || [];

  // A word's shard is its first two letters (a word of one letter has its
  // own), and its file is that with anything but a-z and 0-9 spelt as its code
  // point: "über" is in /search/words/_fc_b.json.
  const shardOf = (word) => [...word].slice(0, 2).join("");
  const fileOf = (key) => key.replace(/[^a-z0-9]/gu, (c) => `_${c.codePointAt(0).toString(16)}_`);

  // Fetched once each, on the first search that needs it rather than on page
  // load: a reader who never searches never pays, and one who does pays for
  // the words they typed. A file that isn't there, or won't come, is nothing
  // found — said in the console, not to the reader.
  const fetched = new Map();
  function get(url, none) {
    if (!fetched.has(url)) {
      fetched.set(url, fetch(url)
        .then((r) => (r.ok ? r.json() : none))
        .catch((e) => {
          console.warn("search.js: couldn't fetch", url, e);
          return none;
        }));
    }
    return fetched.get(url);
  }
  let shards = null;
  const shard = async (key) => {
    shards ??= get("/search/index.json", { words: [] }).then((index) => new Set(index.words));
    return (await shards).has(key) ? get(`/search/words/${fileOf(key)}.json`, {}) : {};
  };
  const page = (n) => get(`/search/pages/${n}.json`, []);

  // Each word of the query with the pattern that finds it in an entry's text,
  // for the snippet and the link. A word matches at the start of a word —
  // "train" is not in "constraints", in the text any more than in the title —
  // and a word of one letter only as itself, so "part 2" isn't "part 20".
  const parseQuery = (query) => words(query).map((term) => ({
    term,
    starts: new RegExp(`(^|[^${LETTER}])${term}${[...term].length === 1 ? `(?![${LETTER}])` : ""}`, "u"),
  }));
  const firstAt = (text, { starts }) => {
    const hit = starts.exec(text.toLowerCase());
    return hit ? hit.index + hit[1].length : -1;
  };

  // An entry is a page, or one section of it (its `section` is the heading and
  // its url ends #id). Every word has to appear somewhere in it, and where it
  // appears decides the order: a word in the title is what you meant; one in
  // a section's heading is nearly that; one in the description less; one in
  // the text might be an aside. The shard says where each word is, as pairs
  // of numbers: pages on from the last, then section × 4 + where (3 the
  // title, 2 the heading, 1 the description, 0 the text).
  const WEIGHT = [1, 4, 8, 10];
  const AT = 1e6;   // an entry, as one number: page × AT + section
  async function placesOf({ term }) {
    const best = new Map();
    for (const [word, places] of Object.entries(await shard(shardOf(term)))) {
      if (!word.startsWith(term)) continue;
      for (let i = 0, n = 0; i < places.length; i += 2) {
        n += places[i];
        const at = n * AT + (places[i + 1] >> 2);
        best.set(at, Math.max(best.get(at) || 0, WEIGHT[places[i + 1] & 3]));
      }
    }
    return best;
  }
  async function rank(terms) {
    const [first, ...rest] = await Promise.all(terms.map(placesOf));
    const hits = [];
    for (const [at, score] of first) {
      if (rest.every((other) => other.has(at))) hits.push({ at, total: rest.reduce((sum, other) => sum + other.get(at), score) });
    }
    // Best first; between equals, the order the site's pages are in.
    return hits.sort((a, b) => b.total - a.total || a.at - b.at);
  }

  // Eight at most, and at most three sections of a page, best first, so one
  // long page can't fill the list (a page's own entry counts as one) — then
  // only those pages fetched, however many matched.
  async function entries(hits) {
    const seen = new Map();
    const shown = hits.filter(({ at }) => {
      const n = Math.floor(at / AT);
      seen.set(n, (seen.get(n) || 0) + 1);
      return seen.get(n) <= 3;
    }).slice(0, 8);
    const pages = await Promise.all(shown.map(({ at }) => page(Math.floor(at / AT))));
    // An entry that isn't there — a page fetched after the site changed,
    // beside a shard from before — is left out rather than shown as nothing.
    return shown.map(({ at }, i) => pages[i][at % AT]).filter(Boolean);
  }

  // The words around the first hit, so a result says why it is a result.
  function extract(entry, terms) {
    if (entry.description) return entry.description;
    const at = firstAt(entry.text, terms[0]);
    if (at < 0) return "";
    const from = Math.max(0, at - 60);
    return (from ? "… " : "") + entry.text.slice(from, from + 160).trim() + "…";
  }

  // Where the words are, so the browser can scroll to them and mark them:
  // a text fragment, ":~:text=". It is a few words from the first hit, from the
  // start of its word (a fragment has to begin at one), as they are written in
  // the text and not as lowercased for matching. A browser that doesn't know
  // fragments ignores everything after ":~:" and still lands on the heading.
  // "-" is fragment syntax, so it is encoded as well as what encodeURIComponent does.
  function link(entry, terms) {
    const at = firstAt(entry.text, terms[0]);
    const base = entry.url.includes("#") ? entry.url : `${entry.url}#`;
    if (at < 0) return entry.url;
    const phrase = entry.text.slice(at).split(" ").slice(0, 5).join(" ");
    return `${base}:~:text=${encodeURIComponent(phrase).replace(/-/g, "%2D")}`;
  }

  function show(results, query) {
    output.innerHTML = "";
    output.removeAttribute("aria-busy");
    if (!query) return;

    if (!results.length) {
      output.innerHTML = `<p class="search-none">Nothing matches “${query.replace(/[<&]/g, "")}”.</p>`;
      return;
    }
    const list = document.createElement("ul");
    const wanted = parseQuery(query);
    for (const entry of results) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = link(entry, wanted);
      // "Page – Section", unless the section is the page's own title.
      a.textContent = entry.section && entry.section !== entry.title ? `${entry.title} – ${entry.section}` : entry.title;
      const p = document.createElement("p");
      p.textContent = extract(entry, wanted);
      li.append(a, p);
      list.append(li);
    }
    output.append(list);
  }

  // Busy while it fetches, and only the latest keystroke's answer shown: an
  // earlier one whose files came slower is dropped when it arrives.
  async function search() {
    const query = input.value.trim();
    const wanted = parseQuery(query);
    if (!wanted.length) return show([], query);
    output.setAttribute("aria-busy", "true");
    const hits = await rank(wanted);
    if (input.value.trim() !== query) return;
    const found = await entries(hits);
    if (input.value.trim() !== query) return;
    show(found, query);
  }

  toggle.addEventListener("click", () => open(!form.hasAttribute("data-open")));
  input.addEventListener("input", search);
  form.addEventListener("submit", (e) => e.preventDefault());
  // Escape shuts it, and so does clicking anywhere else on the page.
  form.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { open(false); toggle.focus(); }
  });
  document.addEventListener("click", (e) => {
    if (!form.contains(e.target)) open(false);
  });
  // Following a result closes the panel — after the click has done its work:
  // taking the link out of the page during its own click can cancel it. On the
  // page the hit is on this is a fragment navigation, which still scrolls.
  output.addEventListener("click", (e) => {
    if (e.target.closest("a")) setTimeout(() => open(false));
  });
})();
