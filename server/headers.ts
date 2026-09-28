// What an answer says about itself, from either server (main.ts, serve.ts).

// Every answer says its type is the one it is. A browser that sniffed could
// take a file for another type — text for a page — and run it on the site's
// own address.
export function nosniff<R extends Response>(res: R): R {
  res.headers.set("X-Content-Type-Options", "nosniff");
  return res;
}

type Handler = (...args: never[]) => Response | Promise<Response>;

// A handler, every answer of which says so.
export function answering<A extends unknown[]>(handler: (...args: A) => Response | Promise<Response>) {
  return async (...args: A) => nosniff(await handler(...args));
}

// Every route's answers: a handler's, by method or whole, a Response, and a
// Bun.file, made a Response of itself (which keeps its type and its
// Last-Modified). An HTML import is left as it is: Bun bundles the editor and
// answers it and its chunks itself, typed as they are, and takes no header
// from here.
export function everyAnswer<T extends object>(routes: T): T {
  return Object.fromEntries(Object.entries(routes).map(([path, route]) => [path, answered(route)])) as T;
}

function answered(route: unknown): unknown {
  if (route instanceof Response) return nosniff(route);
  if (route instanceof Blob) return nosniff(new Response(route));
  if (typeof route === "function") return answering(route as Handler);
  if (route && Object.getPrototypeOf(route) === Object.prototype) return everyAnswer(route);
  return route;
}

// A file as someone put it in the site — static/, the images, a PDF, a file
// the editor opens — is sandboxed: an SVG or an HTML file opened alone is
// shown, and runs no script on the site's address, where a script acts as
// whoever is signed in. A page is the site's own and never is; nor does this
// reach a stylesheet, a script or a picture a page uses, which answer to the
// page's policy, not their own. A PDF is shown under it, opened alone or
// through a page's <embed> or <object>, in Chrome and WebKit; in an <iframe>
// only Chrome shows it (WebKit leaves the frame blank). A song or a film is
// not sandboxed: neither loads in a sandbox (a .wav opened alone plays
// nothing, in either), and neither runs a script on the site's address.
const SHOWN = /^(audio|video)\//;
export function asFile(type: string): Record<string, string> {
  return SHOWN.test(type) ? {} : { "Content-Security-Policy": "sandbox" };
}
