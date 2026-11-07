import type { PluginThreadActionsInlineItem } from "@get-bb/plugin-sdk/app";

import type { ParkActions } from "@/hooks/use-park-actions";
import type { ThreadEntry } from "@/lib/model";
import { placeHint } from "@/lib/place";
import { Age } from "./age";
import { CaptainTile } from "./captain-tile";
import { ParkableSlot } from "./park-buttons";
import { PlaceLine } from "./place-line";
import { ProviderGlyph } from "./provider-glyph";
import { PullRequestNumber } from "./pull-request-number";
import { StatusGlyph } from "./status-mark";
import { ThreadLink, type OpenThread } from "./thread-link";

/**
 * The leading mark: live status first, since that is what a glance looks
 * for; at rest, who runs the thread, its captain or else its harness. The
 * captain stays named for screen readers either way.
 */
function LeadMark({ entry }: { entry: ThreadEntry }) {
  const captain = entry.captain;
  const visual =
    entry.status !== null ? (
      <StatusGlyph status={entry.status} />
    ) : captain !== null ? (
      <CaptainTile avatar={captain.avatar} size="badge" />
    ) : (
      <ProviderGlyph providerId={entry.thread.providerId} />
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

/** A thread as one line: status or origin on the left, PR and age on the right; the open thread also shows where it runs. */
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
        hint={placeHint(entry.thread, project)}
        className="px-2"
      >
        {({ title, shortcut }) => (
          <>
            <div className="pointer-events-none relative flex h-8 items-center gap-2">
              <span className="grid size-4 shrink-0 place-items-center">
                <LeadMark entry={entry} />
              </span>
              {title}
              <ParkableSlot entry={entry} actions={parkActions}>
                {active ? null : (
                  <span className="pointer-events-auto shrink-0 text-2xs">
                    <PullRequestNumber environmentId={environmentId} />
                  </span>
                )}
                {shortcut ?? <Age at={entry.activityAt} />}
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
