import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

const CELLS = 9;
const CENTRE = 4;
// The reference draws █ ▓ ▒ chasing over a ░ track. At 10px those glyphs blur
// into uneven bars, so each cell paints its shade's density instead.
const CHASERS = [1, 0.75, 0.5] as const;

export function SquareGrid({
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      role={label === undefined ? undefined : "img"}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      className={cn("armada-square-grid", className)}
    >
      {Array.from({ length: CELLS }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className="armada-square-grid-track"
          style={index === CENTRE ? { visibility: "hidden" } : undefined}
        />
      ))}
      {CHASERS.map((opacity, index) => (
        <span
          key={index}
          aria-hidden="true"
          data-trail={index > 0 ? "" : undefined}
          className="armada-square-grid-chaser"
          style={
            {
              "--armada-chaser": index,
              opacity,
              zIndex: CHASERS.length - index,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}
