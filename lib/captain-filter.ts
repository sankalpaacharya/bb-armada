import { z } from "zod";

import type { CaptainEntry } from "./model";

/** Selected project ids; empty means every project. */
export type CaptainFilter = readonly string[];
export const ALL_CAPTAINS: CaptainFilter = [];

const captainFilterSchema = z.union([
  z.array(z.string()),
  // Stored before multi-select: a single project or all.
  z.object({ kind: z.literal("all") }).transform(() => []),
  z.object({ kind: z.literal("project"), projectId: z.string() })
    .transform(({ projectId }) => [projectId]),
]);

export function parseCaptainFilter(raw: string): CaptainFilter | undefined {
  const result = captainFilterSchema.safeParse(JSON.parse(raw));
  return result.success ? result.data : undefined;
}

/** Drops projects without captains, and collapses a selection of every project to all. */
export function resolveCaptainFilter(
  captains: readonly CaptainEntry[],
  filter: CaptainFilter,
): CaptainFilter {
  const present = new Set(captains.map((entry) => entry.thread.projectId));
  const selected = filter.filter((projectId) => present.has(projectId));
  return selected.length === present.size ? ALL_CAPTAINS : selected;
}

export function toggleCaptainProject(filter: CaptainFilter, projectId: string): CaptainFilter {
  return filter.includes(projectId)
    ? filter.filter((id) => id !== projectId)
    : [...filter, projectId];
}

export function filterCaptains(
  captains: readonly CaptainEntry[],
  filter: CaptainFilter,
): readonly CaptainEntry[] {
  if (filter.length === 0) return captains;
  return captains.filter((entry) => filter.includes(entry.thread.projectId));
}
