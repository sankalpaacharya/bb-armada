import type { PluginThreadActionsInlineItem } from "@get-bb/plugin-sdk/app";

import type { ParkActions } from "@/hooks/use-park-actions";
import type { ThreadEntry } from "@/lib/model";
import { cn } from "@/lib/utils";
import { RowActions } from "./row-actions";
import { PlaceLine } from "./place-line";
import { ProjectLogo } from "./project-logo";
import { StatusGlyph } from "./status-mark";
import { ThreadLink, type OpenThread } from "./thread-link";

/** The leading mark: the project's logo, else a quiet dot. Status sits at the row's right end. */
function LeadMark({ entry }: { entry: ThreadEntry }) {
  return entry.projectLogo !== null ? (
    <ProjectLogo src={entry.projectLogo} />
  ) : (
    <span
      aria-hidden="true"
      className="size-1.5 rounded-full bg-muted-foreground/40"
    />
  );
}

/**
 * A thread as its title, with its project's mark before it, over a line with
 * its project, where it runs, its PR, its harness and its status.
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
  const project = showProject ? entry.projectName : null;
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
        className="px-2"
      >
        {({ title, shortcut }) => (
          <>
            <div
              className={cn(
                "pointer-events-none relative flex h-8 items-center gap-2",
                entry.parkable &&
                  "group-focus-within/row:pr-6 group-hover/row:pr-6",
              )}
            >
              <span className="grid size-4 shrink-0 place-items-center">
                <LeadMark entry={entry} />
              </span>
              {title}
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
              className="pointer-events-none relative -mt-1 mb-1 pr-0"
              trailing={
                entry.status === null ? undefined : (
                  <span className="grid h-4 min-w-4 shrink-0 place-items-center">
                    <StatusGlyph status={entry.status} />
                  </span>
                )
              }
            />
          </>
        )}
      </ThreadLink>
    </li>
  );
}
