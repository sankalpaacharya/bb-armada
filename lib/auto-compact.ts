import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { BbPluginApi } from "@get-bb/plugin-sdk";

import { checkpointInput, type CompactRole } from "./captain-text";
import type { AutoCompactSettings } from "./settings";

/** bb's id for Claude Code threads; Codex compacts itself. */
const CLAUDE_CODE = "claude-code";
export const COMPACTION_LOG = ".armada-compactions.jsonl";

export type CompactStep = "checkpoint" | "compact";
export type CompactDecision = "skip" | CompactStep;

export type CompactInput = {
  role: CompactRole;
  usedTokens: number;
  thresholds: Pick<AutoCompactSettings, "coordinatorK" | "workerK">;
  checkpointPending: boolean;
};

/** Over the threshold, a thread is asked to save its state first, then compacted at its next idle. */
export function decideAutoCompact({
  role,
  usedTokens,
  thresholds,
  checkpointPending,
}: CompactInput): CompactDecision {
  const thresholdK =
    role === "coordinator" ? thresholds.coordinatorK : thresholds.workerK;
  if (thresholdK === 0 || usedTokens < thresholdK * 1000) return "skip";
  return checkpointPending ? "compact" : "checkpoint";
}

type IdleThread = {
  id: string;
  providerId: string;
  projectId: string;
  queuedMessageCount: number;
  activeBackgroundAgentCount: number;
};

export type AutoCompactDeps = {
  readSettings: () => Promise<AutoCompactSettings>;
  isCaptain: (threadId: string) => Promise<boolean>;
  readSupervisors: () => Promise<ReadonlySet<string>>;
  /** Where each checkpoint and compact is recorded, one JSON line apiece. */
  logFile: string;
  now?: () => number;
};

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

export function createAutoCompact(bb: BbPluginApi, deps: AutoCompactDeps) {
  const now = deps.now ?? Date.now;
  /** Threads asked to checkpoint and not yet compacted. A restart forgets them, so they are asked again. */
  const pending = new Set<string>();
  /** Threads Armada just compacted. The idle that ends the compaction can still report the old size, so it is skipped. */
  const compacted = new Set<string>();
  const handling = new Set<string>();

  const roleOf = async (threadId: string): Promise<CompactRole | null> => {
    let supervisors: ReadonlySet<string> | null = null;
    const coordinates = async (id: string) =>
      (await deps.isCaptain(id)) ||
      (supervisors ??= await deps.readSupervisors()).has(id);
    if (await coordinates(threadId)) return "coordinator";
    const { threads } = await bb.sdk.threads.experimental_listAncestors({
      threadIds: [threadId],
    });
    for (const id of threads[0]?.ancestorIds ?? [])
      if (await coordinates(id)) return "worker";
    return null;
  };

  const record = async (line: Record<string, unknown>) => {
    const text = JSON.stringify(line);
    bb.log.info(text);
    try {
      await mkdir(path.dirname(deps.logFile), { recursive: true });
      await appendFile(deps.logFile, `${text}\n`);
    } catch (cause) {
      bb.log.warn(`could not write the compaction log: ${messageOf(cause)}`);
    }
  };

  const handle = async (thread: IdleThread, startedAt: number) => {
    if (thread.providerId !== CLAUDE_CODE) return;
    if (compacted.delete(thread.id)) return;
    const settings = await deps.readSettings();
    if (
      !settings.projects.has(thread.projectId) ||
      thread.queuedMessageCount > 0 ||
      thread.activeBackgroundAgentCount > 0
    )
      return;
    const role = await roleOf(thread.id);
    if (role === null) return;
    const { usage } = await bb.sdk.threads.context({ threadId: thread.id });
    if (usage === null || usage === undefined) return;
    const { usedTokens } = usage;
    const step = decideAutoCompact({
      role,
      usedTokens,
      thresholds: settings,
      checkpointPending: pending.has(thread.id),
    });
    if (step === "skip") {
      pending.delete(thread.id);
      return;
    }
    if (step === "checkpoint") {
      const thresholdK =
        role === "coordinator" ? settings.coordinatorK : settings.workerK;
      await bb.sdk.threads.send({
        threadId: thread.id,
        mode: "queue-if-active",
        input: checkpointInput(role, thresholdK),
      });
      pending.add(thread.id);
    } else {
      await bb.sdk.threads.compact({ threadId: thread.id });
      pending.delete(thread.id);
      compacted.add(thread.id);
    }
    await record({
      at: new Date(startedAt).toISOString(),
      threadId: thread.id,
      projectId: thread.projectId,
      role,
      step,
      usedTokens,
      ms: now() - startedAt,
    });
  };

  /** Never throws, and handles one thread at a time. */
  return async function onIdle(thread: IdleThread): Promise<void> {
    if (handling.has(thread.id)) return;
    handling.add(thread.id);
    try {
      await handle(thread, now());
    } catch (cause) {
      bb.log.warn(`auto-compact failed for ${thread.id}: ${messageOf(cause)}`);
    } finally {
      handling.delete(thread.id);
    }
  };
}
