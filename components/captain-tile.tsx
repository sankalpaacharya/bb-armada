import { useProjectLogos } from "@/hooks/use-project-logos";
import { avatarDataUri } from "@/lib/avatar";
import type { Avatar } from "@/lib/captains";
import { TILE } from "@/lib/styles";
import { cn } from "@/lib/utils";

/**
 * The one owner of avatar rendering: a decorative image in a rounded-square
 * tile. A logo avatar shows its project's logo, whole and inset on white so a
 * dark or wide logo still reads; until the logo loads, or when the project
 * has none, it shows its face.
 */
export function CaptainTile({
  avatar,
  projectId,
  size = "row",
  className,
}: {
  avatar: Avatar;
  projectId: string;
  size?: keyof typeof TILE;
  className?: string;
}) {
  const logo = useProjectLogos()[projectId];
  const showsLogo = avatar.style === "logo" && logo !== undefined;
  return (
    <span
      className={cn(
        "block shrink-0 overflow-hidden",
        TILE[size],
        showsLogo && "bg-white ring-1 ring-black/10 ring-inset",
        className,
      )}
    >
      <img
        alt=""
        src={showsLogo ? logo : avatarDataUri(avatar)}
        className={cn("size-full", showsLogo && "object-contain p-[14%]")}
      />
    </span>
  );
}
