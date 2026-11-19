const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const YEAR = 365 * DAY;

const UNITS = [
  { ms: MINUTE, suffix: "m" },
  { ms: HOUR, suffix: "h" },
  { ms: DAY, suffix: "d" },
  { ms: WEEK, suffix: "w" },
  { ms: YEAR, suffix: "y" },
] as const;

/**
 * A span in a few characters: "now", "5m", "2h", "3d", "1w", "2y", in the
 * largest unit it fills. Ages round down. Time left rounds up, to at least
 * "1m" while any is left, and a rounded-up value that fills the next unit
 * reads in that unit ("1h", not "60m").
 */
export function formatDuration(
  ms: number,
  round: "down" | "up" = "down",
): string {
  if (round === "down" ? ms < MINUTE : ms <= 0) return "now";
  let unit: (typeof UNITS)[number] = UNITS[0];
  for (const candidate of UNITS) if (candidate.ms <= ms) unit = candidate;
  if (round === "down") return `${Math.floor(ms / unit.ms)}${unit.suffix}`;
  const value = Math.ceil(ms / unit.ms);
  const larger = UNITS.find((candidate) => candidate.ms > unit.ms);
  if (larger !== undefined && value * unit.ms >= larger.ms)
    return `1${larger.suffix}`;
  return `${value}${unit.suffix}`;
}

export function formatAge(at: number, now: number): string {
  return at <= 0 ? "" : formatDuration(now - at);
}


/**
 * How long something has run, to the minute: "<1m", "12m", "1h 4m", "2d 3h".
 * Unlike an age it keeps a second unit, so a long run still reads as moving.
 */
export function formatRunTime(ms: number): string {
  if (ms < MINUTE) return "<1m";
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)}m`;
  if (ms < DAY)
    return `${Math.floor(ms / HOUR)}h ${Math.floor((ms % HOUR) / MINUTE)}m`;
  return `${Math.floor(ms / DAY)}d ${Math.floor((ms % DAY) / HOUR)}h`;
}

/** A moment as a reader would say it: "1:38 PM" today, "Nov 18, 1:38 PM" before. */
export function formatClockTime(at: number, now: number): string {
  const date = new Date(at);
  const time = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  if (date.toDateString() === new Date(now).toDateString()) return time;
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}
