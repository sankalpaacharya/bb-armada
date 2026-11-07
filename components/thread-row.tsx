import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import {
  ThreadTitle,
  experimental_ThreadActionsContextMenu as ThreadActionsContextMenu,
  experimental_ThreadRowMetadata as ThreadRowMetadata,
  experimental_useSidebarThreadSplit,
  useSidebarThreadShortcut,
  type PluginSidebarThread,
  type PluginThreadActionsInlineItem,
} from "@get-bb/plugin-sdk/app";

import { Icon } from "@/components/ui/icon";
import { toActionTarget } from "@/lib/action-target";
import type { Lane } from "@/lib/status";
import { formatAge } from "@/lib/time";
import { cn } from "@/lib/utils";
import { LaneGlyph } from "./lane-glyph";
import { RenameInput } from "./rename-input";

export type RowKind = "captain" | "worker" | "thread";

export type ThreadRowProps = {
  thread: PluginSidebarThread;
  kind: RowKind;
  lane: Lane | null;
  activityAt: number;
  now: number;
  active: boolean;
  before?: ReactNode;
  tile?: ReactNode;
  detail?: ReactNode;
  inline?: readonly PluginThreadActionsInlineItem[];
  onOpen: (threadId: string, split: boolean) => void;
};

const NO_INLINE: readonly PluginThreadActionsInlineItem[] = [];

function Trailing({
  thread,
  kind,
  lane,
  activityAt,
  now,
}: Pick<ThreadRowProps, "thread" | "kind" | "lane" | "activityAt" | "now">) {
  const shortcut = useSidebarThreadShortcut(thread.id);
  if (shortcut !== null) {
    return (
      <kbd className="shrink-0 rounded border border-sidebar-border px-1 font-sans text-[10px] leading-4 text-muted-foreground">
        {shortcut.label}
      </kbd>
    );
  }
  if (kind === "captain" && lane !== null) return <LaneGlyph lane={lane} />;
  return (
    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
      {formatAge(activityAt, now)}
    </span>
  );
}

export function ThreadRow({
  thread,
  kind,
  lane,
  activityAt,
  now,
  active,
  before,
  tile,
  detail,
  inline = NO_INLINE,
  onOpen,
}: ThreadRowProps) {
  const { splitProps } = experimental_useSidebarThreadSplit(thread.id);
  const shortcut = useSidebarThreadShortcut(thread.id);
  const [renaming, setRenaming] = useState(false);
  const target = useMemo(() => toActionTarget(thread), [thread]);
  const captain = kind === "captain";

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onOpen(thread.id, event.metaKey || event.ctrlKey);
  };

  const leading = captain ? (
    tile
  ) : (
    <span className="grid size-3 shrink-0 place-items-center">
      <LaneGlyph lane={lane} />
    </span>
  );
  const rowHeight = captain ? "min-h-11 py-1" : "min-h-8 py-1";

  return (
    <li
      data-armada-row={thread.id}
      data-kind={kind}
      className="group/row relative flex list-none items-center"
    >
      {before}
      {renaming ? (
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-sidebar-accent px-2",
            rowHeight,
          )}
        >
          {leading}
          <RenameInput thread={thread} onDone={() => setRenaming(false)} />
        </div>
      ) : (
        <div className="min-w-0 flex-1">
          <ThreadActionsContextMenu
            thread={target}
            inline={inline}
            requestRename={() => setRenaming(true)}
          >
            <a
              href={thread.href}
              data-sidebar-thread-shortcut-target=""
              data-sidebar-thread-id={thread.id}
              data-armada-anchor=""
              aria-current={active ? "page" : undefined}
              aria-keyshortcuts={shortcut?.ariaKeyshortcuts}
              draggable={false}
              onClick={onClick}
              onPointerDown={splitProps.onPointerDown}
              onDoubleClick={(event) => {
                event.preventDefault();
                setRenaming(true);
              }}
              className={cn(
                "flex w-full select-none items-center gap-2 rounded-lg px-2 text-[13px] text-sidebar-foreground no-underline outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                rowHeight,
                active
                  ? "bg-sidebar-accent text-foreground"
                  : "group-hover/row:bg-sidebar-accent/60",
              )}
            >
              {leading}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate",
                      thread.isUnread || captain
                        ? "font-semibold text-foreground"
                        : "font-medium",
                    )}
                  >
                    <ThreadTitle threadId={thread.id} />
                  </span>
                  {thread.isPinned ? (
                    <Icon
                      name="Pin"
                      aria-label="Pinned"
                      className="size-3 shrink-0 text-muted-foreground"
                    />
                  ) : null}
                  <Trailing
                    thread={thread}
                    kind={kind}
                    lane={lane}
                    activityAt={activityAt}
                    now={now}
                  />
                </span>
                {captain ? detail : <ThreadRowMetadata thread={thread} />}
              </span>
            </a>
          </ThreadActionsContextMenu>
        </div>
      )}
    </li>
  );
}
