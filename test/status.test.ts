import { describe, expect, it } from "vitest";

import { laneOf, strongerLane } from "../lib/status";
import { thread } from "./fixtures";

describe("laneOf", () => {
  it("reads a thread blocked on the user as attention", () => {
    expect(laneOf(thread("a", { hasPendingInteraction: true }))).toBe(
      "attention",
    );
    expect(laneOf(thread("b", { indicator: "waiting-for-input" }))).toBe(
      "attention",
    );
    expect(laneOf(thread("c", { queuedWork: "failed" }))).toBe("attention");
  });

  it("reads a running turn or background work as working", () => {
    expect(laneOf(thread("a", { status: "active" }))).toBe("working");
    expect(
      laneOf(
        thread("b", {
          activity: {
            workflows: 0,
            backgroundAgents: 1,
            backgroundCommands: 0,
            planMode: 0,
            goals: 0,
          },
        }),
      ),
    ).toBe("working");
  });

  it("puts attention above working when both apply", () => {
    expect(
      laneOf(thread("a", { status: "active", hasPendingInteraction: true })),
    ).toBe("attention");
  });

  it("reads an unread success as done and an idle thread as quiet", () => {
    expect(laneOf(thread("a", { indicator: "unread-success" }))).toBe("done");
    expect(laneOf(thread("b"))).toBeNull();
  });
});

describe("strongerLane", () => {
  it("keeps the more urgent lane and ignores quiet", () => {
    expect(strongerLane("working", "attention")).toBe("attention");
    expect(strongerLane("done", "working")).toBe("working");
    expect(strongerLane(null, "done")).toBe("done");
    expect(strongerLane(null, null)).toBeNull();
  });
});
