import { createStaticStorage } from "./storage";
import { DEBUG } from "./config";
import { kept } from "./kept";

// The site's own pictures, set in the editor's icon tab (routes/site-icon.ts):
// the icons a browser tab and a phone's home screen show, and the card a link
// to the site shows when it's shared. All of them live in static/.

export const ICONS = { "apple-touch-icon.png": 180, "favicon.ico": 48 } as const;
export const HOME_ICON = "apple-touch-icon.png";

// 1200×630: what the places that unfurl a link (Open Graph, X's large card)
// ask for. A JPEG: a card is a picture, often a photograph.
export const CARD = { name: "card.jpg", width: 1200, height: 630 } as const;

export type SitePicture = { file: string; width: number; height: number; large: boolean };

const statics = createStaticStorage();

// What a shared link shows when its page names no image: of its own — the
// site's card, else its home-screen icon (a small card, but a picture), else
// nothing. Kept like everything else the site knows about itself (kept.ts);
// the icon tab calls siteChanged() when it writes either.
const found = kept(async (store): Promise<SitePicture | null> => {
  if (await store.exists(CARD.name)) return { file: CARD.name, width: CARD.width, height: CARD.height, large: true };
  if (await store.exists(HOME_ICON)) return { file: HOME_ICON, width: ICONS[HOME_ICON], height: ICONS[HOME_ICON], large: false };
  return null;
});

export const sitePicture = (debug = DEBUG): Promise<SitePicture | null> => found(statics, "", debug);
