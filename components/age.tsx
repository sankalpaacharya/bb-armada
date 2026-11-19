import { useNow } from "@/lib/clock";
import { wakeLabel } from "@/lib/lifecycle";
import { runTitle, type RunStart } from "@/lib/run-start";
import { AGE_TEXT } from "@/lib/styles";
import { formatAge, formatRunTime } from "@/lib/time";
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
 * How long a worker has run, after its working glyph. No icon of its own:
 * bb has no timer, and its clock is the glyph for a queued message.
 */
export function RunTime({ start }: { start: RunStart }) {
  const now = useNow();
  return (
    <span
      title={runTitle(start, now)}
      className={cn(AGE_TEXT, "min-w-[3ch] text-right")}
    >
      {formatRunTime(now - start.at)}
    </span>
  );
}
