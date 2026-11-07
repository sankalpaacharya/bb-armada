import { useSyncExternalStore } from "react";

import { usePrefersReducedMotion } from "@/components/ui/hooks/use-media-query";
import { cn } from "@/lib/utils";

const FRONT = [1, 0.75, 0.5] as const;
const TRACK = 0.22;
const STEP_MS = 110;

/** A bright anti-diagonal front sweeping from the top-left corner out the bottom-right. */
function buildFrames(size: number): number[][] {
  const frames: number[][] = [];
  for (let front = -2; front <= 2 * (size - 1) + 2; front++) {
    const cells: number[] = [];
    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size; column++) {
        cells.push(FRONT[Math.abs(row + column - front)] ?? TRACK);
      }
    }
    frames.push(cells);
  }
  return frames;
}

const framesBySize = new Map<number, number[][]>();

function framesFor(size: number): number[][] {
  let frames = framesBySize.get(size);
  if (frames === undefined) {
    frames = buildFrames(size);
    framesBySize.set(size, frames);
  }
  return frames;
}

/** Under reduced motion the front rests on the centre diagonal. */
const stillFrame = (size: number): number[] => framesFor(size)[size + 1]!;

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
const noopSubscribe = () => () => {};

export function ShadeGrid({
  size = 4,
  label,
  className,
}: {
  size?: number;
  label?: string;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const step = useSyncExternalStore(
    reduced ? noopSubscribe : subscribe,
    getTick,
    () => 0,
  );
  const frames = framesFor(size);
  const frame = reduced ? stillFrame(size) : frames[step % frames.length]!;
  return (
    <span
      role={label === undefined ? undefined : "img"}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      className={cn("inline-grid shrink-0 gap-px", className)}
      style={{ gridTemplateColumns: `repeat(${size}, 2px)` }}
    >
      {frame.map((opacity, index) => (
        <span
          key={index}
          aria-hidden="true"
          className="size-[2px] bg-current"
          style={{ opacity }}
        />
      ))}
    </span>
  );
}
