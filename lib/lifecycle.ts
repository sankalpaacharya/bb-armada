import { z } from "zod";

import { idSchema } from "./captains";
import { formatDuration } from "./time";

const time = z.number().int().positive();

const settledBy = z.enum(["user", "auto"]);

/**
 * `kept` is the user's "Move to active": it holds no shelf, and it stops the
 * auto-settle job from settling the thread again.
 */
const parkVariants = [
  z.object({ kind: z.literal("settled"), at: time, by: settledBy }),
  z.object({ kind: z.literal("snoozed"), at: time, until: time }),
  z.object({ kind: z.literal("kept"), at: time }),
] as const;

export const parkRecordSchema = z
  .object({ threadId: idSchema })
  .and(z.discriminatedUnion("kind", parkVariants));

export type ParkRecord = z.infer<typeof parkRecordSchema>;
export type Park = z.infer<(typeof parkVariants)[number]>;
export type Settle = Extract<Park, { kind: "settled" }>;
export type Snooze = Extract<Park, { kind: "snoozed" }>;

export type Shelf = "active" | "inactive" | "snoozed" | "settled";

export const PARK_KEY_PREFIX = "park:";
export const parkKey = (threadId: string): string =>
  `${PARK_KEY_PREFIX}${threadId}`;

/** Settles stored before auto-settle carry no `by`; only the user filed them. */
const storedParkSchema = z
  .object({ threadId: idSchema })
  .and(
    z.discriminatedUnion("kind", [
      parkVariants[0].extend({ by: settledBy.default("user") }),
      parkVariants[1],
      parkVariants[2],
    ]),
  )
  .pipe(parkRecordSchema);

export function parseStoredPark(raw: unknown): ParkRecord | null {
  const parsed = storedParkSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export type ShelfSignals = {
  /** False while anything in the thread's tree is working, queued or needs you. */
  parkable: boolean;
  pinned: boolean;
  latestAttentionAt: number;
  lastActivityAt: number;
};

/**
 * A park that can never apply again: attention came after it, or its snooze
 * timer passed. An auto settle also ends on any activity after it, as the
 * server job would unsettle it on its next run. Deleting an expired park
 * changes nothing the list shows.
 */
export function isExpired(
  park: Park,
  signals: Pick<ShelfSignals, "latestAttentionAt" | "lastActivityAt">,
  now: number,
): boolean {
  switch (park.kind) {
    case "kept":
      return false;
    case "settled":
      return (
        (park.by === "auto"
          ? signals.lastActivityAt
          : signals.latestAttentionAt) > park.at
      );
    case "snoozed":
      return signals.latestAttentionAt > park.at || park.until <= now;
  }
}

/**
 * Live work and a raised hand always win, so a parked thread that starts
 * working or asks a question comes straight back. A snooze wakes on its
 * timer or on attention after it was set; a settle returns on new attention.
 * Anything else that has been quiet for `inactiveAfterMs` is inactive, unless
 * it is pinned; null turns Inactive off.
 */
export function resolveShelf(
  park: Park | undefined,
  signals: ShelfSignals,
  now: number,
  inactiveAfterMs: number | null,
): Shelf {
  if (!signals.parkable) return "active";
  if (
    park !== undefined &&
    park.kind !== "kept" &&
    !isExpired(park, signals, now)
  )
    return park.kind;
  return !signals.pinned &&
    inactiveAfterMs !== null &&
    signals.lastActivityAt <= now - inactiveAfterMs
    ? "inactive"
    : "active";
}

/** When each thread would cross into Inactive, for the clock that wakes the model. */
export const inactiveWakesOf = (
  threads: readonly ActivityTimes[],
  inactiveAfterMs: number | null,
): number[] =>
  inactiveAfterMs === null
    ? []
    : threads.map((thread) => lastActivityOf(thread) + inactiveAfterMs);

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

export const tomorrowMorning = (now: Date): number =>
  atHour(now, MORNING_HOUR, 1);

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
    until: tomorrowMorning(now),
  });
  const daysUntilMonday = (1 - now.getDay() + 7) % 7 || 7;
  presets.push({
    id: "next-week",
    label: "Next week",
    until: atHour(now, MORNING_HOUR, daysUntilMonday),
  });
  return presets;
}

