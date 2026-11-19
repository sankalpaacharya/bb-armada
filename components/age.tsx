import { useNow } from "@/lib/clock";
import { wakeLabel } from "@/lib/lifecycle";
import type { ThreadEntry } from "@/lib/model";
import { workerTime, type RunStart } from "@/lib/run-start";
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
 * A worker's one time, at the end of its title line: how long it has run,
 * after its working glyph, or how long ago it was created. No icon: bb has
 * no timer, and its clock is the glyph for a queued message.
 */
export function WorkerTime({
  entry,
  start,
}: {
  entry: ThreadEntry;
  start: RunStart | null;
}) {
  const now = useNow();
  const { text, title } = workerTime(entry, start, now);
  return (
    <span title={title} className={cn(AGE_TEXT, "whitespace-nowrap")}>
      {text}
    </span>
  );
}
