import { useNow } from "@/lib/clock";
import { wakeLabel } from "@/lib/lifecycle";
import { AGE_TEXT } from "@/lib/styles";
import { formatAge } from "@/lib/time";

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
