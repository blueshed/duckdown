import { createElement, computed, list } from "@blueshed/railroad";
import { Icon } from "./Icon";
import { filePath, folder, folderOf, openFolder } from "../store";
import { past, seen, leavePast, lookAtNow } from "../past";

// Where you are, said once, at the top: the site, the folders down to the one
// the tree is showing, and the page open in it. Every crumb but the last goes
// there; the last is where you stand, in bold. It is what the tree's "/blog"
// and each pane's "blog/" before a name used to say twice over. (The tree's
// ".." row came back: a way up where the hand already is.)
export type Crumb = { label: string; go?: () => void };

// In the past, the trail goes one further: the file, then the version you
// are looking at; or, for what was deleted, Deleted and the file. Any crumb
// before those leaves the past for where it names.
function crumbsThen(): Crumb[] | null {
  const p = past.get();
  if (!p) return null;
  const s = seen.get();
  const away = (go: () => void) => () => { leavePast(); go(); };
  const root: Crumb = { label: "duckie", go: away(() => openFolder("")) };
  if (p.kind === "deleted") {
    return [root, { label: "Deleted", go: s ? lookAtNow : undefined }, ...(s ? [{ label: s.entry.key }] : [])];
  }
  // A page's versions are in its folder; a template's or a stylesheet's are its own.
  const page = p.url.startsWith("/edit/pages/");
  const own = page ? folderOf(p.name) : "";
  const parts = own ? own.split("/") : [];
  return [
    root,
    ...parts.map((part, i) => ({ label: part, go: away(() => openFolder(parts.slice(0, i + 1).join("/"))) })),
    { label: page ? p.name.slice(own ? own.length + 1 : 0) : p.name, go: leavePast },
    { label: s ? s.entry.label : "Earlier versions" },
  ];
}

export function crumbsHere(): Crumb[] {
  const then = crumbsThen();
  if (then) return then;
  const here = folder.get();
  const parts = here ? here.split("/") : [];
  const out: Crumb[] = [{ label: "duckie", go: () => openFolder("") }];
  parts.forEach((part, i) => out.push({ label: part, go: () => openFolder(parts.slice(0, i + 1).join("/")) }));
  const fp = filePath.get();
  if (fp && folderOf(fp) === here) out.push({ label: fp.slice(here ? here.length + 1 : 0) });
  return out;
}

// A folder inside a drawer's list (images, reports) says where it is the same
// way, from that list's own top.
export function folderCrumbs(top: string, at: string, go: (to: string) => unknown): Crumb[] {
  const parts = at ? at.split("/") : [];
  return [
    { label: top, go: () => go("") },
    ...parts.map((part, i) => ({ label: part, go: () => go(parts.slice(0, i + 1).join("/")) })),
  ];
}

export function Trail(props: { crumbs?: () => Crumb[]; label?: string } = {}) {
  const crumbs = computed(() => {
    const all = (props.crumbs ?? crumbsHere)();
    return all.map((c, i) => ({ ...c, key: `${i}:${c.label}`, last: i === all.length - 1 }));
  });
  return (
    <nav class={props.crumbs ? "trail trail-small" : "trail"} aria-label={props.label ?? "Where you are"}>
      <ol>
        {list(crumbs, (c) => `${c.key}:${c.last}`, (c$) => {
          const c = c$.peek();
          return (
            <li class={c.key.startsWith("0:") ? "crumb root" : "crumb"}>
              {c.key.startsWith("0:") ? null : <Icon name="chevron-right" size={13} />}
              {c.last || !c.go
                ? <span class="here" aria-current={c.last ? "location" : null}>{c.label}</span>
                : <button type="button" class="go" onclick={() => c$.peek().go!()}>{c.label}</button>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
