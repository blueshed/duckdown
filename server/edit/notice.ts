import { signal } from "@blueshed/railroad";

// Failures speak: the editor's one line for what just went wrong, shown until
// dismissed or replaced (see components/Notice.tsx), and logged as well.
export const notice = signal("");

export function speak(message: string): void {
  console.error(message);
  notice.set(message);
}

export function hush(): void {
  notice.set("");
}
