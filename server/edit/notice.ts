import { signal, batch } from "@blueshed/railroad";

// Failures speak: the editor's one line for what just went wrong, shown until
// dismissed or replaced (see components/Notice.tsx), and logged as well.
export const notice = signal("");

// Now and then the editor did something on your behalf that you would want to
// know about — a renamed work kept its old address — and that is not a
// failure. It goes in the same line, because there is one place to look, but
// not in red: a notice that cries wolf teaches people to dismiss it unread.
export const news = signal(false);

export function speak(message: string): void {
  console.error(message);
  batch(() => {
    news.set(false);
    notice.set(message);
  });
}

export function tell(message: string): void {
  console.info(message);
  batch(() => {
    news.set(true);
    notice.set(message);
  });
}

export function hush(): void {
  notice.set("");
}
