import { backgroundOf, portraitOf } from "@/lib/avatar";
import type { Avatar } from "@/lib/captains";
import { TILE } from "@/lib/styles";
import { cn } from "@/lib/utils";

/** The one owner of avatar rendering: a decorative portrait on its background in a rounded-square tile. */
export function CaptainTile({
  avatar,
  size = "row",
  className,
}: {
  avatar: Avatar;
  size?: keyof typeof TILE;
  className?: string;
}) {
  return (
    <span
      className={cn("block shrink-0 overflow-hidden", TILE[size], className)}
      style={{ backgroundColor: backgroundOf(avatar) }}
    >
      <img alt="" src={portraitOf(avatar)} className="size-full" />
    </span>
  );
}
