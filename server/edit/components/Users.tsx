import { createElement, signal, computed, list, when } from "@blueshed/railroad";
import { api, apiJson } from "../api";
import { tell } from "../notice";
import { Icon } from "./Icon";
import { modal } from "../modal";
import { ConfirmDialog } from "./ConfirmDialog";

// Who can sign in (routes/users.ts): add one, set a password, remove one.
// Every editor is equal. A refusal the server explains — a name taken, a
// password too short, yourself — is said here, in the dialog, where the thing
// to fix is; what happened is news on the one line.

type Editor = { name: string; env: boolean };
type Info = { me: string; users: Editor[] };

const JSON_HEADERS = { "Content-Type": "application/json" };
const EXPLAINED = [400, 403, 404, 409];

export function EditorsDialog(props: { oncancel: () => void }) {
  const dialog = modal();
  const info = signal<Info | null>(null);
  const users = computed(() => info.get()?.users ?? []);
  const error = signal("");
  const setting = signal("");                  // whose password is being set
  const removing = signal<string | null>(null);

  const load = async () => info.set(await apiJson<Info>("list the editors", "/edit/users"));
  load();

  // Each change answers ok, or a line to show; api() has spoken for anything else.
  const change = async (what: string, init: RequestInit, url = "/edit/users"): Promise<boolean> => {
    error.set("");
    const res = await api(what, url, init, EXPLAINED);
    if (EXPLAINED.includes(res.status)) error.set(await res.text());
    return res.ok;
  };

  const add = async (e: Event) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const name = (form.elements.namedItem("name") as HTMLInputElement).value.trim();
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;
    if (!await change(`add ${name}`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ name, password }) })) return;
    form.reset();
    tell(`${name} can sign in`);
    await load();
  };

  const setPassword = async (e: Event, name: string) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;
    const current = (form.elements.namedItem("current") as HTMLInputElement | null)?.value;
    const body = JSON.stringify({ name, password, current });
    if (!await change(`set ${name}'s password`, { method: "PUT", headers: JSON_HEADERS, body })) return;
    setting.set("");
    tell(name === info.peek()!.me
      ? "Your password changed. Your other sessions have ended; this one carries on."
      : `${name}'s password changed, and any session they had has ended`);
  };

  const remove = async () => {
    const name = removing.peek()!;
    removing.set(null);
    if (!await change(`remove ${name}`, { method: "DELETE" }, `/edit/users?name=${encodeURIComponent(name)}`)) return;
    tell(`${name} can't sign in any more`);
    await load();
  };

  return (
    <dialog ref={dialog.ref} class="dialog dialog-history" aria-labelledby={dialog.title} onclose={props.oncancel}>
      <h3 id={dialog.title}>Editors</h3>
      <ul class="history-list editors">
        {list(users, (u) => u.name, (row$) => {
          const { name, env } = row$.peek();
          const me = () => info.get()?.me === name;
          return (
            <li class="editor-row">
              <span class="history-label">{name}</span>
              <span class="history-detail">{() => (me() ? "you" : env ? "set by the environment" : "")}</span>
              {env ? null : <button aria-label={`Set ${name}'s password`} onclick={() => { error.set(""); setting.set(name); }}>
                <Icon name="key" size={12} /> Password
              </button>}
              {when(() => !me() && !env, () => (
                <button class="icon-btn danger-subtle" aria-label={`Remove ${name}`} title={`Remove ${name}`} onclick={() => removing.set(name)}>
                  <Icon name="trash-2" size={12} />
                </button>
              ))}
              {when(() => setting.get() === name, () => (
                <form class="editor-password" onsubmit={(e: Event) => setPassword(e, name)}>
                  {me() ? <input name="current" type="password" placeholder="Current password" aria-label="Current password" autocomplete="current-password" /> : null}
                  <input name="password" type="password" placeholder="New password" aria-label={`New password for ${name}`} autocomplete="new-password" />
                  <button type="submit" class="primary">Set</button>
                  <button type="button" onclick={() => setting.set("")}>Cancel</button>
                </form>
              ))}
            </li>
          );
        })}
      </ul>
      <form class="editor-add" onsubmit={add}>
        <input name="name" placeholder="Name or email" aria-label="Name or email" autocomplete="off" />
        <input name="password" type="password" placeholder="Their password" aria-label="Their password" autocomplete="new-password" />
        <button type="submit" class="primary"><Icon name="plus" size={12} /> Add</button>
      </form>
      {when(error, () => <p class="dialog-error" role="alert">{error}</p>)}
      <div class="dialog-actions">
        <button type="button" onclick={() => { dialog.close(); props.oncancel(); }}>Close</button>
      </div>
      {when(removing, () => (
        <ConfirmDialog
          title={`Remove ${removing.peek()}?`}
          confirmLabel="Remove"
          message="They won't be able to sign in, and any session they have ends now."
          onconfirm={remove}
          oncancel={() => removing.set(null)}
        />
      ))}
    </dialog>
  );
}
