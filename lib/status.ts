import type {
  PluginSidebarThread,
  PluginSidebarThreadIndicator,
} from "@get-bb/plugin-sdk/app";

export type Status = "needs-you" | "failed" | "working" | "queued" | "done";

export type StatusGlyph =
  | { kind: "grid" }
  | { kind: "dot" }
  | { kind: "indicator"; indicator: PluginSidebarThreadIndicator };

export type StatusRow = {
  rank: number;
  word: string;
  tone: string;
  glyph: StatusGlyph;
  /** The card shows the word next to the glyph; the grid speaks for itself. */
  wordOnCard: boolean;
  /** Compact rows show the glyph; a status that is not live shows the age. */
  live: boolean;
  parkable: boolean;
};

const indicator = (indicator: PluginSidebarThreadIndicator): StatusGlyph => ({
  kind: "indicator",
  indicator,
});

export const STATUS: Record<Status, StatusRow> = {
  "needs-you": {
    rank: 5,
    word: "Needs you",
    tone: "text-attention",
    glyph: indicator("waiting-for-input"),
    wordOnCard: true,
    live: true,
    parkable: false,
  },
  failed: {
    rank: 4,
    word: "Failed",
    tone: "text-destructive-text",
    glyph: indicator("unread-error"),
    wordOnCard: true,
    live: true,
    parkable: true,
  },
  working: {
    rank: 3,
    word: "Working",
    tone: "text-[color:var(--bbb-accent,var(--timeline-accent))]",
    glyph: { kind: "grid" },
    wordOnCard: false,
    live: true,
    parkable: false,
  },
  queued: {
    rank: 2,
    word: "Queued",
    tone: "text-muted-foreground",
    glyph: indicator("queued-waiting"),
    wordOnCard: true,
    live: true,
    parkable: false,
  },
  done: {
    rank: 1,
    word: "Done",
    tone: "text-[color:var(--bbb-accent,var(--timeline-accent))]",
    glyph: { kind: "dot" },
    wordOnCard: true,
    live: false,
    parkable: true,
  },
};

const WORKING_INDICATORS = new Set<PluginSidebarThreadIndicator>([
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

/**
 * Every status a thread shows at once. They can overlap: a send can fail while
 * a turn is still running, and the thread is then both failed and working.
 */
export function signalsOf(thread: PluginSidebarThread): Status[] {
  const signals: Status[] = [];
  if (
    thread.hasPendingInteraction ||
    thread.indicator === "waiting-for-input"
  ) {
    signals.push("needs-you");
  }
  if (
    thread.queuedWork === "failed" ||
    thread.indicator === "queued-failed" ||
    thread.indicator === "unread-error"
  ) {
    signals.push("failed");
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
    signals.push(thread.indicator === "queued-waiting" ? "queued" : "working");
  }
  if (thread.indicator === "unread-success") signals.push("done");
  return signals;
}

/** The most urgent of a thread's signals, which is what its card shows. */
export function statusOf(thread: PluginSidebarThread): Status | null {
  return signalsOf(thread).reduce<Status | null>(strongerStatus, null);
}

export function strongerStatus(
  a: Status | null,
  b: Status | null,
): Status | null {
  if (a === null) return b;
  if (b === null) return a;
  return STATUS[b].rank > STATUS[a].rank ? b : a;
}

export function isLive(status: Status | null): boolean {
  return status !== null && STATUS[status].live;
}
