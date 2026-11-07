import type {
  PluginSidebarProject,
  PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";

import type { Avatar, CaptainRecord } from "./captains";
import { threadForest } from "./forest";
import {
  isExpired,
  lastActivityOf,
  resolveShelf,
  type Park,
  type ParkRecord,
  type Settle,
  type Shelf,
  type Snooze,
} from "./lifecycle";
import {
  STATUS,
  signalsOf,
  statusOf,
  strongerStatus,
  type Status,
} from "./status";

type Fold = {
  /** The most urgent status anywhere in the folded threads. */
  status: Status | null;
  /**
   * Whether every signal of every folded thread allows parking. This is not
   * a property of `status`: a failure outranks work still running elsewhere.
   */
  parkable: boolean;
  activityAt: number;
  latestAttentionAt: number;
  /** The newest creation, change or attention in the tree, which ages a card into Inactive. */
  lastActivityAt: number;
};

/** The captain a card was launched by, as its card shows it. */
export type CaptainBadge = { threadId: string; name: string; avatar: Avatar };

export type ThreadEntry = Fold & {
  thread: PluginSidebarThread;
  projectName: string | null;
  /** The nearest captain above this card, or null for a card of its own. */
  captain: CaptainBadge | null;
  /** A card of its own can become a captain; a captain's worker cannot. */
  adoptable: boolean;
  park: Park | null;
  shelf: Shelf;
};

export type ParkedEntry<Kind extends Park> = ThreadEntry & { park: Kind };

export type CaptainCounts = {
  working: number;
  needsYou: number;
  failed: number;
};

export type CaptainEntry = Fold & {
  record: CaptainRecord;
  thread: PluginSidebarThread;
  /** Threads in the captain's tree that are working, that need you, and that failed. */
  counts: CaptainCounts;
};

export type ArmadaModel = {
  captains: CaptainEntry[];
  threads: ThreadEntry[];
  inactive: ThreadEntry[];
  snoozed: ParkedEntry<Snooze>[];
  settled: ParkedEntry<Settle>[];
  /** Threads whose stored park can never apply again, to delete. */
  expiredParks: string[];
};

function fold(threads: readonly PluginSidebarThread[]): Fold {
  let status: Status | null = null;
  let parkable = true;
  let activityAt = 0;
  let latestAttentionAt = 0;
  let lastActivityAt = 0;
  for (const thread of threads) {
    for (const signal of signalsOf(thread)) {
      status = strongerStatus(status, signal);
      parkable &&= STATUS[signal].parkable;
    }
    activityAt = Math.max(activityAt, thread.updatedAt);
    latestAttentionAt = Math.max(latestAttentionAt, thread.latestAttentionAt);
    lastActivityAt = Math.max(lastActivityAt, lastActivityOf(thread));
  }
  return { status, parkable, activityAt, latestAttentionAt, lastActivityAt };
}

function pinOrder(a: PluginSidebarThread, b: PluginSidebarThread): number {
  if (a.pinSortKey !== null && b.pinSortKey !== null) {
    return a.pinSortKey < b.pinSortKey
      ? -1
      : a.pinSortKey > b.pinSortKey
        ? 1
        : 0;
  }
  if (a.pinSortKey !== null) return -1;
  if (b.pinSortKey !== null) return 1;
  return (a.pinnedAt ?? 0) - (b.pinnedAt ?? 0);
}

function entryOrder(a: ThreadEntry, b: ThreadEntry): number {
  if (a.thread.isPinned !== b.thread.isPinned)
    return a.thread.isPinned ? -1 : 1;
  if (a.thread.isPinned) return pinOrder(a.thread, b.thread);
  return (
    b.thread.createdAt - a.thread.createdAt ||
    a.thread.id.localeCompare(b.thread.id)
  );
}

function countStatuses(threads: readonly PluginSidebarThread[]): CaptainCounts {
  const counts = { working: 0, needsYou: 0, failed: 0 };
  for (const thread of threads) {
    const status = statusOf(thread);
    if (status === "working" || status === "queued") counts.working += 1;
    else if (status === "needs-you") counts.needsYou += 1;
    else if (status === "failed") counts.failed += 1;
  }
  return counts;
}

export function isSnoozed(entry: ThreadEntry): entry is ParkedEntry<Snooze> {
  return entry.shelf === "snoozed" && entry.park?.kind === "snoozed";
}

export function isSettled(entry: ThreadEntry): entry is ParkedEntry<Settle> {
  return entry.shelf === "settled" && entry.park?.kind === "settled";
}

export function buildArmada(
  threads: readonly PluginSidebarThread[],
  projects: readonly PluginSidebarProject[],
  records: readonly CaptainRecord[],
  parks: readonly ParkRecord[],
  supervisorIds: ReadonlySet<string>,
  now: number,
  inactiveAfterMs: number | null,
): ArmadaModel {
  const visible = threads.filter(
    (thread) => !thread.isHidden && !thread.isArchived,
  );
  const byId = new Map(visible.map((thread) => [thread.id, thread]));
  const projectNames = new Map(
    projects.map((project) => [project.id, project.name]),
  );
  const parkOf = new Map(parks.map((park) => [park.threadId, park]));

  const captainRecords = records.flatMap((record) => {
    const thread = byId.get(record.threadId);
    return thread === undefined ? [] : [{ record, thread }];
  });
  const { roots, subtreeOf, parentOf } = threadForest(
    visible,
    new Set(captainRecords.map(({ thread }) => thread.id)),
    supervisorIds,
  );

  const badgeOf = new Map(
    captainRecords.map(({ record, thread }): [string, CaptainBadge] => [
      thread.id,
      { threadId: thread.id, name: thread.displayTitle, avatar: record.avatar },
    ]),
  );
  const expiredParks: string[] = [];

  const entryOf = (thread: PluginSidebarThread): ThreadEntry => {
    const folded = fold([thread, ...subtreeOf(thread.id)]);
    const park = parkOf.get(thread.id) ?? null;
    if (park !== null && isExpired(park, folded, now))
      expiredParks.push(thread.id);
    const parentId = parentOf(thread);
    const captain =
      (parentId === null ? undefined : badgeOf.get(parentId)) ?? null;
    return {
      thread,
      projectName: projectNames.get(thread.projectId) ?? null,
      captain,
      adoptable: captain === null,
      park,
      shelf: resolveShelf(
        park ?? undefined,
        { ...folded, pinned: thread.isPinned },
        now,
        inactiveAfterMs,
      ),
      ...folded,
    };
  };

  const captains = captainRecords
    .map(({ record, thread }): CaptainEntry => {
      const tree = [thread, ...subtreeOf(thread.id)];
      return { record, thread, counts: countStatuses(tree), ...fold(tree) };
    })
    .sort(
      (a, b) =>
        a.record.createdAt.localeCompare(b.record.createdAt) ||
        a.record.threadId.localeCompare(b.record.threadId),
    );

  const entries = roots.map(entryOf);
  const on = (shelf: Shelf) => entries.filter((entry) => entry.shelf === shelf);

  return {
    captains,
    threads: on("active").sort(entryOrder),
    inactive: on("inactive").sort(
      (a, b) => b.lastActivityAt - a.lastActivityAt,
    ),
    snoozed: entries
      .filter(isSnoozed)
      .sort((a, b) => a.park.until - b.park.until),
    settled: entries.filter(isSettled).sort((a, b) => b.park.at - a.park.at),
    expiredParks,
  };
}
