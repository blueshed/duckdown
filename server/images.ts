// Where a collection's pictures are, and what its thumbnails are called.
//
// Pure string work, in a module of its own because both sides need it: the
// server resolves an item's src and thumb when it renders a page, and the
// editor's collection pane shows the same two URLs while you are editing. A
// pane that guessed differently would show the wrong picture beside the right
// title, which is exactly the bug a gallery can least afford — so the rule is
// written once and read from both ends.

export type Images = {
  src: string;        // base for the original
  thumb: string;      // base for the thumbnail (the same, unless said)
  suffix: string;     // "_tn": Battersea.jpg → Battersea_tn.jpg
  extension: string;  // ".png" when every thumbnail is a png, whatever the original is
};

export const DEFAULT_IMAGES: Images = { src: "/static/images/", thumb: "", suffix: "_tn", extension: "" };

// What a collection means when it says nothing: both bases under the site's
// own static/images/.
export const ownImages = (): Images => ({ ...DEFAULT_IMAGES, thumb: DEFAULT_IMAGES.src });

// base + name, each part of the name escaped as a URL path is: a file called
// "Large Car Painting.jpeg" is fetched as Large%20Car%20Painting.jpeg.
export function imageUrl(base: string, name: string): string {
  if (!name) return "";
  return (base.endsWith("/") || base === "" ? base : `${base}/`) + encodeURI(name);
}

// The thumbnail's name: the suffix goes before the extension, and a collection
// whose thumbnails are all png says so once rather than per item.
export function thumbName(src: string, images: Images): string {
  const cut = src.lastIndexOf(".");
  const dot = cut > src.lastIndexOf("/") ? cut : src.length;
  return src.slice(0, dot) + images.suffix + (images.extension || src.slice(dot));
}
