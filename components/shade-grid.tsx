import { useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

const FRONT = [1, 0.75, 0.5] as const;
const TRACK = 0.22;
const STEP_MS = 110;

export function shadeGridFrames(size: number): number[][] {
  const frames: number[][] = [];
  for (let p = -2; p <= 2 * (size - 1) + 2; p++) {
    const cells: number[] = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        cells.push(FRONT[Math.abs(r + c - p)] ?? TRACK);
      }
    }
    frames.push(cells);
  }
  return frames;
}

let tick = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === undefined) {
    timer = setInterval(() => {
      tick += 1;
      for (const notify of listeners) notify();
    }, STEP_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

const getTick = () => tick;

const REDUCED = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(listener: () => void) {
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

const prefersReducedMotion = () => window.matchMedia(REDUCED).matches;

const noopSubscribe = () => () => {};

export function ShadeGrid({
  size = 3,
  label,
  className,
}: {
  size?: number;
  label?: string;
  className?: string;
}) {
  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    prefersReducedMotion,
    () => false,
  );
  const now = useSyncExternalStore(
    reduced ? noopSubscribe : subscribe,
    getTick,
    () => 0,
  );
  const frames = shadeGridFrames(size);
  const frame = frames[reduced ? size : now % frames.length] ?? [];
  return (
    <span
      role={label === undefined ? undefined : "img"}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      className={cn("inline-grid shrink-0 gap-px", className)}
      style={{ gridTemplateColumns: `repeat(${size}, 3px)` }}
    >
      {frame.map((opacity, index) => (
        <span
          key={index}
          aria-hidden="true"
          className="size-[3px] rounded-[0.5px] bg-current"
          style={{ opacity }}
        />
      ))}
    </span>
  );
}
