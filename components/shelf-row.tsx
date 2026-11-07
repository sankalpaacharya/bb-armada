import type { ParkActions } from "@/hooks/use-park-actions";
import { isSnoozed, type ThreadEntry } from "@/lib/model";
import { Age, WakesIn } from "./age";
import { parkItems } from "./menu-items";
import { RowActions } from "./row-actions";
import { StatusGlyph } from "./status-mark";
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
  const threadId = entry.thread.id;
  const action =
    entry.shelf === "inactive"
      ? { label: "Settle", icon: "Check", run: () => actions.settle(threadId) }
      : {
          label: "Move to active",
          icon: "ArrowTurnBackward",
          run: () => actions.keep(threadId),
        };
  return (
    <li className="list-none">
      <ThreadLink
        thread={entry.thread}
        active={active}
        inline={parkItems(entry, actions)}
        onOpen={onOpen}
        className="px-2"
        titleClassName="text-muted-foreground/70 transition-colors duration-150 ease-out group-hover/row:text-muted-foreground motion-reduce:transition-none"
      >
        {({ title, shortcut }) => (
          <div className="pointer-events-none relative flex h-8 items-center gap-2">
            <span aria-hidden="true" className="h-4 w-6 shrink-0" />
            {title}
            {shortcut ?? (
              <span className="flex min-w-5 shrink-0 justify-end transition-opacity duration-[120ms] ease-[cubic-bezier(0.23,1,0.32,1)] group-focus-within/row:opacity-0 group-hover/row:opacity-0 motion-reduce:transition-none">
                {entry.status !== null ? (
                  <span className="grid h-4 min-w-4 place-items-center">
                    <StatusGlyph status={entry.status} />
                  </span>
                ) : isSnoozed(entry) ? (
                  <WakesIn until={entry.park.until} />
                ) : (
                  <Age at={entry.lastActivityAt} />
                )}
              </span>
            )}
            <RowActions actions={[action]} />
          </div>
        )}
      </ThreadLink>
    </li>
  );
}
