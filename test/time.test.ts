import { describe, expect, it } from "vitest";

import { formatAge, formatClockTime, formatRunTime } from "../lib/time";
import { NOW } from "./fixtures";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

describe("formatAge", () => {
  it("keeps every age to a few characters, and says nothing without a timestamp", () => {
    const ago = (ms: number) => formatAge(NOW - ms, NOW);
    expect(ago(10_000)).toBe("now");
    expect(ago(59 * MINUTE)).toBe("59m");
    expect(ago(23 * 60 * MINUTE)).toBe("23h");
    expect(ago(6 * DAY)).toBe("6d");
    expect(ago(13 * DAY)).toBe("1w");
    expect(ago(363 * DAY)).toBe("51w");
    expect(ago(800 * DAY)).toBe("2y");
    expect(formatAge(0, NOW)).toBe("");
  });
});

describe("formatRunTime", () => {
  it("counts a run in minutes, then keeps a second unit past an hour", () => {
    expect(formatRunTime(59_000)).toBe("<1m");
    expect(formatRunTime(60 * MINUTE)).toBe("1h 0m");
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
