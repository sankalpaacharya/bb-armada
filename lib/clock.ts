import { useEffect, useSyncExternalStore } from "react";

/**
 * One clock for every age, wake label and shelf. It ticks every 30 s while
 * anything listens, and useScheduledTick adds one tick at a chosen time.
 */
const TICK_MS = 30_000;

/** setTimeout delays are signed 32-bit; a longer wait fires at once. */
const MAX_TIMEOUT_MS = 2_147_483_647;

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

export function useNow(): number {
  return useSyncExternalStore(subscribeClock, readClock, readClock);
}

/** Ticks the clock once at `at`, re-arming every ~24.8 days until it is in range. */
export function useScheduledTick(at: number | null): void {
  useEffect(() => {
    if (at === null) return;
    const delay = Math.min(Math.max(0, at - Date.now()) + 50, MAX_TIMEOUT_MS);
    const timer = setTimeout(tick, delay);
    return () => clearTimeout(timer);
  }, [at]);
}
