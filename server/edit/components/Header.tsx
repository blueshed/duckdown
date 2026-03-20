import { createElement, computed } from "@blueshed/railroad";
import { Icon } from "./Icon";
import { filePath, toggleImages } from "../store";

export function Header() {
  const viewHref = computed(() => {
    const fp = filePath.get();
    return fp ? `/${fp.replace(/\.md$/, ".html")}` : "/";
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
      <a href="/logout" class="header-link">
        <Icon name="log-out" /> Logout
      </a>
    </div>
  );
}
