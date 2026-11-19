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
 * A Crew row's two times. `state` goes on the title line: how long the
 * current run has gone, or how long the worker has been idle since its last
 * activity. A worker that shows working only for background work has none:
 * its own turn is over, and "idle" beside the working glyph would contradict
 * it. `created` goes on the branch line: how long ago the thread was created.
 */
export type WorkerTimes = {
  state: { kind: "running" | "idle"; time: string } | null;
  created: string;
  title: string;
};

export function workerTimes(
  entry: Pick<ThreadEntry, "lastActivityAt" | "status"> & {
    thread: Pick<PluginSidebarThread, "createdAt">;
  },
  start: RunStart | null,
  now: number,
): WorkerTimes {
  const created = createdAgo(entry.thread.createdAt, now);
  const createdTitle = `created ${formatClockTime(entry.thread.createdAt, now)} (${created})`;
  if (start !== null)
    return {
      state: { kind: "running", time: formatRunTime(now - start.at) },
      created,
      title: `${runTitle(start, now)} · ${createdTitle}`,
    };
  const quiet = now - entry.lastActivityAt;
  const idle = quiet < 60_000 ? "<1m" : formatDuration(quiet);
  const lastActive = `last active ${formatClockTime(entry.lastActivityAt, now)}`;
  if (entry.status === "working")
    return {
      state: null,
      created,
      title: `Working in the background · ${lastActive} · ${createdTitle}`,
    };
  return {
    state: { kind: "idle", time: idle },
    created,
    title: `Idle for ${idle} · ${lastActive} · ${createdTitle}`,
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