/** Rounded up, so a snooze never reads "now" while the thread is still hidden. */
export const wakeLabel = (until: number, now: number): string =>
  formatDuration(until - now, "up");

/** When each snooze wakes, for the clock that wakes the model. */
export const wakesOf = (parks: readonly Park[]): number[] =>
  parks.flatMap((park) => (park.kind === "snoozed" ? [park.until] : []));

const DAY = 24 * HOUR;

export type ActivityTimes = {
  createdAt: number;
  updatedAt: number;
  latestAttentionAt: number;
};

export const lastActivityOf = (thread: ActivityTimes): number =>
  Math.max(thread.createdAt, thread.updatedAt, thread.latestAttentionAt);

/** A card's pull request as auto-settle reads it; `unknown` when it could not be read. */
export type PullRequestFacts =
  | {
      outcome: "available";
      state: "draft" | "open" | "merged" | "closed";
      updatedAt: string;
    }
  | { outcome: "absent" }
  | { outcome: "unknown" };

export type AutoSettleSettings = {
  /** Settle a quiet card after this many days; null turns it off. */
  afterDays: number | null;
  onMerge: boolean;
};

/** A card folded over its whole tree: any thread pinned, waiting, queued or working holds it. */
export type AutoSettleThread = {
  lastActivityAt: number;
  pinned: boolean;
  hasPendingInteraction: boolean;
  hasQueuedWork: boolean;
  isWorking: boolean;
};

export type AutoSettleDecision = "keep" | "settle" | "unsettle";

const isUserOverride = (park: Park | null): boolean =>
  park?.kind === "kept" || (park?.kind === "settled" && park.by === "user");

export function cannotAutoSettle(
  park: Park | null,
  thread: AutoSettleThread,
): boolean {
  return (
    thread.pinned ||
    thread.hasPendingInteraction ||
    thread.hasQueuedWork ||
    thread.isWorking ||
    park?.kind === "snoozed"
  );
}

export const needsPullRequest = (
  park: Park | null,
  thread: AutoSettleThread,
): boolean => !isUserOverride(park) && !cannotAutoSettle(park, thread);

/** Whether policy wants the card settled, or null when it cannot tell. */
function policySettles(
  now: number,
  pullRequest: PullRequestFacts,
  settings: AutoSettleSettings,
  lastActivityAt: number,
): boolean | null {
  if (pullRequest.outcome === "unknown") return null;
  if (pullRequest.outcome === "available") {
    const { state } = pullRequest;
    if (state === "open" || state === "draft") return false;
    if (state === "closed" || settings.onMerge) {
      const updatedAt = Date.parse(pullRequest.updatedAt);
      if (Number.isNaN(updatedAt)) return null;
      if (updatedAt >= lastActivityAt) return true;
    }
  }
  return (
    settings.afterDays !== null &&
    lastActivityAt < now - settings.afterDays * DAY
  );
}

/**
 * bb-sidebar's auto-settle rule. A user's settle or "Move to active" is never
 * touched; a card that is pinned, live or snoozed comes off an auto settle; a
 * closed PR, or a merged one with `onMerge`, settles a card it outlived; an
 * open or draft PR holds it; otherwise it settles after `afterDays` quiet days.
 * Only a change from the current auto-settled state is returned.
 */
export function decideAutoSettle({
  park,
  now,
  pullRequest,
  settings,
  thread,
}: {
  park: Park | null;
  now: number;
  pullRequest: PullRequestFacts;
  settings: AutoSettleSettings;
  thread: AutoSettleThread;
}): AutoSettleDecision {
  if (isUserOverride(park)) return "keep";
  const settled = park?.kind === "settled";
  if (cannotAutoSettle(park, thread)) return settled ? "unsettle" : "keep";
  const wanted = policySettles(
    now,
    pullRequest,
    settings,
    thread.lastActivityAt,
  );
  if (wanted === null || wanted === settled) return "keep";
  return wanted ? "settle" : "unsettle";
}
