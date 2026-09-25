import type { BunRequest } from "bun";
import { requireAuth, getUser } from "../auth";
import { remoteFrom, publishSite, RemoteRefused, type Remote } from "../remote";
import { changed } from "./pages";

// /edit/publish — this copy of the site and where it is published (remote.ts).
// GET is what would be published; POST publishes it, checked first; POST
// ?pull brings in what the published side has. With no DUCKDOWN_REMOTE there
// is nothing here: GET answers null, which is how the editor knows to show no
// Publish (a 404 would say the same, in red, in the console of every site
// that doesn't publish from here), and a POST is a 404.
export function publishRoutes(
  remote: Remote | null,
  checks?: () => Promise<string[]>,
  strict = () => process.env.DUCKDOWN_STRICT === "1",
) {
  const none = () => new Response("This site isn't published from here: set DUCKDOWN_REMOTE", { status: 404 });
  // A reason the person can act on is a line to show; anything else is a failure.
  const answer = async (work: () => Promise<unknown>) => {
    try {
      return Response.json(await work());
    } catch (e) {
      if (e instanceof RemoteRefused) return new Response(e.message, { status: 409 });
      throw e;
    }
  };

  return {
    async GET(req: BunRequest) {
      const denied = await requireAuth(req);
      if (denied) return denied;
      if (!remote) return Response.json(null);
      return answer(() => remote.status());
    },

    async POST(req: BunRequest) {
      const denied = await requireAuth(req);
      if (denied) return denied;
      if (!remote) return none();
      const by = (await getUser(req))!;
      if (new URL(req.url).searchParams.has("pull")) {
        return answer(async () => {
          const pulled = await remote.pull(by);
          // The pages changed on disk: what the site knows about itself goes.
          if (pulled.changed.length) changed();
          return pulled;
        });
      }
      const { message } = await req.json().catch(() => ({})) as { message?: unknown };
      return answer(() => publishSite(remote, {
        message: typeof message === "string" ? message : "", by, checks, strict: strict(),
      }));
    },
  };
}

export const handlePublish = publishRoutes(remoteFrom());
