import type { PluginThreadActionsInlineItem } from "@get-bb/plugin-sdk/app";

import type { ParkActions } from "@/hooks/use-park-actions";
import type { ThreadEntry } from "@/lib/model";
import { Age } from "./age";
import { CaptainTile } from "./captain-tile";
import { ParkableSlot } from "./park-buttons";
import { PlaceLine, ProviderGlyph } from "./place-line";
import { PullRequestNumber } from "./pull-request-number";
import { StatusGlyph } from "./status-mark";
import { ThreadLink, type OpenThread } from "./thread-link";

/** Who runs the thread: the captain that launched it, else its harness. */
function Origin({ entry }: { entry: ThreadEntry }) {
  if (entry.captain === null) {
    return <ProviderGlyph providerId={entry.thread.providerId} />;
  }
  return (
    <span className="flex items-center">
      <span className="sr-only">Launched by {entry.captain.name}</span>
      <CaptainTile avatar={entry.captain.avatar} size="badge" />
    </span>
  );
}

/** A thread as one line, who on the left and state on the right; the open thread also shows where it runs. */
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
  const environmentId = entry.thread.environment?.id ?? null;
  const project =
    showProject && entry.projectName !== entry.captain?.name
      ? entry.projectName
      : null;
  return (
    <li className="list-none">
      <ThreadLink
        thread={entry.thread}
        active={active}
        inline={inline}
        onOpen={onOpen}
        titleClassName={
          entry.thread.isUnread ? undefined : "text-foreground/85"
        }
        className="px-2"
      >
        {({ title, shortcut }) => (
          <>
            <div className="pointer-events-none relative flex h-8 items-center gap-2">
              <span className="grid size-4 shrink-0 place-items-center">
                <Origin entry={entry} />
              </span>
              {title}
              <ParkableSlot entry={entry} actions={parkActions}>
                {active ? null : (
                  <span className="pointer-events-auto shrink-0 text-2xs">
                    <PullRequestNumber environmentId={environmentId} />
                  </span>
                )}
                {shortcut ??
                  (entry.status === null ? (
                    <Age at={entry.activityAt} />
                  ) : (
                    <StatusGlyph status={entry.status} />
                  ))}
              </ParkableSlot>
            </div>
            {active ? (
              <div className="pointer-events-none relative -mt-1 pb-1">
                <PlaceLine thread={entry.thread} project={project} />
              </div>
            ) : null}
          </>
        )}
      </ThreadLink>
    </li>
  );
}
