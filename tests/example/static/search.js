// Search, in the browser. The whole index arrives as one file — /search.json,
// which the served site builds on demand and `bun run export` writes as a
// file — and the matching happens here. No search engine, no index format, no
// request per keystroke: a site of a few dozen pages is a few dozen kilobytes,
// and a linear scan of that is faster than asking anyone.
//
// It is ordinary site code, in static/, and you can edit it: the template
// includes it, and duckdown's job ends at handing you the index.

(() => {
  const form = document.querySelector(".search");
  if (!form) return;

  const toggle = form.querySelector(".search-toggle");
  const input = form.querySelector("input");
  const output = form.querySelector(".search-results");
  let index = null;
  let loading = null;

  // Shut until asked for. A search box is chrome on a page nobody came to
  // search, so it is a button first and a box second.
  function open(wanted) {
    form.toggleAttribute("data-open", wanted);
    toggle.setAttribute("aria-expanded", String(wanted));
    if (wanted) input.focus();
    else { input.value = ""; output.innerHTML = ""; }
  }

  // Fetched once, on the first keystroke rather than on page load: a reader
  // who never searches never pays for it.
  const load = () =>
    (loading ??= fetch("/search.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => (index = data))
      .catch(() => (index = [])));

  const words = (s) => s.toLowerCase().split(/\s+/).filter(Boolean);

  // Every word has to appear somewhere, and where it appears decides the
  // order: a word in the title is what you meant; a word in the body might be
  // an aside. A title match also has to start a word, so "art" finds
  // "Articles" and not "Stuttgart".
  function score(entry, terms) {
    const title = entry.title.toLowerCase();
    const description = entry.description.toLowerCase();
    const text = entry.text.toLowerCase();
    let total = 0;
    for (const term of terms) {
      const inTitle = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(title);
      if (inTitle) total += 10;
      else if (description.includes(term)) total += 4;
      else if (text.includes(term)) total += 1;
      else return 0;                       // every word, or it isn't a match
    }
    return total;
  }

  // The words around the first hit, so a result says why it is a result.
  function extract(entry, terms) {
    if (entry.description) return entry.description;
    const at = entry.text.toLowerCase().indexOf(terms[0]);
    if (at < 0) return "";
    const from = Math.max(0, at - 60);
    return (from ? "… " : "") + entry.text.slice(from, from + 160).trim() + "…";
  }

  function show(results, query) {
    output.innerHTML = "";
    if (!query) return;

    if (!results.length) {
      output.innerHTML = `<p class="search-none">Nothing matches “${query.replace(/[<&]/g, "")}”.</p>`;
      return;
    }
    const list = document.createElement("ul");
    for (const entry of results.slice(0, 8)) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = entry.url;
      a.textContent = entry.title;
      const p = document.createElement("p");
      p.textContent = extract(entry, words(query));
      li.append(a, p);
      list.append(li);
    }
    output.append(list);
  }

  async function search() {
    const query = input.value.trim();
    if (!query) return show([], "");
    if (!index) await load();
    const terms = words(query);
    const hits = index
      .map((entry) => ({ entry, rank: score(entry, terms) }))
      .filter((hit) => hit.rank > 0)
      .sort((a, b) => b.rank - a.rank)
      .map((hit) => hit.entry);
    show(hits, query);
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
})();
