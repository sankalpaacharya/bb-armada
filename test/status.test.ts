import { describe, expect, it } from "vitest";

import { isLive, statusOf, strongerStatus } from "../lib/status";
import { thread } from "./fixtures";

describe("statusOf", () => {
  it("reads a thread blocked on the user as needing you", () => {
    expect(statusOf(thread("a", { hasPendingInteraction: true }))).toBe(
      "needs-you",
    );
    expect(statusOf(thread("b", { indicator: "waiting-for-input" }))).toBe(
      "needs-you",
    );
  });

  it("reads an unread error or a message that could not be sent as failed", () => {
    expect(statusOf(thread("a", { indicator: "unread-error" }))).toBe("failed");
    expect(statusOf(thread("b", { queuedWork: "failed" }))).toBe("failed");
    expect(statusOf(thread("c", { indicator: "queued-failed" }))).toBe(
      "failed",
    );
  });

  it("reads a running turn or background work as working", () => {
    expect(statusOf(thread("a", { status: "active" }))).toBe("working");
    expect(
      statusOf(
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

  it("reads a message waiting behind the running turn as queued", () => {
    expect(
      statusOf(thread("a", { status: "active", indicator: "queued-waiting" })),
    ).toBe("queued");
  });

  it("puts the user's turn above work in progress", () => {
    expect(
      statusOf(thread("a", { status: "active", hasPendingInteraction: true })),
    ).toBe("needs-you");
  });

  it("reads an unread success as done and an idle thread as quiet", () => {
    expect(statusOf(thread("a", { indicator: "unread-success" }))).toBe("done");
    expect(statusOf(thread("b"))).toBeNull();
  });
});

describe("strongerStatus", () => {
  it("keeps the more urgent status and ignores quiet", () => {
    expect(strongerStatus("working", "needs-you")).toBe("needs-you");
    expect(strongerStatus("failed", "working")).toBe("failed");
    expect(strongerStatus("done", "queued")).toBe("queued");
    expect(strongerStatus(null, "done")).toBe("done");
    expect(strongerStatus(null, null)).toBeNull();
  });
});

describe("isLive", () => {
  it("counts everything but done and quiet", () => {
    expect(isLive("working")).toBe(true);
    expect(isLive("failed")).toBe(true);
    expect(isLive("done")).toBe(false);
    expect(isLive(null)).toBe(false);
  });
});
