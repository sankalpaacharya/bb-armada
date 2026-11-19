import { describe, expect, it } from "vitest";

import {
  decideAutoSettle,
  inactiveWakesOf,
  parseStoredPark,
  resolveShelf,
  snoozePresets,
  wakeLabel,
  type AutoSettleThread,
  type Park,
  type PullRequestFacts,
  type Shelf,
  type ShelfSignals,
} from "../lib/lifecycle";
import { NOW } from "./fixtures";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("resolveShelf", () => {
  const SIX_HOURS = 6 * HOUR;
  const quiet = {
    parkable: true,
    pinned: false,
    latestAttentionAt: 0,
    lastActivityAt: NOW - 2 * HOUR,
  } as const;
  const settled: Park = { kind: "settled", at: NOW - HOUR, by: "user" };
  const snoozed: Park = { kind: "snoozed", at: NOW - HOUR, until: NOW + HOUR };
  const kept: Park = { kind: "kept", at: NOW - HOUR };
  const autoSettled: Park = { kind: "settled", at: NOW - 2 * HOUR, by: "auto" };
  const aged = { ...quiet, lastActivityAt: NOW - SIX_HOURS };
  const touched = { ...quiet, lastActivityAt: NOW - 2 * HOUR + 1 };
  const live = { ...quiet, parkable: false };

  it.each<
    [string, Park | undefined, ShelfSignals, number, number | null, Shelf]
  >([
    ["nothing stored", undefined, quiet, NOW, null, "active"],
    ["a settle over live work", settled, live, NOW, null, "active"],
    ["a snooze over live work", snoozed, live, NOW, null, "active"],
    ["a thread moved to active", kept, quiet, NOW, null, "active"],
    ["a settle", settled, quiet, NOW, null, "settled"],
    ["a snooze", snoozed, quiet, NOW, null, "snoozed"],
    ["a snooze a moment before its wake", snoozed, quiet, NOW + HOUR - 1, null, "snoozed"],
    ["a snooze at its wake", snoozed, quiet, NOW + HOUR, null, "active"],
    ["a settle with attention after it", settled, { ...quiet, latestAttentionAt: NOW - HOUR + 1 }, NOW, null, "active"],
    ["a settle with attention only before it", settled, { ...quiet, latestAttentionAt: NOW - HOUR }, NOW, null, "settled"],
    ["a quiet thread at the threshold", undefined, aged, NOW, SIX_HOURS, "inactive"],
    ["a quiet thread just under the threshold", undefined, aged, NOW - 1, SIX_HOURS, "active"],
    ["a quiet thread with Inactive off", undefined, aged, NOW, null, "active"],
    ["a quiet settle", settled, aged, NOW, SIX_HOURS, "settled"],
    ["a quiet thread moved to active", kept, aged, NOW, SIX_HOURS, "inactive"],
    ["an auto settle with activity after it", autoSettled, touched, NOW, null, "active"],
    ["a user settle with activity after it", { ...autoSettled, by: "user" }, touched, NOW, null, "settled"],
  ])("puts %s on its shelf", (_, park, signals, now, inactiveAfterMs, shelf) => {
    expect(resolveShelf(park, signals, now, inactiveAfterMs)).toBe(shelf);
  });

  it("wakes the list when each thread crosses the Inactive threshold", () => {
    const times = { createdAt: 1, updatedAt: 10, latestAttentionAt: 20 };
    expect(inactiveWakesOf([times], 100)).toEqual([120]);
    expect(inactiveWakesOf([times], null)).toEqual([]);
  });
});

describe("snoozePresets", () => {
  const ids = (now: Date) =>
    snoozePresets(now)
      .map((preset) => preset.id)
      .join(" ");

  it("offers the evening only while it is more than an hour away", () => {
    expect(ids(new Date(2026, 9, 1, 10, 0))).toBe(
      "hour evening tomorrow next-week",
    );
    expect(ids(new Date(2026, 9, 1, 17, 30))).toBe("hour tomorrow next-week");
  });

  it("lands tomorrow and next week on 9:00 of the right local day", () => {
    const thursday = new Date(2026, 9, 1, 15, 0);
    const byId = Object.fromEntries(
      snoozePresets(thursday).map((preset) => [preset.id, preset.until]),
    );
    expect(new Date(byId["tomorrow"]!)).toEqual(new Date(2026, 9, 2, 9, 0));
    expect(new Date(byId["next-week"]!)).toEqual(new Date(2026, 9, 5, 9, 0));
    expect(byId["hour"]).toBe(thursday.getTime() + HOUR);
  });
});

