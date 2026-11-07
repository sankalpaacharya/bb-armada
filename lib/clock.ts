import { useSyncExternalStore } from "react";

/**
 * One clock for every age and wake label. It ticks every 30 s while anything
 * listens, and a listener can ask for one extra tick at a given time.
 */
const TICK_MS = 30_000;

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
