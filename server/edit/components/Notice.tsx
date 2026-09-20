import { createElement, when } from "@blueshed/railroad";
import { Icon } from "./Icon";
import { notice, hush } from "../notice";

export function Notice() {
  return when(notice, () => (
    <div class="notice" role="alert">
      <span>{notice}</span>
      <button aria-label="Dismiss" title="Dismiss" onclick={hush}>
        <Icon name="x" />
      </button>
    </div>
  ));
}
