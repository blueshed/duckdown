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

  // An entry is a page, or one section of it (its `section` is the heading and
  // its url ends #id). Every word has to appear somewhere, and where it
  // appears decides the order: a word in the title is what you meant; one in
  // a section's heading is nearly that; one in the body might be an aside. A
  // title or heading match also has to start a word, so "art" finds
  // "Articles" and not "Stuttgart".
  function score(entry, terms) {
    const title = entry.title.toLowerCase();
    const section = (entry.section || "").toLowerCase();
    const description = entry.description.toLowerCase();
    const text = entry.text.toLowerCase();
    let total = 0;
    for (const term of terms) {
      const starts = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
      if (starts.test(title)) total += 10;
      else if (starts.test(section)) total += 8;
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

  // Where the words are, so the browser can scroll to them and mark them:
  // a text fragment, ":~:text=". It is a few words from the first hit, from the
  // start of its word (a fragment has to begin at one), as they are written in
  // the text and not as lowercased for matching. A browser that doesn't know
  // fragments ignores everything after ":~:" and still lands on the heading.
  // "-" is fragment syntax, so it is encoded as well as what encodeURIComponent does.
  function link(entry, terms) {
    const at = entry.text.toLowerCase().indexOf(terms[0]);
    const base = entry.url.includes("#") ? entry.url : `${entry.url}#`;
    if (at < 0) return entry.url;
    const start = entry.text.lastIndexOf(" ", at) + 1;
    const phrase = entry.text.slice(start).split(" ").slice(0, 5).join(" ");
    return `${base}:~:text=${encodeURIComponent(phrase).replace(/-/g, "%2D")}`;
  }

  // At most three sections of a page, best first, so one long page can't fill
  // the list; a page's own entry counts as one.
  function group(hits) {
    const seen = new Map();
    return hits.filter((entry) => {
      const page = entry.url.split("#")[0];
      seen.set(page, (seen.get(page) || 0) + 1);
      return seen.get(page) <= 3;
    });
  }

  function show(results, query) {
    output.innerHTML = "";
    if (!query) return;

    if (!results.length) {
      output.innerHTML = `<p class="search-none">Nothing matches “${query.replace(/[<&]/g, "")}”.</p>`;
      return;
    }
    const list = document.createElement("ul");
    for (const entry of group(results).slice(0, 8)) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = link(entry, words(query));
      // "Page – Section", unless the section is the page's own title.
      a.textContent = entry.section && entry.section !== entry.title ? `${entry.title} – ${entry.section}` : entry.title;
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
  // Following a result closes the panel — after the click has done its work:
  // taking the link out of the page during its own click can cancel it. On the
  // page the hit is on this is a fragment navigation, which still scrolls.
  output.addEventListener("click", (e) => {
    if (e.target.closest("a")) setTimeout(() => open(false));
  });
  form.addEventListener("submit", (e) => e.preventDefault());
  // Escape shuts it, and so does clicking anywhere else on the page.
  form.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { open(false); toggle.focus(); }
  });
  document.addEventListener("click", (e) => {
    if (!form.contains(e.target)) open(false);
  });
})();
