import { avatarDataUri } from "@/lib/avatar";
import type { Avatar } from "@/lib/captains";
import { TILE } from "@/lib/styles";
import { cn } from "@/lib/utils";

/** The one owner of avatar rendering: a decorative image in a rounded-square tile. */
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
      className={cn(
        "block shrink-0 overflow-hidden bg-sidebar-accent",
        TILE[size],
        className,
      )}
    >
      <img alt="" src={avatarDataUri(avatar)} className="size-full" />
    </span>
  );
}
