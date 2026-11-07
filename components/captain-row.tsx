import type { ReactNode } from "react";
import type { PluginThreadActionsInlineItem } from "@get-bb/plugin-sdk/app";

import { Icon } from "@/components/ui/icon";
import type { CaptainCounts, CaptainEntry } from "@/lib/model";
import { STATUS } from "@/lib/status";
import { FOCUS_RING } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { CaptainTile } from "./captain-tile";
import { WorkingOrAge } from "./status-mark";
import { ThreadLink, type OpenThread } from "./thread-link";

function Summary({ counts }: { counts: CaptainCounts }) {
  if (counts.working === 0 && counts.needsYou === 0)
    return <span className="text-muted-foreground">Idle</span>;
  return (
    <>
      {counts.working > 0 ? (
        <span className={STATUS.working.tone}>{counts.working} working</span>
      ) : null}
      {counts.needsYou > 0 ? (
        <span className={STATUS["needs-you"].tone}>
          {counts.needsYou} needs you
        </span>
      ) : null}
    </>
  );
}

/**
 * A captain in the deck: avatar, name over a one-line summary of its tree,
 * the workers toggle, and the grid while working or the age. The workers
 * list renders as `children` inside this item, so assistive tech hears them
 * as part of their captain.
 */
export function CaptainRow({
  entry,
  active,
  expanded,
  onToggle,
  inline,
  onOpen,
  children,
}: {
  entry: CaptainEntry;
  active: boolean;
  /** Null when the captain has no workers to show. */
  expanded: boolean | null;
  onToggle: () => void;
  inline: readonly PluginThreadActionsInlineItem[];
  onOpen: OpenThread;
  children?: ReactNode;
}) {
  const toggleLabel = expanded ? "Hide workers" : "Show workers";
  return (
    <li className="list-none">
      <ThreadLink
        thread={entry.thread}
        active={active}
        inline={inline}
        onOpen={onOpen}
        className="flex h-11 items-center gap-2 px-2.5"
        titleClassName="font-medium"
      >
        {({ title, shortcut }) => (
          <>
            <CaptainTile
              avatar={entry.record.avatar}
              className="pointer-events-none relative"
            />
            <span className="pointer-events-none relative flex min-w-0 flex-1 flex-col justify-center">
              <span className="flex items-center gap-2">
                {title}
                {expanded === null ? null : (
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-label={toggleLabel}
                    title={toggleLabel}
                    onClick={onToggle}
                    className={cn(
                      "pointer-events-auto grid size-4 shrink-0 cursor-pointer place-items-center rounded text-muted-foreground opacity-0 group-hover/row:opacity-100 hover:text-foreground focus-visible:opacity-100",
                      FOCUS_RING,
                    )}
                  >
                    <Icon
                      name="ChevronRight"
                      className={cn(
                        "size-3.5 transition-transform",
                        expanded && "rotate-90",
                      )}
                    />
                  </button>
                )}
              </span>
              <span className="flex h-4 items-center gap-1.5 text-2xs">
                <Summary counts={entry.counts} />
              </span>
            </span>
            <span className="pointer-events-none relative flex w-7 shrink-0 items-center justify-end">
              {shortcut ?? (
                <WorkingOrAge
                  status={entry.status}
                  activityAt={entry.activityAt}
                />
              )}
            </span>
          </>
        )}
      </ThreadLink>
      {children}
    </li>
  );
}
