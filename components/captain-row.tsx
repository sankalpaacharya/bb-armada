import type { ReactNode } from "react";
import type { PluginThreadActionsInlineItem } from "@get-bb/plugin-sdk/app";

import { Icon } from "@/components/ui/icon";
import type { CaptainEntry } from "@/lib/model";
import { FOCUS_RING, TILE_COLUMN } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { CaptainTile } from "./captain-tile";
import { StatusOrAge } from "./status-mark";
import { ThreadLink, type OpenThread } from "./thread-link";

/**
 * A captain as one compact line: tile, title, the workers toggle, and the
 * status or age. The workers list renders as `children` inside this item, so
 * assistive tech hears them as part of their captain.
 */
export function CaptainRow({
  entry,
  title,
  active,
  now,
  expanded,
  onToggle,
  inline,
  onOpen,
  children,
}: {
  entry: CaptainEntry;
  title: string;
  active: boolean;
  now: number;
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
        label={title}
        inline={inline}
        onOpen={onOpen}
        className="flex h-8 items-center gap-2 px-2.5"
      >
        {({ title: titleNode, shortcut }) => (
          <>
            <span
              className={cn(
                "pointer-events-none relative grid shrink-0 place-items-center",
                TILE_COLUMN,
              )}
            >
              <CaptainTile logo={entry.record.logo} color={entry.record.color} />
            </span>
            <span className="pointer-events-none relative flex min-w-0 flex-1 items-center gap-2">
              {titleNode}
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
              <span className="flex w-7 shrink-0 items-center justify-end">
                {shortcut ?? (
                  <StatusOrAge
                    status={entry.status}
                    activityAt={entry.activityAt}
                    now={now}
                    variant="compact"
                  />
                )}
              </span>
            </span>
          </>
        )}
      </ThreadLink>
      {children}
    </li>
  );
}
