import type { ReactNode } from "react";
import type { PluginThreadActionsInlineItem } from "@get-bb/plugin-sdk/app";

import type { ParkActions } from "@/hooks/use-park-actions";
import type { CaptainBadge, ThreadEntry } from "@/lib/model";
import { CaptainTile } from "./captain-tile";
import { ParkableSlot } from "./park-buttons";
import { PlaceLine } from "./place-line";
import { StatusOrAge } from "./status-mark";
import { ThreadLink, type OpenThread } from "./thread-link";

/**
 * Where a card comes from: the captain that launched it, then its project.
 * A project named like the captain is said once.
 */
function Origin({
  captain,
  project,
}: {
  captain: CaptainBadge | null;
  project: string | null;
}) {
  const shownProject = project === captain?.name ? null : project;
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5 text-2xs font-medium text-muted-foreground/80">
      {captain === null ? null : (
        <>
          <CaptainTile avatar={captain.avatar} size="badge" />
          <span className="min-w-0 truncate">
            <span className="sr-only">Launched by </span>
            {captain.name}
          </span>
          {shownProject === null ? null : (
            <span aria-hidden="true" className="shrink-0">
              ·
            </span>
          )}
        </>
      )}
      {shownProject === null ? null : (
        <span className="min-w-0 truncate">{shownProject}</span>
      )}
    </span>
  );
}

/** A card as three lines: origin and status, title, place. */
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
  const hasOrigin = showProject || entry.captain !== null;
  const trailing = (shortcut: ReactNode | null) => (
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
            {hasOrigin ? (
              <div className="pointer-events-none relative flex h-5 items-center gap-1.5">
                <Origin
                  captain={entry.captain}
                  project={showProject ? entry.projectName : null}
                />
                {trailing(shortcut)}
              </div>
            ) : null}
            <div className="pointer-events-none relative mt-0.5 flex h-5 items-center gap-1.5 first:mt-0">
              {title}
              {hasOrigin ? null : trailing(shortcut)}
            </div>
            <PlaceLine thread={entry.thread} />
          </>
        )}
      </ThreadLink>
    </li>
  );
}
