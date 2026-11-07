import { TILE } from "@/lib/styles";
import { cn } from "@/lib/utils";

/**
 * A project's logo, decorative because its name is on the row. It renders
 * only through <img>, so an SVG logo can never run a script.
 */
export function ProjectLogo({ src }: { src: string }) {
  return (
    <img
      alt=""
      src={src}
      className={cn("block shrink-0 object-contain", TILE.badge)}
    />
  );
}
