import type {
  PluginSidebarProject,
  PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";

import type { CaptainRecord, CaptainRegistry } from "./captains";
import { statusOf, strongerStatus, type Status } from "./status";

export type ThreadEntry = {
  thread: PluginSidebarThread;
  projectName: string | null;
  status: Status | null;
  activityAt: number;
};

export type CaptainEntry = {
  record: CaptainRecord;
  thread: PluginSidebarThread;
  workers: PluginSidebarThread[];
  status: Status | null;
};

export type ArmadaModel = { captains: CaptainEntry[]; threads: ThreadEntry[] };

function parentIdOf(thread: PluginSidebarThread): string | null {
  return thread.parentThreadId ?? thread.lifecycleOwnerThreadId;
}

function byRecency(a: PluginSidebarThread, b: PluginSidebarThread): number {
  return b.updatedAt - a.updatedAt;
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

export function buildArmada(
  threads: readonly PluginSidebarThread[],
  projects: readonly PluginSidebarProject[],
  registry: CaptainRegistry,
): ArmadaModel {
  const visible = threads.filter(
    (thread) => !thread.isHidden && !thread.isArchived,
  );
  const byId = new Map(visible.map((thread) => [thread.id, thread]));
  const childrenOf = new Map<string, PluginSidebarThread[]>();
  for (const thread of visible) {
    const parentId = parentIdOf(thread);
    if (parentId === null || !byId.has(parentId)) continue;
    const siblings = childrenOf.get(parentId) ?? [];
    siblings.push(thread);
    childrenOf.set(parentId, siblings);
  }

  const captainThreads = visible.filter((thread) =>
    Object.hasOwn(registry.captains, thread.id),
  );
  const captainIds = new Set(captainThreads.map((thread) => thread.id));

  const subtreeOf = (
    rootId: string,
    stopAtCaptains: boolean,
  ): PluginSidebarThread[] => {
    const found: PluginSidebarThread[] = [];
    const seen = new Set([rootId]);
    const pending = [rootId];
    for (let index = 0; index < pending.length; index += 1) {
      for (const child of childrenOf.get(pending[index]) ?? []) {
        if (seen.has(child.id)) continue;
        seen.add(child.id);
        if (stopAtCaptains && captainIds.has(child.id)) continue;
        found.push(child);
        pending.push(child.id);
      }
    }
    return found;
  };

  const owned = new Set(captainIds);
  const captains = captainThreads
    .map((thread): CaptainEntry => {
      const record = registry.captains[thread.id];
      const workers = subtreeOf(record.threadId, true).sort(byRecency);
      let status = statusOf(thread);
      for (const worker of workers) {
        owned.add(worker.id);
        status = strongerStatus(status, statusOf(worker));
      }
      return { record, thread, workers, status };
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

  const projectNames = new Map(
    projects.map((project) => [project.id, project.name]),
  );
  const entries = new Map<string, ThreadEntry>();
  for (const thread of visible) {
    if (owned.has(thread.id)) continue;
    const root = rootOf(thread);
    const entry = entries.get(root.id) ?? {
      thread: root,
      projectName: projectNames.get(root.projectId) ?? null,
      status: null,
      activityAt: 0,
    };
    entry.status = strongerStatus(entry.status, statusOf(thread));
    entry.activityAt = Math.max(entry.activityAt, thread.updatedAt);
    entries.set(root.id, entry);
  }

  return { captains, threads: [...entries.values()].sort(entryOrder) };
}

export function pickableProjects(
  projects: readonly PluginSidebarProject[],
): PluginSidebarProject[] {
  return [
    ...projects.filter((project) => !project.isPersonal),
    ...projects.filter((project) => project.isPersonal),
  ];
}
