import { createElement, Fragment, signal, computed, when } from "@blueshed/railroad";
import { apiJson } from "../api";
import { speak } from "../notice";
import { Icon } from "./Icon";

// Resources' icon tab: the picture on a browser tab and on a phone's home
// screen, and the card a link to the site shows when it's shared
// (routes/site-icon.ts). Any picture will do — the browser cuts what each
// needs from it and makes the files the site answers, so a person never needs
// to know what any of them is called or how big it should be.

type Icons = {
  "apple-touch-icon.png": string | null;
  "favicon.ico": string | null;
  elsewhere: { template: string; icons: string[] }[];   // templates naming icons of their own
  card: string | null;
  home: { title: string; description: string };          // what a shared link says under the card
};

// A phone fills a transparent home-screen icon with black, and a card is a
// JPEG, which has no transparency: white is what a picture was most likely
// drawn on. A tab shows transparency as it is.
const WHITE = "#ffffff";

// The card's size, as the server checks it (icons.ts).
const CARD = { width: 1200, height: 630 };

// The whole picture on a canvas, at least `min` on its short side. Through an
// <img> rather than createImageBitmap, which won't read an SVG in every
// browser; and whole first, because an SVG sized in percent says 150×150 and
// is drawn at whatever it's asked for, so a piece cut from the <img> itself
// came out a corner.
async function whole(file: Blob, min: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth || min;
    const h = img.naturalHeight || min;
    const k = Math.max(1, min / Math.min(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * k);
    canvas.height = Math.round(h * k);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// A canvas of `width`×`height`, filled when asked, to draw on.
function sheet(width: number, height: number, fill?: string) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.imageSmoothingQuality = "high";
  return { canvas, ctx };
}

const encoded = (canvas: HTMLCanvasElement, type: string) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("the browser made no picture"))), type, 0.86));

// The middle square of a picture, at `size` pixels, as a PNG.
export async function squarePng(file: Blob, size: number, fill?: string): Promise<Blob> {
  const from = await whole(file, size);
  const side = Math.min(from.width, from.height);
  const { canvas, ctx } = sheet(size, size, fill);
  ctx.drawImage(from, (from.width - side) / 2, (from.height - side) / 2, side, side, 0, 0, size, size);
  return encoded(canvas, "image/png");
}

export type Fit = "fill" | "whole";

// Whether a picture fills the card, cut to its shape, or is shown whole on
// white: a landscape photograph near the card's own shape loses little to the
// cut; a square logo, or anything upright, would lose its top and bottom —
// which is how blueshed.co.uk's first card came out.
export const cardFit = (width: number, height: number): Fit => {
  const ratio = width / height;
  return ratio >= 1.5 && ratio <= 2.5 ? "fill" : "whole";
};

// The site's card from a picture: its middle cut to the card's shape, or all
// of it on white, inside 90% of the card's width and 80% of its height. Says
// which, so the tab can offer the other.
export async function cardJpeg(file: Blob, fit?: Fit): Promise<{ blob: Blob; fit: Fit }> {
  const from = await whole(file, CARD.width);
  const how = fit ?? cardFit(from.width, from.height);
  const { canvas, ctx } = sheet(CARD.width, CARD.height, WHITE);
  if (how === "fill") {
    const w = Math.min(from.width, from.height * CARD.width / CARD.height);
    const h = w * CARD.height / CARD.width;
    ctx.drawImage(from, (from.width - w) / 2, (from.height - h) / 2, w, h, 0, 0, CARD.width, CARD.height);
  } else {
    const k = Math.min(CARD.width * 0.9 / from.width, CARD.height * 0.8 / from.height);
    const [w, h] = [from.width * k, from.height * k];
    ctx.drawImage(from, 0, 0, from.width, from.height, (CARD.width - w) / 2, (CARD.height - h) / 2, w, h);
  }
  return { blob: await encoded(canvas, "image/jpeg"), fit: how };
}

