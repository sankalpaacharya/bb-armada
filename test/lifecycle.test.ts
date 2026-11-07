import { describe, expect, it } from "vitest";

import {
  parseStoredPark,
  resolveShelf,
  snoozePresets,
  wakeLabel,
  type Park,
} from "../lib/lifecycle";
import { NOW } from "./fixtures";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const quiet = { parkable: true, latestAttentionAt: 0 } as const;
const settled: Park = { kind: "settled", at: NOW - HOUR };
const snoozed: Park = { kind: "snoozed", at: NOW - HOUR, until: NOW + HOUR };

describe("resolveShelf", () => {
  it("keeps a thread active while nothing is stored", () => {
    expect(resolveShelf(undefined, quiet, NOW)).toBe("active");
  });

  it("never hides a thread whose tree has live work or a raised hand", () => {
    const live = { ...quiet, parkable: false };
    expect(resolveShelf(settled, live, NOW)).toBe("active");
    expect(resolveShelf(snoozed, live, NOW)).toBe("active");
  });

  it("shelves a parkable thread the way the user filed it", () => {
    expect(resolveShelf(settled, quiet, NOW)).toBe("settled");
    expect(resolveShelf(snoozed, quiet, NOW)).toBe("snoozed");
  });

  it("wakes a snooze on its timer", () => {
    expect(resolveShelf(snoozed, quiet, NOW + HOUR)).toBe("active");
    expect(resolveShelf(snoozed, quiet, NOW + HOUR - 1)).toBe("snoozed");
  });

  it("brings a thread back on attention after it was parked", () => {
    const after = { ...quiet, latestAttentionAt: NOW - HOUR + 1 };
    const before = { ...quiet, latestAttentionAt: NOW - HOUR };
    expect(resolveShelf(settled, after, NOW)).toBe("active");
    expect(resolveShelf(settled, before, NOW)).toBe("settled");
    expect(resolveShelf(snoozed, after, NOW)).toBe("active");
    expect(resolveShelf(snoozed, before, NOW)).toBe("snoozed");
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
  it("reads both kinds and refuses anything else", () => {
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
