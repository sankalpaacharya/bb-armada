import type { ParkActions } from "@/hooks/use-park-actions";
import type { ThreadEntry } from "@/lib/model";
import { parkItems } from "./menu-items";
import { ParkableSlot } from "./park-buttons";
import { PlaceLine } from "./place-line";
import { StatusOrAge } from "./status-mark";
import { ThreadLink, type OpenThread } from "./thread-link";

/** A captain's worker: the card without its project line, indented under the captain. */
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
        className="py-2 pr-2.5 pl-9"
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
                    variant="card"
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
