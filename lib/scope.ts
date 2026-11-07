import type { PluginSidebarProject } from "@get-bb/plugin-sdk/app";

import type { ThreadEntry } from "./model";

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
