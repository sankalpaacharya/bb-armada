import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

export type Status = "needs-you" | "failed" | "working" | "queued" | "done";

const RANK: Record<Status, number> = {
  "needs-you": 5,
  failed: 4,
  working: 3,
  queued: 2,
  done: 1,
};

const WORKING_INDICATORS = new Set<string>([
  "runtime",
  "workflow",
  "background-agent",
  "background-command",
  "goal",
  "plan-mode",
  "queued-waiting",
  "working-draft",
]);
const BUSY_STATUSES = new Set<string>([
  "starting",
  "active",
  "stopping",
  "provisioning",
  "waiting-for-host",
]);

export function statusOf(thread: PluginSidebarThread): Status | null {
  if (
    thread.hasPendingInteraction ||
    thread.indicator === "waiting-for-input"
  ) {
    return "needs-you";
  }
  if (
    thread.queuedWork === "failed" ||
    thread.indicator === "queued-failed" ||
    thread.indicator === "unread-error"
  ) {
    return "failed";
  }
  const { activity } = thread;
  if (
    BUSY_STATUSES.has(thread.runtimeStatus) ||
    BUSY_STATUSES.has(thread.status) ||
    WORKING_INDICATORS.has(thread.indicator) ||
    activity.workflows +
      activity.backgroundAgents +
      activity.backgroundCommands +
      activity.goals >
      0
  ) {
    return thread.indicator === "queued-waiting" ? "queued" : "working";
  }
  if (thread.indicator === "unread-success") return "done";
  return null;
}

export function strongerStatus(
  a: Status | null,
  b: Status | null,
): Status | null {
  if (a === null) return b;
  if (b === null) return a;
  return RANK[b] > RANK[a] ? b : a;
}

export function isLive(status: Status | null): boolean {
  return status !== null && status !== "done";
}
