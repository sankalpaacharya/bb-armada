import type { ThreadEntry } from "@/lib/model";
import { PlaceLine } from "./place-line";
import { StatusOrAge } from "./status-mark";
import { ThreadLink, type OpenThread } from "./thread-link";

/** A captain's worker: the card without its project line, indented under the captain. */
export function WorkerCard({
  entry,
  active,
  now,
  onOpen,
}: {
  entry: ThreadEntry;
  active: boolean;
  now: number;
  onOpen: OpenThread;
}) {
  return (
    <li className="list-none">
      <ThreadLink
        thread={entry.thread}
        active={active}
        onOpen={onOpen}
        className="py-2 pr-2.5 pl-9"
      >
        {({ title, shortcut }) => (
          <>
            <div className="pointer-events-none relative flex h-5 items-center gap-1.5">
              {title}
              {shortcut ?? (
                <StatusOrAge
                  status={entry.status}
                  activityAt={entry.activityAt}
                  now={now}
                  variant="card"
                />
              )}
            </div>
            <PlaceLine thread={entry.thread} />
          </>
        )}
      </ThreadLink>
    </li>
  );
}
