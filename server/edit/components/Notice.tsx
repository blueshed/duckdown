import { createElement, Fragment, when } from "@blueshed/railroad";
import { Icon } from "./Icon";
import { notice, news, hush } from "../notice";

// A failure is an alert; news is a status, read out when there is a moment.
// Each is said from a region that is in the page before anything is put in
// it: a screen reader may not read a live region that arrives already full.
export function Notice() {
  const card = (kind: string) => () => (
    <div class={kind}>
      <span>{notice}</span>
      <button aria-label="Dismiss" title="Dismiss" onclick={hush}>
        <Icon name="x" />
      </button>
    </div>
  );
  return (
    <>
      <div class="notice-live" role="alert">{when(() => notice.get() && !news.get(), card("notice"))}</div>
      <div class="notice-live" role="status">{when(() => notice.get() && news.get(), card("notice news"))}</div>
    </>
  );
}
