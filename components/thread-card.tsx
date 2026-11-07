import type { PluginThreadActionsInlineItem } from "@get-bb/plugin-sdk/app";

import type { ParkActions } from "@/hooks/use-park-actions";
import type { ThreadEntry } from "@/lib/model";
import { STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";
import { CaptainTile } from "./captain-tile";
import { RowActions } from "./row-actions";
import { PlaceLine } from "./place-line";
import { ProjectLogo } from "./project-logo";
import { StatusGlyph } from "./status-mark";
import { ThreadLink, type OpenThread } from "./thread-link";

/**
 * The leading mark: the captain that launched it over its project's logo when
 * there are both, else whichever there is, else a quiet dot. The captain stays
 * named for screen readers. Status sits at the row's right end.
 */
function LeadMark({ entry }: { entry: ThreadEntry }) {
  const captain = entry.captain;
  const visual =
    captain !== null && entry.projectLogo !== null ? (
      <span className="relative h-3.5 w-6">
        <ProjectLogo src={entry.projectLogo} className="absolute left-0" />
        <CaptainTile
          avatar={captain.avatar}
          size="badge"
          className="absolute left-2.5 ring-[1.5px] ring-(--row-fill)"
        />
      </span>
    ) : captain !== null ? (
      <CaptainTile avatar={captain.avatar} size="badge" />
    ) : entry.projectLogo !== null ? (
      <ProjectLogo src={entry.projectLogo} />
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
 * A thread as its title, with status or origin before it, over a line with its
 * project, where it runs and its PR. The tooltip adds its age.
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
  const environmentId = entry.thread.environment?.id ?? null;
  const project =
    showProject && entry.projectName !== entry.captain?.name
      ? entry.projectName
      : null;
  const threadId = entry.thread.id;
  const badge =
    entry.status !== null && STATUS[entry.status].glyph.kind === "word";
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
            <div
              className={cn(
                "pointer-events-none relative flex h-8 items-center gap-2",
                entry.parkable &&
                  !badge &&
                  "group-focus-within/row:pr-6 group-hover/row:pr-6",
              )}
            >
              <span className="grid h-4 w-6 shrink-0 place-items-center">
                <LeadMark entry={entry} />
              </span>
              {title}
              {entry.status === null ? null : (
                <span
                  className={cn(
                    "grid h-4 min-w-4 shrink-0 place-items-center",
                    entry.parkable &&
                      "transition-opacity duration-[120ms] ease-[cubic-bezier(0.23,1,0.32,1)] group-focus-within/row:opacity-0 group-hover/row:opacity-0 motion-reduce:transition-none",
                  )}
                >
                  <StatusGlyph status={entry.status} />
                </span>
              )}
              {shortcut}
              {entry.parkable ? (
                <RowActions
                  actions={[
                    {
                      label: "Settle",
                      icon: "Check",
                      run: () => parkActions.settle(threadId),
                    },
                  ]}
                />
              ) : null}
            </div>
            <PlaceLine
              thread={entry.thread}
              project={project}
              detailed={active}
              className="pointer-events-none relative -mt-1 mb-1 pr-0 pl-8"
            />
          </>
        )}
      </ThreadLink>
    </li>
  );
}
