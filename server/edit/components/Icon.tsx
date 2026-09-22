import { createElement } from "@blueshed/railroad";
import {
  ArrowDown, ArrowUp, Copy, CornerLeftUp, Droplet, ExternalLink, FilePlus, FileText,
  Folder, FolderPlus, Image, ImagePlus, LayoutGrid, LayoutTemplate, LogOut, Plus,
  RefreshCw, Save, Trash2, Upload, X,
} from "lucide-static";

const ICONS: Record<string, string> = {
  "arrow-down": ArrowDown,
  "arrow-up": ArrowUp,
  "copy": Copy,
  "corner-left-up": CornerLeftUp,
  "droplet": Droplet,
  "external-link": ExternalLink,
  "file-plus": FilePlus,
  "file-text": FileText,
  "folder": Folder,
  "folder-plus": FolderPlus,
  "image": Image,
  "image-plus": ImagePlus,
  "layout-grid": LayoutGrid,
  "layout-template": LayoutTemplate,
  "refresh-cw": RefreshCw,
  "log-out": LogOut,
  "plus": Plus,
  "save": Save,
  "trash-2": Trash2,
  "upload": Upload,
  "x": X,
};

export function Icon({ name, size = 14 }: { name: string; size?: number }) {
  const svg = ICONS[name];
  if (!svg) return <span>{name}</span>;
  const sized = svg.replace('width="24"', `width="${size}"`).replace('height="24"', `height="${size}"`);
  // Decorative: every button carries its own text or aria-label.
  return <span class="icon" aria-hidden="true" innerHTML={sized} />;
}
