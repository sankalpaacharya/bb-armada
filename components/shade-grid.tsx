import { useSyncExternalStore } from "react";

import { usePrefersReducedMotion } from "@/components/ui/hooks/use-media-query";
import { cn } from "@/lib/utils";

const FRONT = [1, 0.75, 0.5] as const;
const TRACK = 0.22;
const STEP_MS = 110;

/** Fronts from just before the top-left corner to just past the bottom-right. */
const frameCount = (size: number): number => 2 * (size - 1) + 5;

/** A bright anti-diagonal front, `front` cells along from the top-left corner. */
function frameAt(size: number, front: number): number[] {
  return Array.from({ length: size * size }, (_, index) => {
    const row = Math.floor(index / size);
    const column = index % size;
    return FRONT[Math.abs(row + column - front)] ?? TRACK;
  });
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
  const frame = frameAt(
    size,
    reduced ? size - 1 : (step % frameCount(size)) - 2,
  );
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
