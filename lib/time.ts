const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const YEAR = 365 * DAY;

/** A span in a few characters: "now", "5m", "2h", "3d", "1w", "2y". */
export function formatDuration(ms: number): string {
  const span = Math.max(0, ms);
  if (span < MINUTE) return "now";
  if (span < HOUR) return `${Math.floor(span / MINUTE)}m`;
  if (span < DAY) return `${Math.floor(span / HOUR)}h`;
  if (span < WEEK) return `${Math.floor(span / DAY)}d`;
  if (span < YEAR) return `${Math.floor(span / WEEK)}w`;
  return `${Math.floor(span / YEAR)}y`;
}

export function formatAge(at: number, now: number): string {
  return at <= 0 ? "" : formatDuration(now - at);
}
