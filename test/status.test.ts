import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { describe, expect, it } from "vitest";
import { statusOf } from "../lib/status";

const thread = (patch: Partial<PluginSidebarThread>): PluginSidebarThread =>
  ({
    status: "idle",
    runtimeStatus: "idle",
    queuedWork: "none",
    hasPendingInteraction: false,
    indicator: "none",
    activity: {
      workflows: 0,
      backgroundAgents: 0,
      backgroundCommands: 0,
      planMode: 0,
      goals: 0,
    },
    ...patch,
  }) as PluginSidebarThread;

describe("statusOf", () => {
  it("reads an errored thread with a waiting message as failed, not working", () => {
    const stuck = thread({
      status: "error",
      runtimeStatus: "error",
      queuedWork: "waiting",
      indicator: "queued-waiting",
    });
    expect(statusOf(stuck)).toBe("failed");
  });

  it("only reads a thread as working while something runs", () => {
    expect(statusOf(thread({ indicator: "goal" }))).toBeNull();
    expect(statusOf(thread({ status: "active", runtimeStatus: "active" }))).toBe(
      "working",
    );
    expect(
      statusOf(
        thread({
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
});
