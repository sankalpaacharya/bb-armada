import type { ReactNode } from "react";

import { Icon } from "@/components/ui/icon";
import type { ParkActions } from "@/hooks/use-park-actions";
import { tomorrowMorning } from "@/lib/lifecycle";
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
        "grid size-4 cursor-pointer place-items-center rounded text-muted-foreground hover:bg-state-hover hover:text-foreground",
        FOCUS_RING,
      )}
    >
      <Icon name={icon} className="size-3" />
    </button>
  );
}

const LAYER =
  "[grid-area:1/1] items-center justify-self-end transition-opacity duration-[120ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none";

/**
 * A card's trailing slot. Status and park actions share one grid cell, so the
 * slot is as wide as the wider layer and the title never reflows. Hover (Tailwind
 * gates it on hover-capable devices) or focus crossfades between them.
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
  return (
    <span className="grid shrink-0">
      <span
        className={cn(
          LAYER,
          "flex gap-2 opacity-100 group-focus-within/row:pointer-events-none group-focus-within/row:opacity-0",
          "group-hover/row:pointer-events-none group-hover/row:opacity-0",
        )}
      >
        {children}
      </span>
      <span
        className={cn(
          LAYER,
          "pointer-events-none flex gap-px opacity-0 group-focus-within/row:pointer-events-auto group-focus-within/row:opacity-100",
          "group-hover/row:pointer-events-auto group-hover/row:opacity-100",
        )}
      >
        <ParkButton
          label="Snooze until tomorrow"
          icon="Clock"
          onActivate={() =>
            actions.snooze(entry.thread.id, tomorrowMorning(new Date()))
          }
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
