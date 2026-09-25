import { createElement, signal, computed, when } from "@blueshed/railroad";
import { apiJson } from "../api";
import { speak } from "../notice";
import { Icon } from "./Icon";

// Resources' icon tab: the picture on a browser tab and on a phone's home
// screen (routes/site-icon.ts). Any picture will do — the browser cuts its
// middle square and makes the two PNGs the site answers, so a person never
// needs to know what either file is called or how big it should be.

type Icons = { "apple-touch-icon.png": string | null; "favicon.ico": string | null };

// A phone fills a transparent home-screen icon with black; white is what the
// picture was most likely drawn on. A tab shows transparency as it is.
const HOME_FILL = "#ffffff";

// The middle square of a picture, at `size` pixels, as a PNG. Through an <img>
// rather than createImageBitmap, which won't read an SVG in every browser. The
// whole picture is drawn first, at least as big as the icon, and the square
// cut from that: an SVG sized in percent says 150×150 and is drawn at whatever
// it's asked for, so a square cut from the <img> itself came out a corner.
export async function squarePng(file: Blob, size: number, fill?: string): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth || size;
    const h = img.naturalHeight || size;
    const k = Math.max(1, size / Math.min(w, h));
    const whole = document.createElement("canvas");
    whole.width = Math.round(w * k);
    whole.height = Math.round(h * k);
    whole.getContext("2d")!.drawImage(img, 0, 0, whole.width, whole.height);
    const side = Math.min(whole.width, whole.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fillRect(0, 0, size, size);
    }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(whole, (whole.width - side) / 2, (whole.height - side) / 2, side, side, 0, 0, size, size);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("the browser made no PNG"))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function SiteIcon() {
  const icons = signal<Icons | null>(null);
  const busy = signal(false);
  let picker: HTMLInputElement | null = null;

  apiJson<Icons>("find the site's icon", "/edit/site-icon").then((data) => { if (data) icons.set(data); });

  const choose = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    busy.set(true);
    try {
      const form = new FormData();
      form.append("apple-touch-icon.png", await squarePng(file, 180, HOME_FILL), "apple-touch-icon.png");
      form.append("favicon.ico", await squarePng(file, 48), "favicon.ico");
      const data = await apiJson<Icons>("set the site's icon", "/edit/site-icon", { method: "POST", body: form });
      if (data) icons.set(data);
    } catch (err) {
      speak(`Couldn't read ${file.name} as a picture: ${(err as Error).message}`);
    } finally {
      busy.set(false);
    }
  };

  const home = computed(() => icons.get()?.["apple-touch-icon.png"] ?? null);
  const tab = computed(() => icons.get()?.["favicon.ico"] ?? null);

  return (
    <div class="sidebar-content site-icon">
      <p class="drawer-note">
        The picture on a browser tab, and on a phone's home screen when someone
        adds the site there. A square picture is best: any other is cut to its
        middle square.
      </p>

      {when(icons, () => (
        <div class="icon-shown">
          {when(home, () => (
            <figure>
              <img class="icon-home" src={home} alt="The site's icon on a phone's home screen" width="90" height="90" />
              <figcaption>home screen</figcaption>
            </figure>
          ), () => <p class="drawer-note">No home-screen icon yet.</p>)}
          {when(tab, () => (
            <figure>
              {/* On a light tab bar and a dark one: a picture drawn in dark
                  lines on nothing can vanish on the second. */}
              <span class="icon-tabs">
                <span class="icon-tab light"><img src={tab} alt="The site's icon on a light tab bar" width="16" height="16" /></span>
                <span class="icon-tab dark"><img src={tab} alt="The site's icon on a dark tab bar" width="16" height="16" /></span>
              </span>
              <figcaption>browser tab</figcaption>
            </figure>
          ), () => <p class="drawer-note">No tab icon yet.</p>)}
        </div>
      ))}

      <input type="file" accept="image/*" onchange={choose} class="hidden-file" tabindex="-1"
        ref={(el: HTMLInputElement) => { picker = el; }} />
      <button class="icon-choose" aria-busy={busy.map(String)} disabled={busy}
        onclick={() => picker?.click()}>
        <Icon name="upload" size={12} /> {busy.map((b) => (b ? "Setting the icon…" : "Choose a picture…"))}
      </button>
    </div>
  );
}
