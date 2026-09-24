import { createElement } from "@blueshed/railroad";
import {
  ArchiveRestore, ArrowDown, ArrowUp, CloudDownload, CloudUpload, Copy, CornerLeftUp, Droplet, ExternalLink, FilePlus, FileText,
  Folder, FolderInput, FolderPlus, History, Image, ImagePlus, Key, LayoutGrid, LayoutTemplate, LogOut, Plus,
  Redo2, RefreshCw, RotateCcw, Save, Trash2, Undo2, Upload, Users, X,
} from "lucide-static";

const ICONS: Record<string, string> = {
  "archive-restore": ArchiveRestore,
  "arrow-down": ArrowDown,
  "arrow-up": ArrowUp,
  "cloud-download": CloudDownload,
  "cloud-upload": CloudUpload,
  "copy": Copy,
  "corner-left-up": CornerLeftUp,
  "droplet": Droplet,
  "external-link": ExternalLink,
  "file-plus": FilePlus,
  "file-text": FileText,
  "folder": Folder,
  "folder-input": FolderInput,
  "folder-plus": FolderPlus,
  "history": History,
  "image": Image,
  "image-plus": ImagePlus,
  "key": Key,
  "layout-grid": LayoutGrid,
  "layout-template": LayoutTemplate,
  "redo": Redo2,
  "refresh-cw": RefreshCw,
  "rotate-ccw": RotateCcw,
  "log-out": LogOut,
  "plus": Plus,
  "save": Save,
  "trash-2": Trash2,
  "undo": Undo2,
  "upload": Upload,
  "users": Users,
  "x": X,
};

export function Icon({ name, size = 14 }: { name: string; size?: number }) {
  const svg = ICONS[name];
  if (!svg) return <span>{name}</span>;
  const sized = svg.replace('width="24"', `width="${size}"`).replace('height="24"', `height="${size}"`);
  // Decorative: every button carries its own text or aria-label.
  return <span class="icon" aria-hidden="true" innerHTML={sized} />;
}
