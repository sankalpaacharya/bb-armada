import { describe, expect, it } from "vitest";

import {
  formatAge,
  formatClockTime,
  formatDuration,
  formatRunTime,
} from "../lib/time";
import { NOW } from "./fixtures";

const ago = (ms: number) => formatAge(NOW - ms, NOW);
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

describe("formatAge", () => {
  it("keeps every age to a few characters", () => {
    expect(ago(10_000)).toBe("now");
    expect(ago(59 * MINUTE)).toBe("59m");
    expect(ago(23 * 60 * MINUTE)).toBe("23h");
    expect(ago(6 * DAY)).toBe("6d");
    expect(ago(13 * DAY)).toBe("1w");
    expect(ago(363 * DAY)).toBe("51w");
    expect(ago(800 * DAY)).toBe("2y");
  });

  it("says nothing for a missing timestamp", () => {
    expect(formatAge(0, NOW)).toBe("");
  });
});

describe("formatDuration", () => {
  it("reads a span ahead the same way as an age behind", () => {
    expect(formatDuration(5 * MINUTE)).toBe("5m");
    expect(formatDuration(2 * 60 * MINUTE)).toBe("2h");
    expect(formatDuration(3 * DAY)).toBe("3d");
    expect(formatDuration(-1)).toBe("now");
  });
});

describe("formatDuration rounding up", () => {
  it("never reads now while time is left, and reads a full unit in that unit", () => {
    expect(formatDuration(40_000, "up")).toBe("1m");
    expect(formatDuration(4 * MINUTE + 1, "up")).toBe("5m");
    expect(formatDuration(59 * MINUTE + 30_000, "up")).toBe("1h");
    expect(formatDuration(90 * MINUTE, "up")).toBe("2h");
    expect(formatDuration(6 * DAY + 1, "up")).toBe("1w");
    expect(formatDuration(0, "up")).toBe("now");
  });
});

describe("formatRunTime", () => {
  it("counts a run in minutes, then keeps a second unit past an hour", () => {
    expect(formatRunTime(0)).toBe("<1m");
    expect(formatRunTime(59_000)).toBe("<1m");
    expect(formatRunTime(12 * MINUTE + 59_000)).toBe("12m");
    expect(formatRunTime(60 * MINUTE)).toBe("1h 0m");
    expect(formatRunTime(64 * MINUTE)).toBe("1h 4m");
    expect(formatRunTime(23 * 60 * MINUTE + 59 * MINUTE)).toBe("23h 59m");
    expect(formatRunTime(2 * DAY + 3 * 60 * MINUTE + 30 * MINUTE)).toBe(
      "2d 3h",
    );
  });
});

describe("formatClockTime", () => {
  it("says the time alone today, and the day before that", () => {
    const today = formatClockTime(NOW - 30 * MINUTE, NOW);
    expect(today).toMatch(/^\d{1,2}:\d{2}/);
    expect(today).not.toContain(",");
    expect(formatClockTime(NOW - DAY, NOW)).toMatch(/, \d{1,2}:\d{2}/);
  });
});
