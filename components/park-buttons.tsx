import type { ReactNode } from "react";

import { Icon } from "@/components/ui/icon";
import type { ParkActions } from "@/hooks/use-park-actions";
import { snoozePresets } from "@/lib/lifecycle";
import type { ThreadEntry } from "@/lib/model";
import { FOCUS_RING } from "@/lib/styles";
import { cn } from "@/lib/utils";

function ParkButton({
  label,
  icon,
  onActivate,
}: {
  label: string;
  icon: string;
  onActivate: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onActivate();
      }}
      className={cn(
        "grid size-5 cursor-pointer place-items-center rounded text-muted-foreground hover:bg-state-hover hover:text-foreground",
        FOCUS_RING,
      )}
    >
      <Icon name={icon} className="size-3.5" />
    </button>
  );
}

/**
 * A card's trailing slot: the status at rest, and on hover or focus the park
 * actions in its place, so the text beside it never shifts.
 */
export function ParkableSlot({
  entry,
  actions,
  children,
}: {
  entry: ThreadEntry;
  actions: ParkActions;
  children: ReactNode;
}) {
  if (!entry.parkable) return children;
  const tomorrow = () =>
    snoozePresets(new Date()).find((preset) => preset.id === "tomorrow")!;
  return (
    <span className="relative flex shrink-0 items-center">
      <span className="flex items-center group-hover/row:invisible group-focus-within/row:invisible">
        {children}
      </span>
      <span className="pointer-events-auto absolute top-1/2 right-0 hidden -translate-y-1/2 items-center gap-0.5 group-hover/row:flex group-focus-within/row:flex">
        <ParkButton
          label="Snooze until tomorrow"
          icon="Clock"
          onActivate={() => actions.snooze(entry.thread.id, tomorrow().until)}
        />
        <ParkButton
          label="Settle"
          icon="Check"
          onActivate={() => actions.settle(entry.thread.id)}
        />
      </span>
    </span>
  );
}