describe("wakeLabel", () => {
  it.each([
    [40_000, "1m"],
    [4 * MINUTE + 1, "5m"],
    [5 * MINUTE, "5m"],
    [59 * MINUTE + 30_000, "1h"],
    [90 * MINUTE, "2h"],
    [6 * DAY + 1, "1w"],
    [0, "now"],
  ])(
    "rounds the time left up, so a hidden snooze never reads now: %d ms reads %s",
    (left, label) => {
      expect(wakeLabel(NOW + left, NOW)).toBe(label);
    },
  );
});

it("reads a settle stored before auto-settle as the user's", () => {
  expect(parseStoredPark({ threadId: "t", kind: "settled", at: NOW })).toEqual({
    threadId: "t",
    kind: "settled",
    at: NOW,
    by: "user",
  });
});

describe("decideAutoSettle", () => {
  const settings = { afterDays: 3, onMerge: true };
  const old: AutoSettleThread = {
    lastActivityAt: NOW - 4 * DAY,
    pinned: false,
    hasPendingInteraction: false,
    hasQueuedWork: false,
    isWorking: false,
  };
  const fresh: AutoSettleThread = { ...old, lastActivityAt: NOW - HOUR };
  const pr = (
    state: "draft" | "open" | "merged" | "closed",
    updatedAt = new Date(NOW - HOUR / 2).toISOString(),
  ): PullRequestFacts => ({ outcome: "available", state, updatedAt });
  const auto: Park = { kind: "settled", at: NOW - DAY, by: "auto" };
  const kept: Park = { kind: "kept", at: NOW - DAY };
  const mergedBefore = pr("merged", new Date(NOW - 2 * HOUR).toISOString());
  type Input = Parameters<typeof decideAutoSettle>[0];

  it.each<[string, Partial<Input>, ReturnType<typeof decideAutoSettle>]>([
    ["leaves a thread moved to active after a merge", { park: kept, pullRequest: pr("merged") }, "keep"],
    ["never moves a settle the user filed", { park: { kind: "settled", at: NOW - DAY, by: "user" }, pullRequest: pr("open") }, "keep"],
    ["leaves a snoozed card to its snooze", { park: { kind: "snoozed", at: NOW - DAY, until: NOW + DAY } }, "keep"],
    ["never settles a card that waits on you", { thread: { ...old, hasPendingInteraction: true } }, "keep"],
    ["keeps an auto settle while the pull request cannot be read", { park: auto, thread: fresh, pullRequest: { outcome: "unknown" } }, "keep"],
    ["settles a card whose pull request closed after its last activity", { thread: fresh, pullRequest: pr("closed") }, "settle"],
    ["settles a card whose pull request merged after its last activity", { thread: fresh, pullRequest: pr("merged") }, "settle"],
    ["ignores a merge from before the last activity", { thread: fresh, pullRequest: mergedBefore }, "keep"],
    ["ignores a merge with settle on merge off", { thread: fresh, pullRequest: pr("merged"), settings: { ...settings, onMerge: false } }, "keep"],
    ["never settles a card with a draft pull request", { pullRequest: pr("draft") }, "keep"],
    ["brings back an auto settle whose pull request is open", { park: auto, pullRequest: pr("open") }, "unsettle"],
    ["settles a card quiet longer than the days setting", {}, "settle"],
    ["keeps a card quiet exactly the days setting", { thread: { ...old, lastActivityAt: NOW - 3 * DAY } }, "keep"],
    ["brings back an auto settle while the card is pinned", { park: auto, thread: { ...old, pinned: true } }, "unsettle"],
    ["brings back an auto settle while the card waits on you", { park: auto, thread: { ...old, hasPendingInteraction: true } }, "unsettle"],
    ["brings back an auto settle while the card holds queued work", { park: auto, thread: { ...old, hasQueuedWork: true } }, "unsettle"],
    ["brings back an auto settle while the card is working", { park: auto, thread: { ...old, isWorking: true } }, "unsettle"],
  ])("%s", (_, overrides, decision) => {
    expect(
      decideAutoSettle({
        park: null,
        now: NOW,
        pullRequest: { outcome: "absent" },
        settings,
        thread: old,
        ...overrides,
      }),
    ).toBe(decision);
  });
});
