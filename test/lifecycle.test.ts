import { describe, expect, it } from "vitest";

import {
  decideAutoSettle,
  inactiveWakesOf,
  lastActivityOf,
  parseStoredPark,
  resolveShelf,
  snoozePresets,
  wakeLabel,
  type AutoSettleThread,
  type Park,
  type PullRequestFacts,
} from "../lib/lifecycle";
import { NOW } from "./fixtures";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const quiet = {
  parkable: true,
  pinned: false,
  latestAttentionAt: 0,
  lastActivityAt: NOW - 2 * HOUR,
} as const;
const settled: Park = { kind: "settled", at: NOW - HOUR, by: "user" };
const snoozed: Park = { kind: "snoozed", at: NOW - HOUR, until: NOW + HOUR };

describe("resolveShelf", () => {
  it("keeps a thread active while nothing is stored", () => {
    expect(resolveShelf(undefined, quiet, NOW, null)).toBe("active");
  });

  it("never hides a thread whose tree has live work or a raised hand", () => {
    const live = { ...quiet, parkable: false };
    expect(resolveShelf(settled, live, NOW, null)).toBe("active");
    expect(resolveShelf(snoozed, live, NOW, null)).toBe("active");
  });

  it("keeps a thread the user moved to active on the active shelf", () => {
    expect(
      resolveShelf({ kind: "kept", at: NOW - HOUR }, quiet, NOW, null),
    ).toBe("active");
  });

  it("shelves a parkable thread the way the user filed it", () => {
    expect(resolveShelf(settled, quiet, NOW, null)).toBe("settled");
    expect(resolveShelf(snoozed, quiet, NOW, null)).toBe("snoozed");
  });

  it("wakes a snooze on its timer", () => {
    expect(resolveShelf(snoozed, quiet, NOW + HOUR, null)).toBe("active");
    expect(resolveShelf(snoozed, quiet, NOW + HOUR - 1, null)).toBe("snoozed");
  });

  it("brings a thread back on attention after it was parked", () => {
    const after = { ...quiet, latestAttentionAt: NOW - HOUR + 1 };
    const before = { ...quiet, latestAttentionAt: NOW - HOUR };
    expect(resolveShelf(settled, after, NOW, null)).toBe("active");
    expect(resolveShelf(settled, before, NOW, null)).toBe("settled");
    expect(resolveShelf(snoozed, after, NOW, null)).toBe("active");
    expect(resolveShelf(snoozed, before, NOW, null)).toBe("snoozed");
  });
});

describe("resolveShelf with Inactive", () => {
  const SIX_HOURS = 6 * HOUR;
  const aged = { ...quiet, lastActivityAt: NOW - SIX_HOURS };

  it("moves a quiet thread to Inactive once its last activity is the threshold old", () => {
    expect(resolveShelf(undefined, aged, NOW, SIX_HOURS)).toBe("inactive");
    expect(resolveShelf(undefined, aged, NOW - 1, SIX_HOURS)).toBe("active");
  });

  it("keeps pinned and live threads active however old", () => {
    expect(
      resolveShelf(undefined, { ...aged, pinned: true }, NOW, SIX_HOURS),
    ).toBe("active");
    expect(
      resolveShelf(undefined, { ...aged, parkable: false }, NOW, SIX_HOURS),
    ).toBe("active");
  });

  it("turns Inactive off with no threshold", () => {
    expect(resolveShelf(undefined, aged, NOW, null)).toBe("active");
  });

  it("shelves a stored park on its own shelf before Inactive", () => {
    expect(resolveShelf(settled, aged, NOW, SIX_HOURS)).toBe("settled");
    expect(resolveShelf(snoozed, aged, NOW, SIX_HOURS)).toBe("snoozed");
  });

  it("still ages a thread the user moved to active into Inactive", () => {
    const kept: Park = { kind: "kept", at: NOW - HOUR };
    expect(resolveShelf(kept, aged, NOW, SIX_HOURS)).toBe("inactive");
  });

  it("brings an auto settle back on any activity after it, and a user settle only on attention", () => {
    const at = NOW - 2 * HOUR;
    const auto: Park = { kind: "settled", at, by: "auto" };
    const user: Park = { kind: "settled", at, by: "user" };
    const touched = { ...quiet, lastActivityAt: at + 1 };
    expect(resolveShelf(auto, touched, NOW, null)).toBe("active");
    expect(resolveShelf(user, touched, NOW, null)).toBe("settled");
    expect(resolveShelf(auto, { ...quiet, lastActivityAt: at }, NOW, null)).toBe(
      "settled",
    );
  });

  it("wakes the list when each thread crosses the threshold", () => {
    const times = { createdAt: 1, updatedAt: 10, latestAttentionAt: 20 };
    expect(inactiveWakesOf([times], 100)).toEqual([120]);
    expect(inactiveWakesOf([times], null)).toEqual([]);
  });
});

