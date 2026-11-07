import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import {
  ThreadTitle,
  experimental_ThreadActionsContextMenu as ThreadActionsContextMenu,
  experimental_useSidebarThreadSplit,
  useSidebarThreadShortcut,
  type PluginSidebarThread,
  type PluginThreadActionsInlineItem,
} from "@get-bb/plugin-sdk/app";

import { ROW_ANCHOR } from "@/hooks/use-arrow-key-rows";
import { toActionTarget } from "@/lib/action-target";
import { FOCUS_RING, threadRowFill } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { RenameInput } from "./rename-input";

export type OpenThread = (threadId: string, split: boolean) => void;

export type ThreadLinkSlots = {
  /** The thread's title, or the rename field while renaming. */
  title: ReactNode;
  /** bb's keyboard shortcut badge for this row, when it has one. */
  shortcut: ReactNode | null;
};

const NO_INLINE: readonly PluginThreadActionsInlineItem[] = [];

/**
 * bb's row contract for one thread: a positioned box with a full-bleed anchor
 * under the layout, the context menu, split handling and inline rename. The
 * layout renders above the anchor with pointer events off, so clicks fall
 * through to it, and turns them back on for its own controls.
 */
export function ThreadLink({
  thread,
  active,
  label,
  hint,
  inline = NO_INLINE,
  onOpen,
  className,
  titleClassName,
  children,
}: {
  thread: PluginSidebarThread;
  active: boolean;
  /** Accessible name and visible title when it is not bb's own title. */
  label?: string;
  /** Tooltip with what the row leaves out, such as where the thread runs. */
  hint?: string;
  inline?: readonly PluginThreadActionsInlineItem[];
  onOpen: OpenThread;
  className?: string;
  titleClassName?: string;
  children: (slots: ThreadLinkSlots) => ReactNode;
}) {
  const { splitProps } = experimental_useSidebarThreadSplit(thread.id);
  const shortcut = useSidebarThreadShortcut(thread.id);
  const [renaming, setRenaming] = useState(false);
  const target = useMemo(() => toActionTarget(thread), [thread]);

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onOpen(thread.id, event.metaKey || event.ctrlKey);
  };

  const title = renaming ? (
    <RenameInput
      thread={thread}
      onDone={() => setRenaming(false)}
      className="pointer-events-auto h-5 py-0 text-sm"
    />
  ) : (
    <span
      className={cn(
        "min-w-0 flex-1 truncate text-sm text-foreground",
        thread.isUnread && "font-medium",
        titleClassName,
      )}
    >
      {label ?? <ThreadTitle threadId={thread.id} />}
    </span>
  );

  return (
    <div
      className={cn(
        "group/row relative rounded-md transition-colors",
        threadRowFill(active),
        className,
      )}
    >
      <ThreadActionsContextMenu
        thread={target}
        inline={inline}
        disabled={renaming}
        requestRename={() => setRenaming(true)}
      >
        <a
          href={thread.href}
          data-sidebar-thread-shortcut-target=""
          data-sidebar-thread-id={thread.id}
          {...{ [ROW_ANCHOR]: "" }}
          aria-label={label ?? thread.displayTitle}
          title={hint === "" ? undefined : hint}
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
            "absolute inset-0 cursor-pointer select-none rounded-md",
            FOCUS_RING,
          )}
        />
      </ThreadActionsContextMenu>
      {children({
        title,
        shortcut:
          shortcut === null ? null : (
            <kbd className="shrink-0 rounded border border-sidebar-border px-1 font-sans text-2xs text-muted-foreground">
              {shortcut.label}
            </kbd>
          ),
      })}
    </div>
  );
}
