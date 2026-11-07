import type { PluginSidebarProject, PluginSidebarThread } from "@get-bb/plugin-sdk/app";

import type { CaptainRecord, CaptainRegistry } from "./captains";
import { laneOf, strongerLane, type Lane } from "./status";

export type ThreadEntry = {
  thread: PluginSidebarThread;
  lane: Lane | null;
  activityAt: number;
};

export type CaptainEntry = {
  record: CaptainRecord;
  thread: PluginSidebarThread;
  workers: PluginSidebarThread[];
  lane: Lane | null;
  counts: { attention: number; working: number };
};

export type ProjectGroup = {
  project: PluginSidebarProject;
  threads: ThreadEntry[];
  lane: Lane | null;
};

export type ArmadaModel = { captains: CaptainEntry[]; groups: ProjectGroup[] };

function parentIdOf(thread: PluginSidebarThread): string | null {
  return thread.parentThreadId ?? thread.lifecycleOwnerThreadId;
}

function byRecency(a: PluginSidebarThread, b: PluginSidebarThread): number {
  return b.updatedAt - a.updatedAt;
}

function pinOrder(a: PluginSidebarThread, b: PluginSidebarThread): number {
  if (a.pinSortKey !== null && b.pinSortKey !== null) {
    return a.pinSortKey < b.pinSortKey ? -1 : a.pinSortKey > b.pinSortKey ? 1 : 0;
  }
  if (a.pinSortKey !== null) return -1;
  if (b.pinSortKey !== null) return 1;
  return (a.pinnedAt ?? 0) - (b.pinnedAt ?? 0);
}

function entryOrder(a: ThreadEntry, b: ThreadEntry): number {
  if (a.thread.isPinned !== b.thread.isPinned) return a.thread.isPinned ? -1 : 1;
  if (a.thread.isPinned) return pinOrder(a.thread, b.thread);
  return b.activityAt - a.activityAt;
}

export function buildArmada(
  threads: readonly PluginSidebarThread[],
  projects: readonly PluginSidebarProject[],
  registry: CaptainRegistry,
): ArmadaModel {
  const visible = threads.filter((thread) => !thread.isHidden && !thread.isArchived);
  const byId = new Map(visible.map((thread) => [thread.id, thread]));
  const childrenOf = new Map<string, PluginSidebarThread[]>();
  for (const thread of visible) {
    const parentId = parentIdOf(thread);
    if (parentId === null || !byId.has(parentId)) continue;
    const siblings = childrenOf.get(parentId) ?? [];
    siblings.push(thread);
    childrenOf.set(parentId, siblings);
  }

  const captainThreads = visible.filter((thread) => Object.hasOwn(registry.captains, thread.id));
  const captainIds = new Set(captainThreads.map((thread) => thread.id));

  const subtreeOf = (rootId: string, stopAtCaptains: boolean): PluginSidebarThread[] => {
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
      for (const worker of workers) owned.add(worker.id);
      const counts = { attention: 0, working: 0 };
      let lane = laneOf(thread);
      for (const worker of workers) {
        const workerLane = laneOf(worker);
        lane = strongerLane(lane, workerLane);
        if (workerLane === "attention") counts.attention += 1;
        if (workerLane === "working") counts.working += 1;
      }
      return { record, thread, workers, lane, counts };
    })
    .sort(
      (a, b) =>
        a.record.createdAt.localeCompare(b.record.createdAt) || a.record.threadId.localeCompare(b.record.threadId),
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

  const entries = new Map<string, ThreadEntry>();
  for (const thread of visible) {
    if (owned.has(thread.id)) continue;
    const root = rootOf(thread);
    const entry = entries.get(root.id) ?? { thread: root, lane: null, activityAt: 0 };
    entry.lane = strongerLane(entry.lane, laneOf(thread));
    entry.activityAt = Math.max(entry.activityAt, thread.updatedAt);
    entries.set(root.id, entry);
  }

  const projectById = new Map(projects.map((project) => [project.id, project]));
  const grouped = new Map<string, ThreadEntry[]>();
  for (const entry of entries.values()) {
    const bucket = grouped.get(entry.thread.projectId) ?? [];
    bucket.push(entry);
    grouped.set(entry.thread.projectId, bucket);
  }

  const groups = [...grouped].map(([projectId, bucket]): ProjectGroup => {
    const project = projectById.get(projectId) ?? {
      id: projectId,
      name: "Other",
      isPersonal: false,
      href: "/",
      settingsHref: "/",
    };
    const sorted = bucket.sort(entryOrder);
    return {
      project,
      threads: sorted,
      lane: sorted.reduce<Lane | null>((lane, entry) => strongerLane(lane, entry.lane), null),
    };
  });
  const latest = (group: ProjectGroup) => Math.max(...group.threads.map((entry) => entry.activityAt));
  groups.sort((a, b) => latest(b) - latest(a));

  return { captains, groups };
}