// The site's card from its icon: the icon in the middle, on white.
export async function iconCard(file: Blob): Promise<Blob> {
  const side = Math.round(CARD.height * 0.6);
  const from = await whole(file, side);
  const s = Math.min(from.width, from.height);
  const { canvas, ctx } = sheet(CARD.width, CARD.height, WHITE);
  ctx.drawImage(from, (from.width - s) / 2, (from.height - s) / 2, s, s, (CARD.width - side) / 2, (CARD.height - side) / 2, side, side);
  return encoded(canvas, "image/jpeg");
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
      form.append("apple-touch-icon.png", await squarePng(file, 180, WHITE), "apple-touch-icon.png");
      form.append("favicon.ico", await squarePng(file, 48), "favicon.ico");
      const data = await apiJson<Icons>("set the site's icon", "/edit/site-icon", { method: "POST", body: form });
      if (data) icons.set(data);
    } catch (err) {
      speak(`Couldn't read ${file.name} as a picture: ${(err as Error).message}`);
    } finally {
      busy.set(false);
    }
  };

  // The card: made from a picture chosen, or from the icon; or taken away.
  const carding = signal(false);
  let cardPicker: HTMLInputElement | null = null;
  // The picture the card was last made from, and how, while you're here: so
  // it can be made again the other way without choosing it again.
  const picked = signal<{ file: File; fit: Fit } | null>(null);
  const sendCard = async (what: string, make: () => Promise<Blob>, made: () => void = () => picked.set(null)) => {
    carding.set(true);
    try {
      const form = new FormData();
      form.append("card.jpg", await make(), "card.jpg");
      const data = await apiJson<Icons>("set the site's sharing card", "/edit/site-icon?card", { method: "POST", body: form });
      if (data) {
        icons.set(data);
        made();
      }
    } catch (err) {
      speak(`Couldn't read ${what} as a picture: ${(err as Error).message}`);
    } finally {
      carding.set(false);
    }
  };
  const chooseCard = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file) fromPicture(file);
  };
  const fromPicture = (file: File, fit?: Fit) => {
    let how: Fit = "fill";
    return sendCard(file.name, async () => {
      const card = await cardJpeg(file, fit);
      how = card.fit;
      return card.blob;
    }, () => picked.set({ file, fit: how }));
  };
  const fromIcon = () => sendCard("the icon", async () => iconCard(await (await fetch(home.peek()!)).blob()));
  const dropCard = async () => {
    const data = await apiJson<Icons>("take the sharing card away", "/edit/site-icon?card", { method: "DELETE" });
    if (data) {
      icons.set(data);
      picked.set(null);
    }
  };

  const home = computed(() => icons.get()?.["apple-touch-icon.png"] ?? null);
  const tab = computed(() => icons.get()?.["favicon.ico"] ?? null);
  const card = computed(() => icons.get()?.card ?? null);
  // What a shared link to the front page says under its picture.
  const said = () => icons.get()?.home?.title || location.host;
  const described = () => icons.get()?.home?.description ?? "";

  return (
    <div class="sidebar-content site-icon">
      <p class="drawer-note">
        The picture on a browser tab, and on a phone's home screen when someone
        adds the site there. A square picture is best: any other is cut to its
        middle square.
      </p>

      {/* A template's own <link rel="icon"> wins over these: say so, or the
          tab shows an icon the pages it wraps never do. Setting the icon
          doesn't change a template, so what this says is read once. */}
      {when(() => icons.get()?.elsewhere.length, () => {
        const named = icons.peek()!.elsewhere;
        const one = named.length === 1;
        return (
          <div class="icon-elsewhere" role="note">
            <p>
              {one ? "A template names its own icon, and the pages it wraps show that"
                : "Some templates name their own icon, and the pages they wrap show that"} instead of this one:
            </p>
            <ul>
              {named.map(({ template, icons }) => (
                <li><code>templates/{template}</code> — {icons.map((href, i) => <>{i ? ", " : ""}<code>{href}</code></>)}</li>
              ))}
            </ul>
            <p>Take out {one ? "its" : "their"} <code>&lt;link rel="icon"&gt;</code> lines to use the one set here.</p>
          </div>
        );
      })}

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
        aria-label={busy.map((b) => (b ? "Setting the icon…" : "Choose a picture for the icon"))}
        onclick={() => picker?.click()}>
        <Icon name="upload" size={12} /> {busy.map((b) => (b ? "Setting the icon…" : "Choose a picture…"))}
      </button>

      <h4 class="site-icon-heading">Sharing</h4>
      <p class="drawer-note">
        The picture a link to the site shows when it's shared — in a message, on
        social media — for any page that doesn't name one with <code>image:</code>.
      </p>
      {/* As a shared link would look: the card, and the front page's words
          under it; with no card, the icon, small. */}
      {when(icons, () => (
        <figure class="share">
          <div class={card.map((c) => (c ? "share-card" : "share-card small"))}>
            {when(card, () => <img src={card} alt="The site's sharing card" />,
              () => when(home, () => <img src={home} alt="The site's icon, which a shared link shows with no card" />))}
            <div class="share-words">
              <span class="share-host">{() => location.host}</span>
              <strong>{said}</strong>
              {when(described, () => <span>{described}</span>)}
            </div>
          </div>
          <figcaption>a shared link</figcaption>
        </figure>
      ))}
      {when(() => icons.get() && !card.get(), () => (
        <p class="drawer-note">{() => (home.get()
          ? "No card yet: a shared link shows the icon, small."
          : "No card yet, and no icon: a shared link shows no picture.")}</p>
      ))}
      <input type="file" accept="image/*" onchange={chooseCard} class="hidden-file" tabindex="-1"
        ref={(el: HTMLInputElement) => { cardPicker = el; }} />
      <div class="share-actions">
        <button aria-busy={carding.map(String)} disabled={carding} onclick={() => cardPicker?.click()}
          aria-label={carding.map((b) => (b ? "Making the card…" : "Choose a picture for the card"))}>
          <Icon name="upload" size={12} /> {carding.map((b) => (b ? "Making the card…" : "Choose a picture…"))}
        </button>
        {/* The picture just chosen, made again the other way. */}
        {when(picked, (p$) => (
          <button disabled={carding} onclick={() => fromPicture(p$.peek().file, p$.peek().fit === "fill" ? "whole" : "fill")}>
            {p$.map((p) => (p.fit === "fill" ? "Show it whole" : "Fill the card"))}
          </button>
        ))}
        {when(home, () => (
          <button disabled={carding} onclick={fromIcon}>Make one from the icon</button>
        ))}
        {when(card, () => (
          <button class="danger-subtle" disabled={carding} onclick={dropCard} aria-label="Remove the card">Remove</button>
        ))}
      </div>
    </div>
  );
}
