import { z } from "zod";

import { threadIdSchema } from "./captains";
import { canPark, type Status } from "./status";
import { formatDuration } from "./time";

const time = z.number().int().positive();

const parkSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("settled"), at: time }),
  z.object({ kind: z.literal("snoozed"), at: time, until: time }),
]);

export type Park = z.infer<typeof parkSchema>;
export type Snooze = Extract<Park, { kind: "snoozed" }>;

export const parkRecordSchema = z
  .object({ threadId: threadIdSchema })
  .and(parkSchema);

export type ParkRecord = z.infer<typeof parkRecordSchema>;

export type Shelf = "active" | "snoozed" | "settled";

export const PARK_KEY_PREFIX = "park:";
export const parkKey = (threadId: string): string =>
  `${PARK_KEY_PREFIX}${threadId}`;

export function parseStoredPark(raw: unknown): ParkRecord | null {
  const parsed = parkRecordSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export type ShelfSignals = {
  status: Status | null;
  latestAttentionAt: number;
};

/**
 * Live work and a raised hand always win, so a parked thread that starts
 * working or asks a question comes straight back. A snooze wakes on its
 * timer or on attention after it was set; a settle returns on new attention.
 */
export function resolveShelf(
  park: Park | undefined,
  signals: ShelfSignals,
  now: number,
): Shelf {
  if (park === undefined || !canPark(signals.status)) return "active";
  if (signals.latestAttentionAt > park.at) return "active";
  if (park.kind === "snoozed") return park.until <= now ? "active" : "snoozed";
  return "settled";
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const EVENING_HOUR = 18;
const MORNING_HOUR = 9;

export type SnoozePresetId = "hour" | "evening" | "tomorrow" | "next-week";

export type SnoozePreset = { id: SnoozePresetId; label: string; until: number };

/** Calendar-day arithmetic, so a preset lands on the right local day across a DST change. */
function atHour(base: Date, hour: number, addDays = 0): number {
  const next = new Date(base);
  next.setDate(next.getDate() + addDays);
  next.setHours(hour, 0, 0, 0);
  return next.getTime();
}

/** "This evening" only while it is more than an hour before 18:00. */
export function snoozePresets(now: Date): SnoozePreset[] {
  const presets: SnoozePreset[] = [
    { id: "hour", label: "In 1 hour", until: now.getTime() + HOUR },
  ];
  const evening = atHour(now, EVENING_HOUR);
  if (evening - now.getTime() > HOUR)
    presets.push({ id: "evening", label: "This evening", until: evening });
  presets.push({
    id: "tomorrow",
    label: "Tomorrow",
    until: atHour(now, MORNING_HOUR, 1),
  });
  const daysUntilMonday = (1 - now.getDay() + 7) % 7 || 7;
  presets.push({
    id: "next-week",
    label: "Next week",
    until: atHour(now, MORNING_HOUR, daysUntilMonday),
  });
  return presets;
}

export const wakeLabel = (until: number, now: number): string =>
  formatDuration(until - now);

/** The soonest snooze wake still ahead, or null when nothing is snoozed. */
export function nextWakeAt(
  parks: readonly Park[],
  now: number,
): number | null {
  let soonest: number | null = null;
  for (const park of parks) {
    if (park.kind !== "snoozed" || park.until <= now) continue;
    if (soonest === null || park.until < soonest) soonest = park.until;
  }
  return soonest;
}
