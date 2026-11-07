import type { PluginThreadActionsInlineItem } from "@get-bb/plugin-sdk/app";

import type { ParkActions } from "@/hooks/use-park-actions";
import type { ThreadEntry } from "@/lib/model";
import { ParkableSlot } from "./park-buttons";
import { PlaceLine } from "./place-line";
import { StatusOrAge } from "./status-mark";
import { ThreadLink, type OpenThread } from "./thread-link";

/** A root thread as a three-line card: project and status, title, place. */
export function ThreadCard({
  entry,
  active,
  showProject,
  parkActions,
  inline,
  onOpen,
}: {
  entry: ThreadEntry;
  active: boolean;
  /** Off when the list is already scoped to one project. */
  showProject: boolean;
  parkActions: ParkActions;
  inline?: readonly PluginThreadActionsInlineItem[];
  onOpen: OpenThread;
}) {
  const trailing = (shortcut: React.ReactNode | null) => (
    <ParkableSlot entry={entry} actions={parkActions}>
      {shortcut ?? (
        <StatusOrAge
          status={entry.status}
          activityAt={entry.activityAt}
        />
      )}
    </ParkableSlot>
  );
  return (
    <li className="list-none">
      <ThreadLink
        thread={entry.thread}
        active={active}
        inline={inline}
        onOpen={onOpen}
        className="py-2 pr-2.5 pl-2.5"
      >
        {({ title, shortcut }) => (
          <>
            {showProject ? (
              <div className="pointer-events-none relative flex h-5 items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-2xs font-medium text-muted-foreground/80">
                  {entry.projectName}
                </span>
                {trailing(shortcut)}
              </div>
            ) : null}
            <div className="pointer-events-none relative mt-0.5 flex h-5 items-center gap-1.5 first:mt-0">
              {title}
              {showProject ? null : trailing(shortcut)}
            </div>
            <PlaceLine thread={entry.thread} />
          </>
        )}
      </ThreadLink>
    </li>
  );
}
