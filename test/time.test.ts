import { describe, expect, it } from "vitest";

import {
  formatAge,
  formatDuration,
  formatElapsed,
  formatOffset,
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

describe("formatElapsed", () => {
  it("reads a step's length to a tenth under a second, then whole seconds, minutes and hours", () => {
    expect(formatElapsed(4)).toBe("0s");
    expect(formatElapsed(180)).toBe("0.2s");
    expect(formatElapsed(960)).toBe("1s");
    expect(formatElapsed(8_200)).toBe("8s");
    expect(formatElapsed(41_000)).toBe("41s");
    expect(formatElapsed(59_600)).toBe("1m 00s");
    expect(formatElapsed(182_000)).toBe("3m 02s");
    expect(formatElapsed(72 * MINUTE)).toBe("1h 12m");
  });
});

describe("formatOffset", () => {
  it("reads a time into a turn as a clock", () => {
    expect(formatOffset(12_400)).toBe("0:12");
    expect(formatOffset(41 * MINUTE + 3_000)).toBe("41:03");
    expect(formatOffset(62 * MINUTE + 9_000)).toBe("1:02:09");
  });
});
