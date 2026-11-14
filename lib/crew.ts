import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

import { parentIdOf } from "./forest";
import type { ArmadaModel, CaptainEntry, ThreadEntry } from "./model";

export type Crew = {
  captain: CaptainEntry;
  active: ThreadEntry[];
  inactive: ThreadEntry[];
  parked: ThreadEntry[];
};

/**
 * The captain a thread belongs to: the thread itself, the nearest captain
 * above it, or else its project's captain when the project has just one.
 */
export function captainIdOf(
  model: ArmadaModel,
  threads: readonly PluginSidebarThread[],
  threadId: string,
): string | null {
  const captains = new Set(model.captains.map((entry) => entry.thread.id));
  const byId = new Map(threads.map((thread) => [thread.id, thread]));
  const seen = new Set<string>();
  let id: string | null = threadId;
  while (id !== null && !seen.has(id)) {
    if (captains.has(id)) return id;
    seen.add(id);
    const thread = byId.get(id);
    id = thread === undefined ? null : parentIdOf(thread);
  }
  const projectId = byId.get(threadId)?.projectId;
  const ofProject = model.captains.filter(
    (entry) => entry.thread.projectId === projectId,
  );
  return ofProject.length === 1 ? ofProject[0]!.thread.id : null;
}

/** A captain's workers, split the way the sidebar shelves them. */
export function crewOf(model: ArmadaModel, captainId: string): Crew | null {
  const captain = model.captains.find((entry) => entry.thread.id === captainId);
  if (captain === undefined) return null;
  const mine = (entries: readonly ThreadEntry[]) =>
    entries.filter((entry) => entry.captain?.threadId === captainId);
  return {
    captain,
    active: mine(model.threads),
    inactive: mine(model.inactive),
    parked: mine([...model.snoozed, ...model.settled]).sort(
      (a, b) => b.lastActivityAt - a.lastActivityAt,
    ),
  };
}
