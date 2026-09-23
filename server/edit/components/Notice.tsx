import { createElement, when } from "@blueshed/railroad";
import { Icon } from "./Icon";
import { notice, news, hush } from "../notice";

// A failure is an alert; news is a status, read out when there is a moment.
export function Notice() {
  return when(notice, () => (
    <div class={news.map((n) => (n ? "notice news" : "notice"))}
      role={news.map((n) => (n ? "status" : "alert"))}>
      <span>{notice}</span>
      <button aria-label="Dismiss" title="Dismiss" onclick={hush}>
        <Icon name="x" />
      </button>
    </div>
  ));
}
