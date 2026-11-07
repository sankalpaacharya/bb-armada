import { describe, expect, it } from "vitest";

import { formatAge } from "../lib/time";
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
