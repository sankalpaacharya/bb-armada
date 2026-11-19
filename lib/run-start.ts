import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

import type { ThreadEntry } from "./model";
import { isBusy } from "./status";
import { formatClockTime, formatRunTime } from "./time";

/**
 * When a worker's current run began. "turn" is its latest `turn/started`
 * event. "status" is the thread's last change, which the flip to working
 * stamps, but which a pin or a rename during the run moves too, so it stands
 * in only until the turn is read.
 */
export type RunStart = { at: number; source: "turn" | "status" };

/**
 * A worker counts a running time while its own runtime works: not while it
 * waits on you, and not for work a turn left behind or a child does.
 */
export const isRunning = (
  entry: Pick<ThreadEntry, "status" | "thread">,
): boolean => entry.status === "working" && isBusy(entry.thread);

/** A thread still starting has not begun its turn, so its latest one is the run before. */
export const hasTurnStarted = (
  thread: Pick<PluginSidebarThread, "status">,
): boolean => thread.status === "active" || thread.status === "stopping";

export function runStartOf(
  thread: Pick<PluginSidebarThread, "updatedAt">,
  turnStartedAt: number | null,
): RunStart {
  return turnStartedAt === null
    ? { at: thread.updatedAt, source: "status" }
    : { at: turnStartedAt, source: "turn" };
}

/** "Running for 12m · started 1:38 PM", saying when the start is the stand-in. */
export function runTitle(start: RunStart, now: number): string {
  const running = `Running for ${formatRunTime(now - start.at)}`;
  const since = formatClockTime(start.at, now);
  return start.source === "turn"
    ? `${running} · started ${since}`
    : `${running} · working since ${since}, by its last status change`;
}

/** "2 working · longest 34m", or null when no run has a start. */
export function crewRunTitle(
  working: number,
  starts: Iterable<RunStart>,
  now: number,
): string | null {
  let earliest: number | null = null;
  for (const start of starts)
    if (earliest === null || start.at < earliest) earliest = start.at;
  if (working === 0 || earliest === null) return null;
  return `${working} working · longest ${formatRunTime(now - earliest)}`;
}
