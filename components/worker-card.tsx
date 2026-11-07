import type { ParkActions } from "@/hooks/use-park-actions";
import type { ThreadEntry } from "@/lib/model";
import { DECK_INDENT } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { parkItems } from "./menu-items";
import { ParkableSlot } from "./park-buttons";
import { PlaceLine } from "./place-line";
import { StatusOrAge } from "./status-mark";
import { ThreadLink, type OpenThread } from "./thread-link";

/** A captain's worker: the card without its project line, indented to the captain's name. */
export function WorkerCard({
  entry,
  active,
  parkActions,
  onOpen,
}: {
  entry: ThreadEntry;
  active: boolean;
  parkActions: ParkActions;
  onOpen: OpenThread;
}) {
  return (
    <li className="list-none">
      <ThreadLink
        thread={entry.thread}
        active={active}
        inline={parkItems(entry, parkActions)}
        onOpen={onOpen}
        className={cn("py-2 pr-2.5", DECK_INDENT)}
      >
        {({ title, shortcut }) => (
          <>
            <div className="pointer-events-none relative flex h-5 items-center gap-1.5">
              {title}
              <ParkableSlot entry={entry} actions={parkActions}>
                {shortcut ?? (
                  <StatusOrAge
                    status={entry.status}
                    activityAt={entry.activityAt}
                  />
                )}
              </ParkableSlot>
            </div>
            <PlaceLine thread={entry.thread} />
          </>
        )}
      </ThreadLink>
    </li>
  );
}
