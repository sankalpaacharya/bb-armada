import type {
  PluginSidebarProject,
  PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";

import type { CaptainRecord } from "./captains";
import { statusOf, strongerStatus, type Status } from "./status";

type Fold = {
  status: Status | null;
  activityAt: number;
  latestAttentionAt: number;
};

export type ThreadEntry = Fold & {
  thread: PluginSidebarThread;
  projectName: string | null;
  /** Root cards can become captains; a captain's workers cannot. */
  adoptable: boolean;
};

export type CaptainEntry = Fold & {
  record: CaptainRecord;
  thread: PluginSidebarThread;
  workers: ThreadEntry[];
};

export type ArmadaModel = { captains: CaptainEntry[]; threads: ThreadEntry[] };

function parentIdOf(thread: PluginSidebarThread): string | null {
  return thread.parentThreadId ?? thread.lifecycleOwnerThreadId;
}

function fold(threads: readonly PluginSidebarThread[]): Fold {
  let status: Status | null = null;
  let activityAt = 0;
  let latestAttentionAt = 0;
  for (const thread of threads) {
    status = strongerStatus(status, statusOf(thread));
    activityAt = Math.max(activityAt, thread.updatedAt);
    latestAttentionAt = Math.max(latestAttentionAt, thread.latestAttentionAt);
  }
  return { status, activityAt, latestAttentionAt };
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
  return b.activityAt - a.activityAt;
}

function byActivity(a: Fold, b: Fold): number {
  return b.activityAt - a.activityAt;
}

export function buildArmada(
  threads: readonly PluginSidebarThread[],
  projects: readonly PluginSidebarProject[],
  records: readonly CaptainRecord[],
): ArmadaModel {
  const visible = threads.filter(
    (thread) => !thread.isHidden && !thread.isArchived,
  );
  const byId = new Map(visible.map((thread) => [thread.id, thread]));
  const projectNames = new Map(
    projects.map((project) => [project.id, project.name]),
  );
  const childrenOf = new Map<string, PluginSidebarThread[]>();
  for (const thread of visible) {
    const parentId = parentIdOf(thread);
    if (parentId === null || !byId.has(parentId)) continue;
    const siblings = childrenOf.get(parentId) ?? [];
    siblings.push(thread);
    childrenOf.set(parentId, siblings);
  }

  const captainRecords = records.flatMap((record) => {
    const thread = byId.get(record.threadId);
    return thread === undefined ? [] : [{ record, thread }];
  });
  const captainIds = new Set(captainRecords.map(({ thread }) => thread.id));

  /** Every descendant, stopping at captains, which own their own subtree. */
  const subtreeOf = (rootId: string): PluginSidebarThread[] => {
    const found: PluginSidebarThread[] = [];
    const seen = new Set([rootId]);
    const pending = [rootId];
    for (let index = 0; index < pending.length; index += 1) {
      for (const child of childrenOf.get(pending[index]) ?? []) {
        if (seen.has(child.id) || captainIds.has(child.id)) continue;
        seen.add(child.id);
        found.push(child);
        pending.push(child.id);
      }
    }
    return found;
  };

  const entryOf = (thread: PluginSidebarThread, adoptable: boolean): ThreadEntry => ({
    thread,
    projectName: projectNames.get(thread.projectId) ?? null,
    adoptable,
    ...fold([thread, ...subtreeOf(thread.id)]),
  });

  const owned = new Set(captainIds);
  const captains = captainRecords
    .map(({ record, thread }): CaptainEntry => {
      const subtree = subtreeOf(thread.id);
      for (const member of subtree) owned.add(member.id);
      const workers = (childrenOf.get(thread.id) ?? [])
        .filter((child) => !captainIds.has(child.id))
        .map((child) => entryOf(child, false))
        .sort(byActivity);
      return { record, thread, workers, ...fold([thread, ...subtree]) };
    })
    .sort(
      (a, b) =>
        a.record.createdAt.localeCompare(b.record.createdAt) ||
        a.record.threadId.localeCompare(b.record.threadId),
    );

  const rootOf = (thread: PluginSidebarThread): PluginSidebarThread => {
    let current = thread;
    const seen = new Set([current.id]);
    for (;;) {
      const parentId = parentIdOf(current);
      const parent = parentId === null ? undefined : byId.get(parentId);
      if (parent === undefined || seen.has(parent.id)) return current;
      seen.add(parent.id);
      current = parent;
    }
  };

  const roots = new Map<string, PluginSidebarThread>();
  for (const thread of visible) {
    if (owned.has(thread.id)) continue;
    const root = rootOf(thread);
    roots.set(root.id, root);
  }
  const entries = [...roots.values()].map((root) => entryOf(root, true));

  return { captains, threads: entries.sort(entryOrder) };
}
