import type { PluginSidebarProject } from "@get-bb/plugin-sdk/app";

import type { ThreadEntry } from "./model";
import { isLive, strongerStatus, type Status } from "./status";

/** A project id, or null for every project. */
export type ThreadScope = string | null;

export function resolveScope(
  stored: ThreadScope,
  projects: readonly PluginSidebarProject[],
): ThreadScope {
  return stored !== null && projects.some((project) => project.id === stored)
    ? stored
    : null;
}

export function scopeThreads<Entry extends ThreadEntry>(
  entries: readonly Entry[],
  scope: ThreadScope,
): readonly Entry[] {
  return scope === null
    ? entries
    : entries.filter((entry) => entry.thread.projectId === scope);
}

export function parseScope(raw: string): ThreadScope | undefined {
  const value: unknown = JSON.parse(raw);
  return value === null || typeof value === "string" ? value : undefined;
}

export function pickableProjects(
  projects: readonly PluginSidebarProject[],
): PluginSidebarProject[] {
  return [
    ...projects.filter((project) => !project.isPersonal),
    ...projects.filter((project) => project.isPersonal),
  ];
}

export function countByProject(
  entries: readonly ThreadEntry[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const id = entry.thread.projectId;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export type ProjectGroup = {
  projectId: string;
  name: string;
  entries: readonly ThreadEntry[];
  collapsed: boolean;
  /** The most urgent live status among its threads, which a collapsed header shows. */
  status: Status | null;
};

/** One project's threads as a flat list; every project's under a header per project. */
export type ThreadLayout =
  | { kind: "flat"; entries: readonly ThreadEntry[] }
  | { kind: "grouped"; groups: readonly ProjectGroup[] };

const newestCreated = (group: ProjectGroup): number =>
  Math.max(...group.entries.map((entry) => entry.thread.createdAt));

/**
 * Groups keep their threads in the order given and are ordered by their
 * newest thread, so a new thread lifts its project to the top.
 */
export function layoutThreads(
  entries: readonly ThreadEntry[],
  scope: ThreadScope,
  collapsed: Readonly<Record<string, boolean>>,
): ThreadLayout {
  if (scope !== null) return { kind: "flat", entries };
  const byProject = new Map<string, ThreadEntry[]>();
  for (const entry of entries) {
    const members = byProject.get(entry.thread.projectId);
    if (members === undefined) byProject.set(entry.thread.projectId, [entry]);
    else members.push(entry);
  }
  const groups = Array.from(byProject, ([projectId, members]): ProjectGroup => {
    const status = members.reduce<Status | null>(
      (strongest, entry) => strongerStatus(strongest, entry.status),
      null,
    );
    return {
      projectId,
      name: members[0]?.projectName ?? "Unknown project",
      entries: members,
      collapsed: collapsed[projectId] === true,
      status: isLive(status) ? status : null,
    };
  });
  return {
    kind: "grouped",
    groups: groups.sort(
      (a, b) =>
        newestCreated(b) - newestCreated(a) ||
        a.projectId.localeCompare(b.projectId),
    ),
  };
}
