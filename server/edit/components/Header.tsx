import { createElement, computed, signal, when } from "@blueshed/railroad";
import { Icon } from "./Icon";
import { EditorsDialog } from "./Users";
import { filePath, toggleImages } from "../store";
import { urlPath } from "../api";

export function Header() {
  const editors = signal(false);
  const viewHref = computed(() => {
    const fp = filePath.get();
    return fp ? `/${urlPath(fp.replace(/\.md$/, ".html"))}` : "/";
  });

  return (
    <div class="header">
      <h1>duckie</h1>
      <span style="flex: 1;" />
      <button onclick={toggleImages}>
        <Icon name="layout-template" /> Resources
      </button>
      <button onclick={() => editors.set(true)}>
        <Icon name="users" /> Editors
      </button>
      {when(editors, () => <EditorsDialog oncancel={() => editors.set(false)} />)}
      <a href={viewHref} target="_blank" class="header-link">
        <Icon name="external-link" /> View
      </a>
      {/* A POST, so no link or <img> elsewhere on the site can sign you out */}
      <form method="post" action="/logout" class="header-form">
        <button type="submit" class="header-link">
          <Icon name="log-out" /> Logout
        </button>
      </form>
    </div>
  );
}
