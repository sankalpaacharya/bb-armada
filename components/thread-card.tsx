import type { PluginThreadActionsInlineItem } from "@get-bb/plugin-sdk/app";

import { Icon } from "@/components/ui/icon";
import type { ParkActions } from "@/hooks/use-park-actions";
import type { ThreadEntry } from "@/lib/model";
import { placeOf } from "@/lib/place";
import { Age } from "./age";
import { CaptainTile } from "./captain-tile";
import { ParkableSlot } from "./park-buttons";
import { ProviderGlyph } from "./provider-glyph";
import { PullRequestIcon } from "./pull-request-icon";
import { StatusGlyph } from "./status-mark";
import { ThreadLink, type OpenThread } from "./thread-link";

/** The live status, or a quiet dot for a thread at rest. */
function StatusDot({ entry }: { entry: ThreadEntry }) {
  if (entry.status !== null) return <StatusGlyph status={entry.status} />;
  return (
    <span
      aria-hidden="true"
      className="size-1.5 rounded-full bg-muted-foreground/40"
    />
  );
}

/** Where the thread comes from: the captain that launched it, then its project. */
function Origin({
  entry,
  showProject,
}: {
  entry: ThreadEntry;
  showProject: boolean;
}) {
  const captain = entry.captain;
  const project =
    showProject && entry.projectName !== captain?.name
      ? entry.projectName
      : null;
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5">
      {captain === null ? null : (
        <>
          <CaptainTile avatar={captain.avatar} size="badge" />
          <span className="sr-only">Launched by {captain.name}</span>
          <span aria-hidden="true" className="min-w-0 truncate">
            {captain.name}
          </span>
        </>
      )}
      {captain !== null && project !== null ? (
        <span aria-hidden="true">·</span>
      ) : null}
      {project === null ? null : (
        <span className="min-w-0 truncate">{project}</span>
      )}
    </span>
  );
}

/**
 * A thread as two fixed lines, like an IDE's agent list: status, title, pull
 * request, place and age; then where it comes from and which harness runs it.
 * Every row has the same height, so opening one never moves the list.
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
  const place = placeOf(entry.thread);
  return (
    <li className="list-none">
      <ThreadLink
        thread={entry.thread}
        active={active}
        inline={inline}
        onOpen={onOpen}
        hint={place?.label}
        titleClassName={
          entry.thread.isUnread ? undefined : "text-foreground/85"
        }
        className="px-2 py-1.5"
      >
        {({ title, shortcut }) => (
          <>
            <div className="pointer-events-none relative flex h-5 items-center gap-2">
              <span className="grid size-4 shrink-0 place-items-center">
                <StatusDot entry={entry} />
              </span>
              {title}
              <ParkableSlot entry={entry} actions={parkActions}>
                <PullRequestIcon
                  environmentId={entry.thread.environment?.id ?? null}
                />
                {place === null ? null : (
                  <Icon
                    name={place.icon}
                    aria-label={place.label}
                    className="size-3.5 shrink-0 text-muted-foreground/70"
                  />
                )}
                {shortcut ?? <Age at={entry.activityAt} />}
              </ParkableSlot>
            </div>
            <div className="pointer-events-none relative mt-0.5 flex h-4 items-center gap-2 pl-6 text-2xs text-muted-foreground">
              <Origin entry={entry} showProject={showProject} />
              <ProviderGlyph providerId={entry.thread.providerId} />
            </div>
          </>
        )}
      </ThreadLink>
    </li>
  );
}
