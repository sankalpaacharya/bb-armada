import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { describe, expect, it } from "vitest";

import { statusOf, type Status } from "../lib/status";
import { thread } from "./fixtures";

const backgroundAgent = {
  activity: { ...thread("t").activity, backgroundAgents: 1 },
};

describe("statusOf", () => {
  it.each<[string, Partial<PluginSidebarThread>, Status | null]>([
    ["a pending question", { hasPendingInteraction: true }, "needs-you"],
    ["a wait for input", { indicator: "waiting-for-input" }, "needs-you"],
    ["an unread error", { indicator: "unread-error" }, "failed"],
    ["a send that failed", { queuedWork: "failed" }, "failed"],
    ["a queued message that failed", { indicator: "queued-failed" }, "failed"],
    ["a running turn", { status: "active" }, "working"],
    ["background work", backgroundAgent, "working"],
    ["a message waiting behind the running turn", { status: "active", indicator: "queued-waiting" }, "queued"],
    ["a question during a running turn", { status: "active", hasPendingInteraction: true }, "needs-you"],
    ["a failed send beside a running turn", { queuedWork: "failed", runtimeStatus: "active" }, "failed"],
    ["an unread success", { indicator: "unread-success" }, "done"],
    ["an idle thread", {}, null],
  ])("reads %s as %s", (_, overrides, status) => {
    expect(statusOf(thread("t", overrides))).toBe(status);
  });
});
