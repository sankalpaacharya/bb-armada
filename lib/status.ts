import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

export type Lane = "attention" | "working" | "done";

export const LANE_RANK: Record<Lane, number> = { attention: 3, working: 2, done: 1 };

const ATTENTION_INDICATORS = new Set<string>(["waiting-for-input", "queued-failed", "unread-error"]);
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
const BUSY_STATUSES = new Set<string>(["starting", "active", "stopping", "provisioning", "waiting-for-host"]);

export function laneOf(thread: PluginSidebarThread): Lane | null {
  if (
    thread.hasPendingInteraction ||
    thread.queuedWork === "failed" ||
    ATTENTION_INDICATORS.has(thread.indicator)
  ) {
    return "attention";
  }
  const { activity } = thread;
  if (
    BUSY_STATUSES.has(thread.runtimeStatus) ||
    BUSY_STATUSES.has(thread.status) ||
    WORKING_INDICATORS.has(thread.indicator) ||
    activity.workflows + activity.backgroundAgents + activity.backgroundCommands + activity.goals > 0
  ) {
    return "working";
  }
  if (thread.indicator === "unread-success") return "done";
  return null;
}

export function strongerLane(a: Lane | null, b: Lane | null): Lane | null {
  if (a === null) return b;
  if (b === null) return a;
  return LANE_RANK[b] > LANE_RANK[a] ? b : a;
}

const LABELS: Record<Lane, string> = { attention: "Needs you", working: "Working", done: "Done" };

export function statusLabel(lane: Lane): string {
  return LABELS[lane];
}
