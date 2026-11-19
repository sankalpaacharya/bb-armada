import { useNow } from "@/lib/clock";
import { wakeLabel } from "@/lib/lifecycle";
import type { ThreadEntry } from "@/lib/model";
import { workerTimes, type RunStart } from "@/lib/run-start";
import { AGE_TEXT } from "@/lib/styles";
import { formatAge } from "@/lib/time";
import { cn } from "@/lib/utils";

/** A leaf that follows the clock, so only ages re-render on each tick. */
export function Age({ at }: { at: number }) {
  const now = useNow();
  return <span className={AGE_TEXT}>{formatAge(at, now)}</span>;
}

export function WakesIn({ until }: { until: number }) {
  const now = useNow();
  return (
    <span className={AGE_TEXT} title="Wakes in">
      {wakeLabel(until, now)}
    </span>
  );
}

/**
 * A worker's run state, at the end of its title line: how long its run has
 * gone after the working glyph, or "idle 4m", which drops the number when
 * the row is too narrow to spare it. No icon: bb has no timer, and its clock
 * is the glyph for a queued message.
 */
export function RunState({
  entry,
  start,
}: {
  entry: ThreadEntry;
  start: RunStart | null;
}) {
  const now = useNow();
  const { state, title } = workerTimes(entry, start, now);
  if (state === null) return null;
  return (
    <span title={title} className={cn(AGE_TEXT, "whitespace-nowrap")}>
      {state.kind === "running" ? (
        state.time
      ) : (
        <>
          idle<span className="hidden @min-[18rem]:inline"> {state.time}</span>
        </>
      )}
    </span>
  );
}

/** How long ago a worker was created, at the end of its branch line. */
export function CreatedAge({
  entry,
  start,
}: {
  entry: ThreadEntry;
  start: RunStart | null;
}) {
  const now = useNow();
  const { created, title } = workerTimes(entry, start, now);
  return (
    <span title={title} className={cn(AGE_TEXT, "whitespace-nowrap")}>
      {created}
    </span>
  );
}
