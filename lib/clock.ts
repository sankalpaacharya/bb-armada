import { useEffect, useState, useSyncExternalStore } from "react";

/** Ages and wake labels tick every 30 s while anything shows one. */
const TICK_MS = 30_000;

/** setTimeout delays are signed 32-bit; a longer wait fires at once. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/** Fire just after a wake, so the time read then is past it. */
const WAKE_SLACK_MS = 50;

let now = Date.now();
let interval: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function tick(): void {
  now = Date.now();
  for (const listener of listeners) listener();
}

function subscribeClock(listener: () => void): () => void {
  if (listeners.size === 0) {
    now = Date.now();
    interval = setInterval(tick, TICK_MS);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(interval);
      interval = undefined;
    }
  };
}

const readClock = (): number => now;

/** The 30 s clock, for leaves that print an age. */
export function useNow(): number {
  return useSyncExternalStore(subscribeClock, readClock, readClock);
}

function soonestAfter(wakes: readonly number[], time: number): number | null {
  let soonest: number | null = null;
  for (const wake of wakes) {
    if (wake > time && (soonest === null || wake < soonest)) soonest = wake;
  }
  return soonest;
}

/**
 * A time that holds still between wakes. It moves only when the soonest of
 * `wakes` passes, so what is built from it rebuilds then and not on every
 * tick of the 30 s clock. A wait longer than a timer allows fires early,
 * moves the time, and so arms again for what is left.
 */
export function useWakeTime(wakes: readonly number[]): number {
  const [time, setTime] = useState(Date.now);
  const next = soonestAfter(wakes, time);
  useEffect(() => {
    if (next === null) return;
    const delay = Math.min(
      Math.max(0, next - Date.now()) + WAKE_SLACK_MS,
      MAX_TIMEOUT_MS,
    );
    const timer = setTimeout(() => setTime(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [next, time]);
  return time;
}

