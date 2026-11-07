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

export function scopeThreads(
  entries: readonly ThreadEntry[],
  scope: ThreadScope,
): readonly ThreadEntry[] {
  return scope === null
    ? entries
    : entries.filter((entry) => entry.thread.projectId === scope);
}

export function parseScope(raw: string): ThreadScope | undefined {
  const value: unknown = JSON.parse(raw);
  return value === null || typeof value === "string" ? value : undefined;
}
