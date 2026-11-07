import { cn } from "@/lib/utils";
import { statusLabel, type Lane } from "@/lib/status";

export function LaneGlyph({
  lane,
  className,
}: {
  lane: Lane | null;
  className?: string;
}) {
  if (lane === null) return null;
  return (
    <span
      role="img"
      aria-label={statusLabel(lane)}
      title={statusLabel(lane)}
      data-lane={lane}
      className={cn(
        "armada-glyph shrink-0 rounded-full",
        lane === "working" ? "armada-spinner size-2.5" : "armada-dot size-2",
        className,
      )}
    />
  );
}
