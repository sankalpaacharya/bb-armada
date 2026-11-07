import type { PluginThreadActionsInlineItem } from "@get-bb/plugin-sdk/app";

import type { ParkActions } from "@/hooks/use-park-actions";
import { useNow } from "@/lib/clock";
import { tomorrowMorning } from "@/lib/lifecycle";
import type { ThreadEntry } from "@/lib/model";
import { rowHint } from "@/lib/place";
import { formatAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import { CaptainTile } from "./captain-tile";
import { RowActions } from "./row-actions";
import { PlaceLine } from "./place-line";
import { PullRequestNumber } from "./pull-request-number";
import { StatusGlyph } from "./status-mark";
import { ThreadLink, type OpenThread } from "./thread-link";

/**
 * The leading mark: live status first, since that is what a glance looks
 * for; at rest, the captain that launched it, else a quiet dot. The captain stays named for screen
 * readers either way.
 */
function LeadMark({ entry }: { entry: ThreadEntry }) {
  const captain = entry.captain;
  const visual =
    entry.status !== null ? (
      <StatusGlyph status={entry.status} />
    ) : captain !== null ? (
      <CaptainTile avatar={captain.avatar} size="badge" />
    ) : (
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full bg-muted-foreground/40"
      />
    );
  return (
    <span className="flex items-center">
      {captain === null ? null : (
        <span className="sr-only">Launched by {captain.name}</span>
      )}
      {visual}
    </span>
  );
}

/**
 * A thread as one line: status or origin, the title, and the PR number when
 * there is one. The tooltip carries where it runs and its age, and the open
 * thread shows where it runs below.
 */
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
  const now = useNow();
  const environmentId = entry.thread.environment?.id ?? null;
  const project =
    showProject && entry.projectName !== entry.captain?.name
      ? entry.projectName
      : null;
  const threadId = entry.thread.id;
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
        hint={rowHint(entry.thread, project, formatAgo(entry.activityAt, now))}
        className="px-2"
      >
        {({ title, shortcut }) => (
          <>
            <div
              className={cn(
                "pointer-events-none relative flex h-8 items-center gap-2",
                entry.parkable &&
                  "group-focus-within/row:pr-11 group-hover/row:pr-11",
              )}
            >
              <span className="grid size-4 shrink-0 place-items-center">
                <LeadMark entry={entry} />
              </span>
              {title}
              {active ? null : (
                <span className="contents text-2xs">
                  <PullRequestNumber environmentId={environmentId} />
                </span>
              )}
              {shortcut}
              {entry.parkable ? (
                <RowActions
                  actions={[
                    {
                      label: "Snooze until tomorrow",
                      icon: "Clock",
                      run: () =>
                        parkActions.snooze(
                          threadId,
                          tomorrowMorning(new Date()),
                        ),
                    },
                    {
                      label: "Settle",
                      icon: "Check",
                      run: () => parkActions.settle(threadId),
                    },
                  ]}
                />
              ) : null}
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
