import { createElement, computed } from "@blueshed/railroad";
import { Icon } from "./Icon";
import { PublishButton } from "./Publish";
import { Trail } from "./Trail";
import { filePath, drawer, toggleDrawer } from "../store";
import { urlPath } from "../api";

export function Header() {
  const viewHref = computed(() => {
    const fp = filePath.get();
    return fp ? `/${urlPath(fp.replace(/\.md$/, ".html"))}` : "/";
  });

  return (
    <div class="header">
      <h1 class="visually-hidden">duckie</h1>
      <Trail />
      <span class="pane-gap" />
      <PublishButton />
      {/* Each opens its drawer, and the drawer it opens says so. */}
      <button onclick={() => toggleDrawer("resources")} aria-expanded={drawer.map((d) => String(d === "resources"))}>
        <Icon name="layout-template" /> <span class="label">Resources</span>
      </button>
      <button onclick={() => toggleDrawer("editors")} aria-expanded={drawer.map((d) => String(d === "editors"))}>
        <Icon name="users" /> <span class="label">Editors</span>
      </button>
      <button onclick={() => toggleDrawer("help")} aria-expanded={drawer.map((d) => String(d === "help"))}>
        <Icon name="circle-help" /> <span class="label">Help</span>
      </button>
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
