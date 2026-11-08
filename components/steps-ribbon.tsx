import type { CSSProperties, KeyboardEvent } from "react";

import {
  STEP_KINDS,
  spanAt,
  type Span,
  type StepKind,
  type TurnSteps,
} from "@/lib/steps";
import { FOCUS_RING } from "@/lib/styles";
import { cn } from "@/lib/utils";

const HATCH =
  "repeating-linear-gradient(135deg, currentColor 0 1px, transparent 1px 4px)";

/** Paints a kind: a solid fill for tool time, a quiet hatch for model time. */
export function kindFill(kind: StepKind): {
  className: string;
  style: CSSProperties;
} {
  return kind === "think"
    ? {
        className: "bg-foreground/[0.04] text-foreground/30",
        style: { backgroundImage: HATCH },
      }
    : { className: "", style: { backgroundColor: STEP_KINDS[kind].color } };
}

export function KindSwatch({
  kind,
  className,
}: {
  kind: StepKind;
  className?: string;
}) {
  const fill = kindFill(kind);
  return (
    <span
      aria-hidden
      className={cn("shrink-0", fill.className, className)}
      style={fill.style}
    />
  );
}

function Segments({
  turn,
  filter,
}: {
  turn: TurnSteps;
  filter: StepKind | null;
}) {
  const end = turn.spans.at(-1)?.to ?? turn.startedAt;
  const wall = end - turn.startedAt;
  if (wall <= 0) return null;
  return turn.spans.map((span) => {
    const fill = kindFill(span.kind);
    return (
      <span
        key={`${span.from}:${span.kind}`}
        className={cn(
          "absolute inset-y-0",
          fill.className,
          filter !== null && span.kind !== filter && "opacity-25",
        )}
        style={{
          ...fill.style,
          left: `${((span.from - turn.startedAt) / wall) * 100}%`,
          width: `${((span.to - span.from) / wall) * 100}%`,
        }}
      />
    );
  });
}

/** A collapsed turn's time at a glance. */
export function MiniRibbon({ turn }: { turn: TurnSteps }) {
  return (
    <span
      aria-hidden
      className="relative block h-1.5 w-full overflow-hidden rounded-full bg-foreground/5"
    >
      <Segments turn={turn} filter={null} />
    </span>
  );
}

/**
 * The turn's wall clock, painted by who owned each moment. Hovering or
 * dragging moves a playhead; a click, Enter, or the arrow keys pin it to a
 * step.
 */
export function Ribbon({
  turn,
  filter,
  at,
  label,
  onScrub,
  onPin,
  onOpen,
}: {
  turn: TurnSteps;
  filter: StepKind | null;
  /** The playhead's time, or null when there is none. */
  at: number | null;
  label: string;
  onScrub: (time: number | null) => void;
  onPin: (time: number | null) => void;
  onOpen: (span: Span) => void;
}) {
  const end = turn.spans.at(-1)?.to ?? turn.startedAt;
  const wall = end - turn.startedAt;
  const timeAt = (event: {
    clientX: number;
    currentTarget: Element;
  }): number | null => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width <= 0 || wall <= 0) return null;
    const fraction = Math.min(
      Math.max((event.clientX - box.left) / box.width, 0),
      1,
    );
    return turn.startedAt + fraction * wall;
  };
  const step = (by: number) => {
    const { spans } = turn;
    if (spans.length === 0) return;
    const current = at === null ? null : spanAt(spans, at);
    const index =
      current === null
        ? by > 0
          ? -1
          : spans.length
        : spans.indexOf(current);
    const next = spans[Math.min(Math.max(index + by, 0), spans.length - 1)]!;
    onPin(next.from);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const span = at === null ? null : spanAt(turn.spans, at);
    if (event.key === "ArrowRight") step(1);
    else if (event.key === "ArrowLeft") step(-1);
    else if (event.key === "Enter" && span !== null) onOpen(span);
    else if (event.key === "Escape") onPin(null);
    else return;
    event.preventDefault();
  };
  const fraction = at === null || wall <= 0 ? null : (at - turn.startedAt) / wall;
  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-4 text-2xs text-muted-foreground">
        {fraction === null ? null : (
          <span
            className="absolute top-0 max-w-full truncate tabular-nums text-foreground/80"
            style={{
              left: `${fraction * 100}%`,
              transform: `translateX(-${fraction * 100}%)`,
            }}
          >
            {label}
          </span>
        )}
      </div>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Where this turn's time went"
        aria-valuemin={0}
        aria-valuemax={Math.round(wall / 1000)}
        aria-valuenow={at === null ? 0 : Math.round((at - turn.startedAt) / 1000)}
        aria-valuetext={label}
        onPointerMove={(event) => onScrub(timeAt(event))}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture?.(event.pointerId);
          onScrub(timeAt(event));
        }}
        onPointerLeave={() => onScrub(null)}
        onClick={(event) => {
          const time = timeAt(event);
          if (time === null) return;
          onPin(time);
          const span = spanAt(turn.spans, time);
          if (span !== null) onOpen(span);
        }}
        onKeyDown={onKeyDown}
        className={cn(
          "relative h-5 cursor-ew-resize touch-none rounded-full",
          FOCUS_RING,
        )}
      >
        <span className="absolute inset-0 overflow-hidden rounded-full bg-foreground/5">
          <Segments turn={turn} filter={filter} />
        </span>
        {fraction === null ? null : (
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-y-1 w-px bg-foreground"
            style={{ left: `${fraction * 100}%` }}
          />
        )}
      </div>
    </div>
  );
}
