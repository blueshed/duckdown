import { createElement } from "@blueshed/railroad";
import feather from "feather-icons";

export function Icon({ name, size = 14 }: { name: string; size?: number }) {
  const icon = (feather.icons as Record<string, feather.FeatherIcon>)[name];
  if (!icon) return <span>{name}</span>;
  return <span class="icon" innerHTML={icon.toSvg({ width: size, height: size })} />;
}
