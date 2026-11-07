const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const YEAR = 365 * DAY;

export function formatAge(at: number, now: number): string {
  if (at <= 0) return "";
  const age = Math.max(0, now - at);
  if (age < MINUTE) return "now";
  if (age < HOUR) return `${Math.floor(age / MINUTE)}m`;
  if (age < DAY) return `${Math.floor(age / HOUR)}h`;
  if (age < WEEK) return `${Math.floor(age / DAY)}d`;
  if (age < YEAR) return `${Math.floor(age / WEEK)}w`;
  return `${Math.floor(age / YEAR)}y`;
}
