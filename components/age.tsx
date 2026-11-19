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
 * A worker's two times: how long its run has gone after its working glyph,
 * or how long it has been idle, then how long ago it was created. No icon:
 * bb has no timer, and its clock is the glyph for a queued message.
 */
export function WorkerTime({
  entry,
  start,
}: {
  entry: ThreadEntry;
  start: RunStart | null;
}) {
  const now = useNow();
  const times = workerTimes(entry, start, now);
  return (
    <span title={times.title} className={cn(AGE_TEXT, "whitespace-nowrap")}>
      {times.lead}
      <span className="text-muted-foreground/70"> · {times.created}</span>
    </span>
  );
}
