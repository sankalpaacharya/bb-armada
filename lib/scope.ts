import type { PluginSidebarProject } from "@get-bb/plugin-sdk/app";

import type { ThreadEntry } from "./model";

/** The projects whose threads show; none chosen shows every project. */
export type ThreadScope = readonly string[];

export const ALL_PROJECTS: ThreadScope = [];

/** The chosen projects that still exist, in picker order. */
export function resolveScope(
  stored: ThreadScope,
  projects: readonly PluginSidebarProject[],
): ThreadScope {
  const chosen = new Set(stored);
  return projects
    .filter((project) => chosen.has(project.id))
    .map((project) => project.id);
}

export function scopeThreads<Entry extends ThreadEntry>(
  entries: readonly Entry[],
  scope: ThreadScope,
): readonly Entry[] {
  if (scope.length === 0) return entries;
  const chosen = new Set(scope);
  return entries.filter((entry) => chosen.has(entry.thread.projectId));
}

/** The project added to or taken out of the scope. */
export function toggleScope(scope: ThreadScope, projectId: string): ThreadScope {
  return scope.includes(projectId)
    ? scope.filter((id) => id !== projectId)
    : [...scope, projectId];
}

/** Reads a stored scope, including the single project id or null stored before more than one could be chosen. */
export function parseScope(raw: string): ThreadScope | undefined {
  const value: unknown = JSON.parse(raw);
  if (value === null) return ALL_PROJECTS;
  if (typeof value === "string") return [value];
  return Array.isArray(value) &&
    value.every((id): id is string => typeof id === "string")
    ? value
    : undefined;
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
