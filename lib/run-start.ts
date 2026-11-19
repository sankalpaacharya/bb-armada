import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

import type { ThreadEntry } from "./model";
import { isBusy } from "./status";
import { formatClockTime, formatDuration, formatRunTime } from "./time";

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

/** "3h ago", or "just now" in its first minute. */
function createdAgo(createdAt: number, now: number): string {
  const age = formatDuration(now - createdAt);
  return age === "now" ? "just now" : `${age} ago`;
}

/**
 * A Crew row's one time. A working row shows how long it has run: since its
 * turn started, or, for a worker that works only in the background, since
 * its last change, which the switch to working sets. An idle row shows how
 * long ago it was created. The tooltip carries the rest.
 */
export function workerTime(
  entry: Pick<ThreadEntry, "lastActivityAt" | "status"> & {
    thread: Pick<PluginSidebarThread, "createdAt" | "updatedAt">;
  },
  start: RunStart | null,
  now: number,
): { text: string; title: string } {
  const created = createdAgo(entry.thread.createdAt, now);
  const createdAt = `${formatClockTime(entry.thread.createdAt, now)} (${created})`;
  if (start !== null)
    return {
      text: formatRunTime(now - start.at),
      title: `${runTitle(start, now)} · created ${createdAt}`,
    };
  if (entry.status === "working") {
    const since = entry.thread.updatedAt;
    return {
      text: formatRunTime(now - since),
      title: `Working in the background for ${formatRunTime(now - since)} · since ${formatClockTime(since, now)}, by its last status change · created ${createdAt}`,
    };
  }
  const quiet = now - entry.lastActivityAt;
  const idle = quiet < 60_000 ? "<1m" : formatDuration(quiet);
  return {
    text: created,
    title: `Created ${createdAt} · idle for ${idle} · last active ${formatClockTime(entry.lastActivityAt, now)}`,
  };
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
