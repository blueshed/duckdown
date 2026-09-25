// n162: a picture kept at narrower widths, and offered at them.
import { describe, test, expect, spyOn, beforeAll } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { RUN, SITE, BASE, authed, signIn } from "./helpers";
import { LocalStorage } from "../server/storage";
import { makeWidths, makeMissingWidths, imagesCommand, withWidths, MANIFEST } from "../server/widths";
import { widthName, WIDTH_NAME } from "../server/images";
import { siteChanged } from "../server/kept";
import { cli } from "../server/cli";

const source = readFileSync("tests/example/static/favicon.ico");   // a 1000px PNG
const picture = async (width: number, format: "jpeg" | "png" = "jpeg") => {
  const img = new Bun.Image(source).resize(width, Math.round(width * 0.6), { fit: "fill" });
  return new Uint8Array(await (format === "png" ? img.png() : img.jpeg()).bytes());
};
const widthOf = async (bytes: Uint8Array) => (await new Bun.Image(bytes).metadata()).width;
const scratch = () => {
  const root = mkdtempSync(join(RUN, "widths-"));
  return { root, store: new LocalStorage(root) };
};

describe("the names", () => {
  test("a width is named after its picture, and known as one", () => {
    expect(widthName("photo.jpg", 960)).toBe("photo-960w.jpg");
    expect(widthName("a.b/c", 480)).toBe("a.b/c-480w");
    expect(WIDTH_NAME.test("photo-960w.jpg")).toBe(true);
    expect(WIDTH_NAME.test("photo-960.jpg")).toBe(false);
  });
});

describe("makeWidths", () => {
  test("a wide picture gets each narrower width, and its folder says so", async () => {
    const { root, store } = scratch();
    const bytes = await picture(2000);
    expect(await makeWidths("works/big.jpg", bytes, store)).toEqual([480, 960, 1600]);
    for (const w of [480, 960, 1600]) expect(await widthOf(readFileSync(join(root, "works", `big-${w}w.jpg`)))).toBe(w);
    expect(JSON.parse(readFileSync(join(root, "works", MANIFEST), "utf8"))).toEqual({ "big.jpg": { width: 2000, widths: [480, 960, 1600] } });
  });

  test("never wider than the original; a png stays a png; nothing for what it can't or needn't", async () => {
    const { root, store } = scratch();
    expect(await makeWidths("small.png", await picture(600, "png"), store)).toEqual([480]);
    expect((await new Bun.Image(readFileSync(join(root, "small-480w.png"))).metadata()).format).toBe("png");
    expect(await makeWidths("tiny.jpg", await picture(300), store)).toEqual([]);
    expect(await makeWidths("logo.svg", new TextEncoder().encode("<svg/>"), store)).toEqual([]);
    expect(await makeWidths("small-480w.png", await picture(600, "png"), store)).toEqual([]);   // a width, not a picture
    expect(await makeWidths("broken.jpg", new TextEncoder().encode("not a picture"), store)).toEqual([]);
    expect(Object.keys(JSON.parse(readFileSync(join(root, MANIFEST), "utf8")))).toEqual(["small.png"]);
    // Replaced by one too narrow to need them: its entry goes.
    expect(await makeWidths("small.png", await picture(400, "png"), store)).toEqual([]);
    expect(JSON.parse(readFileSync(join(root, MANIFEST), "utf8"))).toEqual({});
  });

  test("a width no smaller in bytes than its original isn't kept", async () => {
    const { root, store } = scratch();
    // Squeezed to a two-colour palette: a copy as an ordinary png is the bigger file.
    const squeezed = new Uint8Array(await new Bun.Image(source).resize(1000, 600, { fit: "fill" }).png({ palette: true, colors: 2 }).bytes());
    const made = await makeWidths("squeezed.png", squeezed, store);
    expect(made).not.toContain(960);
    for (const w of made) expect(readFileSync(join(root, `squeezed-${w}w.png`)).length).toBeLessThan(squeezed.length);
    expect(existsSync(join(root, "squeezed-960w.png"))).toBe(false);
  });

  test("duckdown images: every picture without its widths, folders and all, once", async () => {
    const { root, store } = scratch();
    mkdirSync(join(root, "works"), { recursive: true });
    mkdirSync(join(root, ".hidden"), { recursive: true });
    writeFileSync(join(root, "wide.jpg"), await picture(1200));
    writeFileSync(join(root, "works", "one.jpg"), await picture(1000));
    writeFileSync(join(root, ".hidden", "secret.jpg"), await picture(1000));
    writeFileSync(join(root, "logo.svg"), "<svg/>");
    const said: string[] = [];
    expect(await imagesCommand((l) => said.push(l), store)).toBe(0);
    expect(said.sort()).toEqual(["made the widths of 2 picture(s)", "wide.jpg: 480, 960", "works/one.jpg: 480, 960"]);
    expect(existsSync(join(root, ".hidden", "secret-480w.jpg"))).toBe(false);
    said.length = 0;
    expect(await makeMissingWidths((l) => said.push(l), store)).toBe(0);   // already made: nothing again
    await imagesCommand((l) => said.push(l), store);
    expect(said).toEqual(["every picture that can have its widths has them"]);
  });
});

