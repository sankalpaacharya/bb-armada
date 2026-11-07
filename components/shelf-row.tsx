import { Icon } from "@/components/ui/icon";
import type { ParkActions } from "@/hooks/use-park-actions";
import { isSnoozed, type ThreadEntry } from "@/lib/model";
import { CROSSFADE_LAYER, FOCUS_RING } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { Age, WakesIn } from "./age";
import { parkItems } from "./menu-items";
import { ThreadLink, type OpenThread } from "./thread-link";

/**
 * A shelved thread as one quiet line: its title, then when it wakes or how
 * long it has been quiet. Hover offers Settle on an inactive row and Move to
 * active on a parked one.
 */
export function ShelfRow({
  entry,
  active,
  actions,
  onOpen,
}: {
  entry: ThreadEntry;
  active: boolean;
  actions: ParkActions;
  onOpen: OpenThread;
}) {
  const hover =
    entry.shelf === "inactive"
      ? {
          label: "Settle",
          icon: "Check",
          run: () => actions.settle(entry.thread.id),
        }
      : {
          label: "Move to active",
          icon: "ArrowTurnBackward",
          run: () => actions.keep(entry.thread.id),
        };
  return (
    <li className="list-none">
      <ThreadLink
        thread={entry.thread}
        active={active}
        inline={parkItems(entry, actions)}
        onOpen={onOpen}
        className="flex h-8 items-center gap-2 px-2"
        titleClassName="text-muted-foreground/70 transition-colors duration-150 ease-out group-hover/row:text-muted-foreground motion-reduce:transition-none"
      >
        {({ title, shortcut }) => (
          <>
            <span aria-hidden="true" className="size-4 shrink-0" />
            <span className="pointer-events-none relative flex min-w-0 flex-1 items-center">
              {title}
            </span>
            <span className="grid shrink-0">
              <span
                className={cn(
                  CROSSFADE_LAYER,
                  "flex opacity-100 group-focus-within/row:opacity-0 group-hover/row:opacity-0",
                )}
              >
                {shortcut ??
                  (isSnoozed(entry) ? (
                    <WakesIn until={entry.park.until} />
                  ) : (
                    <Age at={entry.lastActivityAt} />
                  ))}
              </span>
              <button
                type="button"
                aria-label={hover.label}
                title={hover.label}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  hover.run();
                }}
                className={cn(
                  CROSSFADE_LAYER,
                  "pointer-events-none grid size-5 cursor-pointer place-items-center rounded text-muted-foreground opacity-0 group-focus-within/row:pointer-events-auto group-focus-within/row:opacity-100 group-hover/row:pointer-events-auto group-hover/row:opacity-100 hover:bg-state-hover hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                <Icon name={hover.icon} className="size-3.5" />
              </button>
            </span>
          </>
        )}
      </ThreadLink>
    </li>
  );
}
