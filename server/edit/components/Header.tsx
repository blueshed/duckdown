import { createElement, computed, signal, when } from "@blueshed/railroad";
import { Icon } from "./Icon";
import { EditorsDialog } from "./Users";
import { PublishButton } from "./Publish";
import { filePath, showImages, toggleImages } from "../store";
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
      <PublishButton />
      <button onclick={toggleImages} aria-expanded={showImages.map(String)}>
        <Icon name="layout-template" /> <span class="label">Resources</span>
      </button>
      <button onclick={() => editors.set(true)}>
        <Icon name="users" /> <span class="label">Editors</span>
      </button>
      {when(editors, () => <EditorsDialog oncancel={() => editors.set(false)} />)}
      <a href={viewHref} target="_blank" class="header-link">
        <Icon name="external-link" /> <span class="label">View</span>
      </a>
      {/* A POST, so no link or <img> elsewhere on the site can sign you out */}
      <form method="post" action="/logout" class="header-form">
        <button type="submit" class="header-link">
          <Icon name="log-out" /> <span class="label">Logout</span>
        </button>
      </form>
    </div>
  );
}
