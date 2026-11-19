import { describe, expect, it } from "vitest";

import {
  crewRunTitle,
  hasTurnStarted,
  isRunning,
  runStartOf,
  runTitle,
} from "../lib/run-start";
import type { Status } from "../lib/status";
import { NOW, thread } from "./fixtures";

const MINUTE = 60_000;

const entry = (status: Status | null, overrides = {}) => ({
  status,
  thread: thread("w", overrides),
});

describe("isRunning", () => {
  it("counts a worker whose own runtime is busy", () => {
    expect(isRunning(entry("working", { status: "active" }))).toBe(true);
    expect(isRunning(entry("working", { runtimeStatus: "provisioning" }))).toBe(
      true,
    );
  });

  it("does not count work it left behind, or a worker waiting on you", () => {
    expect(
      isRunning(
        entry("working", {
          activity: {
            workflows: 0,
            backgroundAgents: 0,
            backgroundCommands: 1,
            planMode: 0,
            goals: 0,
          },
        }),
      ),
    ).toBe(false);
    expect(isRunning(entry("needs-you", { status: "active" }))).toBe(false);
    expect(isRunning(entry(null))).toBe(false);
  });
});

describe("hasTurnStarted", () => {
  it("reads a turn only once the thread is past starting", () => {
    expect(hasTurnStarted({ status: "active" })).toBe(true);
    expect(hasTurnStarted({ status: "stopping" })).toBe(true);
    expect(hasTurnStarted({ status: "starting" })).toBe(false);
    expect(hasTurnStarted({ status: "pending" })).toBe(false);
  });
});

describe("runStartOf", () => {
  it("counts from the turn's start, even after a pin moved the thread's last change", () => {
    const pinned = { updatedAt: NOW - 2 * MINUTE };
    expect(runStartOf(pinned, NOW - 34 * MINUTE)).toEqual({
      at: NOW - 34 * MINUTE,
      source: "turn",
    });
  });

  it("stands in with the thread's last change until a turn is read", () => {
    expect(runStartOf({ updatedAt: NOW - 5 * MINUTE }, null)).toEqual({
      at: NOW - 5 * MINUTE,
      source: "status",
    });
  });
});

describe("runTitle", () => {
  it("says how long and since when, and when the start is a stand-in", () => {
    expect(runTitle({ at: NOW - 64 * MINUTE, source: "turn" }, NOW)).toMatch(
      /^Running for 1h 4m · started \d{1,2}:\d{2}/,
    );
    expect(runTitle({ at: NOW - 5 * MINUTE, source: "status" }, NOW)).toMatch(
      /^Running for 5m · working since .+, by its last status change$/,
    );
  });
});

describe("crewRunTitle", () => {
  it("names the longest run among the crew's", () => {
    const starts = [
      { at: NOW - 12 * MINUTE, source: "turn" as const },
      { at: NOW - 34 * MINUTE, source: "status" as const },
    ];
    expect(crewRunTitle(2, starts, NOW)).toBe("2 working · longest 34m");
  });

  it("has nothing to say without a run", () => {
    expect(crewRunTitle(0, [], NOW)).toBeNull();
    expect(crewRunTitle(1, [], NOW)).toBeNull();
  });
});
