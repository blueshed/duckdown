import type { BunRequest } from "bun";
import { requireAuth } from "../auth";
import { createImageStorage, createPageStorage } from "../storage";
import { IMAGES_PATH } from "../config";
import { loadCollection, collectionPath, collectionProblems } from "../collection";
import { imageUrl, thumbName } from "../images";
import { after } from "../utils";

// The one thing the collection pane can't do through the folders the editor
// already has: put a picture where a collection's `images` settings say its
// pictures go, and write the thumbnail beside it under the name the same
// settings give it. Everything else the pane does is a write to
// collection.json through /edit/pages/, which is a file like any other.
//
// GET answers what the pane needs to know about the collection it has open —
// the fields the file declares (null when it declares none), where its images
// are, whether they are somewhere this editor can write, and anything wrong
// with the file — so a slug that collides with a page reaches the Notice
// whether or not a preview is on screen. The fields come from here rather than
// from the pane's own reading of the JSON so that both ends read them one way:
// a second image field, or one with no usable name, is what the site says it
// is, not what the pane guessed.

const pages = createPageStorage();
const images = createImageStorage();

// 128px on the longest side: the size a thumbnail grid asks for, and the size
// the gallery this came from has used for twenty years.
const THUMB = 128;

// static/images/ is the only folder the editor can write pictures to, and a
// collection's images may be anywhere — another host, a bucket of originals
// too big to keep here. Where a base lands under that folder, or null when it
// lands outside it.
export function imagesKey(base: string): string | null {
  const root = `/${IMAGES_PATH}`;
  const at = base.endsWith("/") ? base : `${base}/`;
  return at.startsWith(root) ? decodeURI(at.slice(root.length)) : null;
}

// A thumbnail's bytes, in the format its own name asks for. SVG is vector and
// Bun.Image decodes raster formats only, so a collection whose thumbnails are
// .svg keeps the original bytes — which is what the seed's gallery does.
export async function thumbBytes(bytes: Uint8Array, name: string): Promise<Uint8Array> {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  if (ext === ".svg") return bytes;
  const small = new Bun.Image(bytes).resize(THUMB, THUMB, { fit: "inside", withoutEnlargement: true });
  const encoded = ext === ".jpg" || ext === ".jpeg"
    ? small.jpeg({ quality: 82 })
    : ext === ".webp" ? small.webp({ quality: 80 }) : small.png();
  return new Uint8Array(await encoded.bytes());
}

// An upload names the file it is written as; a name with a path in it would
// write outside the collection's own folder, so only the last part is kept.
const baseName = (name: string) => name.split(/[\\/]/).pop() ?? "";

const folderOf = (req: BunRequest) => after(req, "/edit/collection/").replace(/\/+$/, "");

const missing = (folder: string) =>
  new Response(`There is no ${collectionPath(folder)}`, { status: 404 });

export const handleCollectionFiles = {
  async GET(req: BunRequest) {
    const denied = await requireAuth(req);
    if (denied) return denied;
    const folder = folderOf(req);
    const collection = await loadCollection(pages, folder);
    if (!collection) return missing(folder);
    return Response.json({
      fields: collection.fields,
      images: collection.images,
      uploads: imagesKey(collection.images.src) !== null && imagesKey(collection.images.thumb) !== null,
      problems: await collectionProblems(pages, folder),
    });
  },

  // One picture: the original as it was sent, and the thumbnail beside it.
  // `name` names an existing item's file, which is how a picture is swapped in
  // place — same name, so collection.json doesn't change and every address the
  // item already has goes on working.
  async POST(req: BunRequest) {
    const denied = await requireAuth(req);
    if (denied) return denied;
    const folder = folderOf(req);
    const collection = await loadCollection(pages, folder);
    if (!collection) return missing(folder);

    const src = imagesKey(collection.images.src);
    const thumbAt = imagesKey(collection.images.thumb);
    if (src === null || thumbAt === null) {
      return new Response(
        `${collectionPath(folder)} keeps its pictures at ${collection.images.src}, `
        + `which isn't this site's ${IMAGES_PATH} — put the file there yourself and name it in the item`,
        { status: 409 },
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return new Response("No picture was sent", { status: 400 });
    const said = form.get("name");
    const name = baseName(typeof said === "string" && said ? said : file.name);
    if (!name) return new Response("That picture has no name", { status: 400 });

    const thumb = thumbName(name, collection.images);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let small: Uint8Array;
    try {
      small = await thumbBytes(bytes, thumb);
    } catch (e) {
      // Failures speak: a file that isn't a picture is a mistake to see in the
      // editor, not a stack trace in the log.
      return new Response(`Couldn't read ${name} as a picture: ${(e as Error).message}`, { status: 422 });
    }
    await images.write(`${src}${name}`, bytes);
    await images.write(`${thumbAt}${thumb}`, small);

    // The pane shows the new picture at the address it already had, so the
    // browser has the old bytes cached: v is what ?v= is set to.
    return Response.json({
      name,
      src: imageUrl(collection.images.src, name),
      thumb: imageUrl(collection.images.thumb, thumb),
      v: Bun.hash(bytes).toString(36),
    });
  },
};