describe("withWidths", () => {
  test("a picture with its widths gets a srcset; anything else is left as it is", async () => {
    const { root, store } = scratch();
    mkdirSync(join(root, "works"), { recursive: true });
    writeFileSync(join(root, "works", MANIFEST), JSON.stringify({ "Big Car.jpg": { width: 2000, widths: [480, 960] } }));
    const html = [
      '<img src="/static/images/works/Big%20Car.jpg" alt="A car">',
      '<img src="/static/images/works/other.jpg" alt="">',
      '<img src="https://cdn.example.com/works/Big%20Car.jpg">',
      '<img srcset="mine 1x" src="/static/images/works/Big%20Car.jpg">',
    ].join("\n");
    const out = (await withWidths(html, store, true)).split("\n");
    expect(out[0]).toBe('<img srcset="/static/images/works/Big%20Car-480w.jpg 480w, /static/images/works/Big%20Car-960w.jpg 960w, '
      + '/static/images/works/Big%20Car.jpg 2000w" sizes="(max-width: 46rem) 100vw, 46rem" src="/static/images/works/Big%20Car.jpg" alt="A car">');
    expect(out.slice(1)).toEqual(html.split("\n").slice(1));
    expect(await withWidths("<p>no pictures</p>", store, true)).toBe("<p>no pictures</p>");
  });
});

describe("the site", () => {
  beforeAll(signIn);
  const images = join(SITE, "static", "images");
  const clean = () => {
    for (const name of ["upload.jpg", "upload-480w.jpg", "upload-960w.jpg", MANIFEST]) rmSync(join(images, name), { force: true });
    rmSync(join(SITE, "pages", "pictured-wide.md"), { force: true });
    siteChanged();
  };

  test("an upload makes its widths, the grid doesn't list them, and a page offers them", async () => {
    try {
      const form = new FormData();
      form.append("file", new File([await picture(1200)], "upload.jpg"));
      expect((await fetch(`${BASE}/edit/browse/`, { ...authed(), method: "POST", body: form })).status).toBe(200);
      expect(existsSync(join(images, "upload-960w.jpg"))).toBe(true);
      const listed = await (await fetch(`${BASE}/edit/browse/`, authed())).json();
      expect(listed.files.map((f: { name: string }) => f.name)).toContain("upload.jpg");
      expect(listed.files.map((f: { name: string }) => f.name).filter((n: string) => WIDTH_NAME.test(n))).toEqual([]);
      writeFileSync(join(SITE, "pages", "pictured-wide.md"), "title: Wide\n\n![A wide one](/static/images/upload.jpg)\n");
      siteChanged();
      const page = await (await fetch(`${BASE}/pictured-wide.html`)).text();
      expect(page).toContain('srcset="/static/images/upload-480w.jpg 480w, /static/images/upload-960w.jpg 960w, /static/images/upload.jpg 1200w"');
      expect((await fetch(`${BASE}/static/images/upload-480w.jpg`)).status).toBe(200);
    } finally {
      clean();
    }
  });

  test("duckdown images is a duckdown command", async () => {
    const log = spyOn(console, "log").mockImplementation(() => {});
    try {
      expect(await cli(["images"])).toBe(0);
      expect(log.mock.calls.at(-1)![0]).toBe("every picture that can have its widths has them");   // the seed's are SVG
    } finally {
      log.mockRestore();
      clean();
    }
  });
});
