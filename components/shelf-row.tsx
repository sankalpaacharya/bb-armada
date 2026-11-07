import { Icon } from "@/components/ui/icon";
import type { ParkActions } from "@/hooks/use-park-actions";
import type { Park } from "@/lib/lifecycle";
import type { ParkedEntry } from "@/lib/model";
import { FOCUS_RING } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { Age, WakesIn } from "./age";
import { parkItems } from "./menu-items";
import { ThreadLink, type OpenThread } from "./thread-link";

/** A parked thread as one quiet line: its title, then when it wakes or how long ago it settled. */
export function ShelfRow({
  entry,
  active,
  actions,
  onOpen,
}: {
  entry: ParkedEntry<Park>;
  active: boolean;
  actions: ParkActions;
  onOpen: OpenThread;
}) {
  return (
    <li className="list-none">
      <ThreadLink
        thread={entry.thread}
        active={active}
        inline={parkItems(entry, actions)}
        onOpen={onOpen}
        className="flex h-8 items-center gap-2 px-2.5"
        titleClassName="text-muted-foreground/70 group-hover/row:text-foreground"
      >
        {({ title, shortcut }) => (
          <>
            <span className="pointer-events-none relative flex min-w-0 flex-1 items-center">
              {title}
            </span>
            <span className="relative flex w-7 shrink-0 items-center justify-end">
              <span className="flex items-center group-hover/row:invisible group-focus-within/row:invisible">
                {shortcut ??
                  (entry.park.kind === "snoozed" ? (
                    <WakesIn until={entry.park.until} />
                  ) : (
                    <Age at={entry.park.at} />
                  ))}
              </span>
              <button
                type="button"
                aria-label="Move to active"
                title="Move to active"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  actions.unpark(entry.thread.id);
                }}
                className={cn(
                  "pointer-events-auto absolute top-1/2 right-0 hidden size-5 -translate-y-1/2 cursor-pointer place-items-center rounded text-muted-foreground group-hover/row:grid group-focus-within/row:grid hover:bg-state-hover hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                <Icon name="ArrowTurnBackward" className="size-3.5" />
              </button>
            </span>
          </>
        )}
      </ThreadLink>
    </li>
  );
}