describe("snoozePresets", () => {
  it("offers the evening only while it is more than an hour away", () => {
    const morning = new Date(2026, 9, 1, 10, 0);
    const late = new Date(2026, 9, 1, 17, 30);
    expect(snoozePresets(morning).map((preset) => preset.id)).toEqual([
      "hour",
      "evening",
      "tomorrow",
      "next-week",
    ]);
    expect(snoozePresets(late).map((preset) => preset.id)).toEqual([
      "hour",
      "tomorrow",
      "next-week",
    ]);
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

  it("crosses a daylight-saving change on the calendar, not by 24 hours", () => {
    const beforeFallBack = new Date(2026, 10, 1, 15, 0);
    const [tomorrow] = snoozePresets(beforeFallBack).filter(
      (preset) => preset.id === "tomorrow",
    );
    const woke = new Date(tomorrow!.until);
    expect([woke.getDate(), woke.getHours(), woke.getMinutes()]).toEqual([
      2, 9, 0,
    ]);
  });
});

describe("wakeLabel", () => {
  it("rounds the time left up, so a hidden snooze never reads now", () => {
    expect(wakeLabel(NOW + 40_000, NOW)).toBe("1m");
    expect(wakeLabel(NOW + HOUR - 1000, NOW)).toBe("1h");
    expect(wakeLabel(NOW + 5 * MINUTE, NOW)).toBe("5m");
    expect(wakeLabel(NOW - 1, NOW)).toBe("now");
  });
});

describe("parseStoredPark", () => {
  it("reads a settle stored before auto-settle as the user's", () => {
    expect(
      parseStoredPark({ threadId: "t", kind: "settled", at: NOW }),
    ).toEqual({ threadId: "t", kind: "settled", at: NOW, by: "user" });
    expect(
      parseStoredPark({ threadId: "t", kind: "settled", at: NOW, by: "auto" }),
    ).toEqual({ threadId: "t", kind: "settled", at: NOW, by: "auto" });
    expect(
      parseStoredPark({ threadId: "t", kind: "settled", at: NOW, by: "bot" }),
    ).toBeNull();
  });

  it("reads a kept thread", () => {
    expect(parseStoredPark({ threadId: "t", kind: "kept", at: NOW })).toEqual({
      threadId: "t",
      kind: "kept",
      at: NOW,
    });
  });

  it("reads every kind and refuses anything else", () => {
    expect(parseStoredPark({ threadId: "t", ...settled })).toEqual({
      threadId: "t",
      ...settled,
    });
    expect(parseStoredPark({ threadId: "t", ...snoozed })).toEqual({
      threadId: "t",
      ...snoozed,
    });
    expect(
      parseStoredPark({ threadId: "t", kind: "snoozed", at: NOW }),
    ).toBeNull();
    expect(
      parseStoredPark({ threadId: "t", kind: "paused", at: NOW }),
    ).toBeNull();
    expect(parseStoredPark("garbage")).toBeNull();
  });
});

describe("lastActivityOf", () => {
  it("is the newest of creation, change and attention", () => {
    expect(
      lastActivityOf({ createdAt: 3, updatedAt: 1, latestAttentionAt: 2 }),
    ).toBe(3);
    expect(
      lastActivityOf({ createdAt: 1, updatedAt: 1, latestAttentionAt: 5 }),
    ).toBe(5);
  });
});

describe("decideAutoSettle", () => {
  const DAY = 24 * HOUR;
  const settings = { afterDays: 3, onMerge: true };
  const old: AutoSettleThread = {
    lastActivityAt: NOW - 4 * DAY,
    pinned: false,
    hasPendingInteraction: false,
    hasQueuedWork: false,
    isWorking: false,
  };
  const fresh: AutoSettleThread = { ...old, lastActivityAt: NOW - HOUR };
  const absent: PullRequestFacts = { outcome: "absent" };
  const pr = (
    state: "draft" | "open" | "merged" | "closed",
    updatedAt = new Date(NOW - HOUR / 2).toISOString(),
  ): PullRequestFacts => ({ outcome: "available", state, updatedAt });
  const auto: Park = { kind: "settled", at: NOW - DAY, by: "auto" };
  const decide = (
    overrides: Partial<Parameters<typeof decideAutoSettle>[0]> = {},
  ) =>
    decideAutoSettle({
      park: null,
      now: NOW,
      pullRequest: absent,
      settings,
      thread: old,
      ...overrides,
    });

  it("never touches a settle the user filed, or a thread the user moved to active", () => {
    const user: Park = { kind: "settled", at: NOW - DAY, by: "user" };
    const kept: Park = { kind: "kept", at: NOW - DAY };
    expect(decide({ park: user, thread: fresh })).toBe("keep");
    expect(decide({ park: kept })).toBe("keep");
    expect(decide({ park: kept, pullRequest: pr("merged") })).toBe("keep");
  });

  it.each([
    ["pinned", { pinned: true }],
    ["waiting on you", { hasPendingInteraction: true }],
    ["holding queued work", { hasQueuedWork: true }],
    ["working", { isWorking: true }],
  ] as const)(
    "brings back an auto settle while the card is %s, and does not settle it",
    (_, held) => {
      const thread = { ...old, ...held };
      expect(decide({ park: auto, thread })).toBe("unsettle");
      expect(decide({ thread })).toBe("keep");
    },
  );

  it("leaves a snoozed card to its snooze", () => {
    const snoozed: Park = { kind: "snoozed", at: NOW - DAY, until: NOW + DAY };
    expect(decide({ park: snoozed })).toBe("keep");
  });

  it("changes nothing while the pull request cannot be read", () => {
    const unknown: PullRequestFacts = { outcome: "unknown" };
    expect(decide({ pullRequest: unknown })).toBe("keep");
    expect(decide({ park: auto, thread: fresh, pullRequest: unknown })).toBe(
      "keep",
    );
  });

  it("settles a card whose pull request closed, or merged, after its last activity", () => {
    expect(decide({ thread: fresh, pullRequest: pr("closed") })).toBe("settle");
    expect(decide({ thread: fresh, pullRequest: pr("merged") })).toBe("settle");
    const before = new Date(NOW - 2 * HOUR).toISOString();
    expect(decide({ thread: fresh, pullRequest: pr("merged", before) })).toBe(
      "keep",
    );
  });

  it("ignores a merge with settle on merge off, but still settles a closed one", () => {
    const off = { ...settings, onMerge: false };
    expect(
      decide({ thread: fresh, pullRequest: pr("merged"), settings: off }),
    ).toBe("keep");
    expect(
      decide({ thread: fresh, pullRequest: pr("closed"), settings: off }),
    ).toBe("settle");
  });

  it("changes nothing when the pull request time cannot be read", () => {
    expect(decide({ pullRequest: pr("merged", "not a date") })).toBe("keep");
  });

  it("never settles a card with an open or draft pull request, however old", () => {
    expect(decide({ pullRequest: pr("open") })).toBe("keep");
    expect(decide({ pullRequest: pr("draft") })).toBe("keep");
    expect(decide({ park: auto, pullRequest: pr("open") })).toBe("unsettle");
  });

  it("settles a card quiet for longer than the days setting, and not before", () => {
    expect(decide()).toBe("settle");
    expect(decide({ thread: { ...old, lastActivityAt: NOW - 3 * DAY } })).toBe(
      "keep",
    );
    expect(decide({ settings: { ...settings, afterDays: null } })).toBe("keep");
  });

  it("returns only a change from the stored state", () => {
    expect(decide({ park: auto })).toBe("keep");
    expect(decide({ park: auto, thread: fresh })).toBe("unsettle");
    expect(decide({ thread: fresh })).toBe("keep");
  });
});
