import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import {
  ThreadTitle,
  experimental_ProviderIcon as ProviderIcon,
  experimental_ThreadActionsContextMenu as ThreadActionsContextMenu,
  experimental_useProviders,
  experimental_useSidebarThreadSplit,
  useSidebarThreadShortcut,
  type PluginSidebarThread,
  type PluginThreadActionsInlineItem,
} from "@get-bb/plugin-sdk/app";

import { Icon } from "@/components/ui/icon";
import { toActionTarget } from "@/lib/action-target";
import { isLive, type Status } from "@/lib/status";
import { formatAge } from "@/lib/time";
import { cn } from "@/lib/utils";
import { PullRequestNumber } from "./pull-request-number";
import { RenameInput } from "./rename-input";
import { StatusGlyph, StatusWord } from "./status-glyph";

export type RowKind = "captain" | "worker" | "thread";

export type ThreadRowProps = {
  thread: PluginSidebarThread;
  kind: RowKind;
  status: Status | null;
  activityAt: number;
  now: number;
  active: boolean;
  title?: string;
  avatar?: ReactNode;
  toggle?: ReactNode;
  /** Draws the card's project line; omit it when the project is already known. */
  project?: { name: string | null };
  inline?: readonly PluginThreadActionsInlineItem[];
  onOpen: (threadId: string, split: boolean) => void;
};

const NO_INLINE: readonly PluginThreadActionsInlineItem[] = [];

function Trailing({
  thread,
  status,
  activityAt,
  now,
  compact,
}: {
  thread: PluginSidebarThread;
  status: Status | null;
  activityAt: number;
  now: number;
  compact: boolean;
}) {
  const shortcut = useSidebarThreadShortcut(thread.id);
  if (shortcut !== null) {
    return (
      <kbd className="shrink-0 rounded border border-sidebar-border px-1 font-sans text-2xs text-muted-foreground">
        {shortcut.label}
      </kbd>
    );
  }
  if (status !== null) {
    if (!compact) return <StatusWord status={status} />;
    if (isLive(status)) return <StatusGlyph status={status} />;
  }
  return (
    <span className="shrink-0 tabular-nums text-2xs text-muted-foreground">
      {formatAge(activityAt, now)}
    </span>
  );
}

function ProviderGlyph({ providerId }: { providerId: string }) {
  const { providers } = experimental_useProviders();
  const provider = providers.find((candidate) => candidate.id === providerId);
  return (
    <span className="flex size-3.5 shrink-0 items-center justify-center opacity-60 grayscale">
      <ProviderIcon
        providerKind="agent"
        provider={provider ?? { id: providerId }}
        aria-label={provider?.displayName ?? providerId}
        className="size-3 text-muted-foreground/70"
      />
    </span>
  );
}

function ActivityCount({ label, count }: { label: string; count: number }) {
  return (
    <span
      aria-label={`${count} ${label}`}
      className="shrink-0 rounded bg-muted px-1 font-mono text-2xs text-muted-foreground"
    >
      {count}
    </span>
  );
}

function PlaceLine({ thread }: { thread: PluginSidebarThread }) {
  const environment = thread.environment;
  const branch = environment?.branchName ?? null;
  const placeIcon =
    branch !== null
      ? environment?.isWorktree === true
        ? { name: "FolderGit", label: "Worktree" }
        : { name: "GitBranch", label: "Branch" }
      : thread.host !== null
        ? { name: "Laptop", label: "Machine" }
        : null;
  return (
    <div className="pointer-events-none relative mt-0.5 flex h-4 items-center gap-1.5 text-2xs text-muted-foreground">
      {placeIcon === null ? null : (
        <Icon
          name={placeIcon.name}
          aria-label={placeIcon.label}
          className="size-3 shrink-0 text-muted-foreground"
        />
      )}
      {branch !== null ? (
        <span className="min-w-0 flex-1 truncate font-mono">{branch}</span>
      ) : thread.host !== null ? (
        <span className="min-w-0 flex-1 truncate">{thread.host.name}</span>
      ) : (
        <span className="flex-1" />
      )}
      {thread.activity.workflows > 0 ? (
        <ActivityCount label="workflows" count={thread.activity.workflows} />
      ) : null}
      {thread.activity.backgroundAgents > 0 ? (
        <ActivityCount
          label="background agents"
          count={thread.activity.backgroundAgents}
        />
      ) : null}
      <PullRequestNumber environmentId={environment?.id ?? null} />
      <ProviderGlyph providerId={thread.providerId} />
    </div>
  );
}

export function ThreadRow({
  thread,
  kind,
  status,
  activityAt,
  now,
  active,
  title,
  avatar,
  toggle,
  project,
  inline = NO_INLINE,
  onOpen,
}: ThreadRowProps) {
  const { splitProps } = experimental_useSidebarThreadSplit(thread.id);
  const shortcut = useSidebarThreadShortcut(thread.id);
  const [renaming, setRenaming] = useState(false);
  const target = useMemo(() => toActionTarget(thread), [thread]);

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onOpen(thread.id, event.metaKey || event.ctrlKey);
  };

  const anchor = (
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
        data-armada-anchor=""
        aria-label={title ?? thread.displayTitle}
        aria-current={active ? "page" : undefined}
        aria-keyshortcuts={shortcut?.ariaKeyshortcuts}
        draggable={false}
        onClick={onClick}
        onPointerDown={splitProps.onPointerDown}
        onDoubleClick={(event) => {
          event.preventDefault();
          setRenaming(true);
        }}
        className="absolute inset-0 cursor-pointer select-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </ThreadActionsContextMenu>
  );
  const titleText = renaming ? (
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
      )}
    >
      {title ?? <ThreadTitle threadId={thread.id} />}
    </span>
  );
  const trailing = (compact: boolean) => (
    <Trailing
      thread={thread}
      status={status}
      activityAt={activityAt}
      now={now}
      compact={compact}
    />
  );
  const fill = active ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60";

  return (
    <li data-armada-row={thread.id} data-kind={kind} className="list-none">
      {kind === "captain" ? (
        <div
          className={cn(
            "group/row relative flex h-8 items-center gap-2 rounded-md px-2.5 transition-colors",
            fill,
          )}
        >
          {anchor}
          <span className="pointer-events-none relative grid w-[18px] shrink-0 place-items-center">
            {avatar}
          </span>
          <span className="pointer-events-none relative flex min-w-0 flex-1 items-center gap-2">
            {titleText}
            {toggle}
            <span className="flex w-7 shrink-0 items-center justify-end">
              {trailing(true)}
            </span>
          </span>
        </div>
      ) : (
        <div
          className={cn(
            "relative rounded-md py-2 pr-2.5 transition-colors",
            kind === "worker" ? "pl-9" : "pl-2.5",
            fill,
          )}
        >
          {anchor}
          {project === undefined ? null : (
            <div className="pointer-events-none relative flex h-5 items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-2xs font-medium text-muted-foreground">
                {project.name ?? " "}
              </span>
              {trailing(false)}
            </div>
          )}
          <div
            className={cn(
              "pointer-events-none relative flex h-5 items-center gap-1.5",
              project !== undefined && "mt-0.5",
            )}
          >
            {titleText}
            {project === undefined ? trailing(false) : null}
          </div>
          <PlaceLine thread={thread} />
        </div>
      )}
    </li>
  );
}
