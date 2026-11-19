import { useNow } from "@/lib/clock";
import { wakeLabel } from "@/lib/lifecycle";
import { runTitle, type RunStart } from "@/lib/run-start";
import { AGE_TEXT } from "@/lib/styles";
import { formatAge, formatRunTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Icon } from "./ui/icon";

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

/** How long a worker has run, behind a timer so it does not read as an age. */
export function RunTime({ start }: { start: RunStart }) {
  const now = useNow();
  return (
    <span
      title={runTitle(start, now)}
      className={cn(AGE_TEXT, "flex items-center gap-0.5")}
    >
      <Icon name="Timer" fallback="Clock" aria-hidden className="size-3" />
      <span className="min-w-[3ch] text-right">
        {formatRunTime(now - start.at)}
      </span>
    </span>
  );
}
