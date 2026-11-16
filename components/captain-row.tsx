import type { PluginThreadActionsInlineItem } from "@get-bb/plugin-sdk/app";
import type { ReactNode } from "react";

import type { CaptainCounts, CaptainEntry } from "@/lib/model";
import { STATUS } from "@/lib/status";
import { CaptainTile } from "./captain-tile";
import { WorkingGlyph } from "./status-mark";
import { ThreadLink, type OpenThread } from "./thread-link";

export function Summary({ counts }: { counts: CaptainCounts }) {
  if (counts.working === 0 && counts.needsYou === 0 && counts.failed === 0)
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
      {counts.failed > 0 ? (
        <span className={STATUS.failed.tone}>{counts.failed} failed</span>
      ) : null}
    </>
  );
}

/**
 * A captain in the deck: avatar, name over a one-line summary of its tree,
 * and the grid while working.
 */
export function CaptainRow({
  entry,
  active,
  inline,
  onOpen,
  reorderHandle,
}: {
  entry: CaptainEntry;
  active: boolean;
  inline: readonly PluginThreadActionsInlineItem[];
  onOpen: OpenThread;
  reorderHandle: ReactNode;
}) {
  return (
    <ThreadLink
      thread={entry.thread}
      active={active}
      inline={inline}
      onOpen={onOpen}
      className="flex h-11 items-center gap-2.5 px-2.5"
      titleClassName="font-medium"
    >
      {({ title, shortcut }) => (
        <>
          <CaptainTile
            avatar={entry.record.avatar}
            projectId={entry.thread.projectId}
            className="pointer-events-none relative"
          />
          <span className="pointer-events-none relative flex min-w-0 flex-1 flex-col justify-center">
            <span className="flex items-center gap-2">{title}</span>
            <span className="flex h-4 items-center gap-1.5 text-2xs">
              <Summary counts={entry.counts} />
            </span>
          </span>
          <span className="pointer-events-none relative flex shrink-0 items-center justify-end pr-1.5 empty:hidden">
            {shortcut ?? <WorkingGlyph status={entry.status} />}
          </span>
          {reorderHandle}
        </>
      )}
    </ThreadLink>
  );
}
