import { createElement, computed } from "@blueshed/railroad";
import { Icon } from "./Icon";
import { filePath, toggleImages } from "../store";
import { urlPath } from "../api";

export function Header() {
  const viewHref = computed(() => {
    const fp = filePath.get();
    return fp ? `/${urlPath(fp.replace(/\.md$/, ".html"))}` : "/";
  });

  return (
    <div class="header">
      <h1>duckie</h1>
      <span style="flex: 1;" />
      <button onclick={toggleImages}>
        <Icon name="image" /> Images
      </button>
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
