import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

import { CAPTAIN_KEY_PREFIX, parseStoredCaptain } from "./captains";
import { threadForest } from "./forest";
import { listRecords } from "./kv-records";
import {
  PARK_KEY_PREFIX,
  decideAutoSettle,
  lastActivityOf,
  needsPullRequest,
  parkKey,
  parseStoredPark,
  type AutoSettleDecision,
  type AutoSettleSettings,
  type AutoSettleThread,
  type Park,
  type ParkRecord,
  type PullRequestFacts,
} from "./lifecycle";
import { PULL_REQUESTS_PLUGIN_ID } from "./pull-requests";

type ListedThread = Awaited<
  ReturnType<BbPluginApi["sdk"]["threads"]["list"]>
>[number];

const PAGE_SIZE = 100;
const KEYS_PER_CALL = 25;
const CONCURRENT_CALLS = 4;
const TURN_IN_FLIGHT = new Set(["active", "pending", "starting", "stopping"]);

/** Every thread the list shows: visible, not archived, not deleted. */
async function loadThreads(bb: BbPluginApi): Promise<ListedThread[]> {
  const byId = new Map<string, ListedThread>();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await bb.sdk.threads.list({
      archived: false,
      limit: PAGE_SIZE,
      offset,
    });
    for (const thread of page) {
      if (
        thread.visibility === "visible" &&
        thread.archivedAt === null &&
        thread.deletedAt === null
      )
        byId.set(thread.id, thread);
    }
    if (page.length < PAGE_SIZE) return [...byId.values()];
  }
}

function isWorking(thread: ListedThread): boolean {
  const { activity } = thread;
  return (
    TURN_IN_FLIGHT.has(thread.status) ||
    activity.activeWorkflowCount +
      activity.activeBackgroundAgentCount +
      activity.activeBackgroundCommandCount +
      activity.activePlanModeCount +
      activity.activeGoalCount >
      0
  );
}

function foldCard(members: readonly ListedThread[]): AutoSettleThread {
  return {
    lastActivityAt: Math.max(...members.map(lastActivityOf)),
    pinned: members.some((thread) => thread.pinnedAt !== null),
    hasPendingInteraction: members.some(
      (thread) => thread.hasPendingInteraction,
    ),
    hasQueuedWork: members.some((thread) => thread.queuedWork !== "none"),
    isWorking: members.some(isWorking),
  };
}

const pullRequestRows = z.record(
  z.string(),
  z
    .discriminatedUnion("outcome", [
      z.object({
        outcome: z.literal("available"),
        pullRequest: z.object({
          state: z.enum(["draft", "open", "merged", "closed"]),
          updatedAt: z.string(),
        }),
      }),
      z.object({ outcome: z.literal("absent") }),
      z.object({ outcome: z.literal("unavailable") }),
    ])
    .catch({ outcome: "unavailable" as const }),
);

async function mapLimited<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

/**
 * Pull requests come from bb's GitHub PR Status plugin, keyed by environment.
 * A batch that fails, and a row it cannot read or answers `unavailable`,
 * leaves those cards `unknown`, which changes nothing.
 */
async function loadPullRequests(
  bb: BbPluginApi,
  environmentIds: readonly string[],
): Promise<Map<string, PullRequestFacts>> {
  const facts = new Map<string, PullRequestFacts>();
  const batches: string[][] = [];
  for (let start = 0; start < environmentIds.length; start += KEYS_PER_CALL)
    batches.push(environmentIds.slice(start, start + KEYS_PER_CALL));
  await mapLimited(batches, CONCURRENT_CALLS, async (keys) => {
    try {
      const rows = await bb.sdk.plugins.callRpc({
        pluginId: PULL_REQUESTS_PLUGIN_ID,
        method: "pullRequests",
        input: { keys },
        outputSchema: pullRequestRows,
      });
      for (const [key, row] of Object.entries(rows)) {
        facts.set(
          key,
          row.outcome === "available"
            ? { outcome: "available", ...row.pullRequest }
            : row.outcome === "absent"
              ? row
              : { outcome: "unknown" },
        );
      }
    } catch (cause) {
      bb.log.warn(
        `could not read pull requests, leaving ${keys.length} environments as they are: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  });
  return facts;
}

type Queue = <T>(key: string, task: () => Promise<T>) => Promise<T>;

/**
 * Settles and unsettles cards on bb-sidebar's rule, writing only the cards
 * whose decision changed. Each write re-reads its park inside the record
 * queue, so a user's settle, snooze or keep made meanwhile wins. `evaluate`
 * joins a pass already running; `reevaluate` runs a fresh one after it, for
 * settings that changed mid-pass.
 */
export function createAutoSettle(
  bb: BbPluginApi,
  {
    queue,
    readSettings,
    onChanged,
  }: {
    queue: Queue;
    readSettings: () => Promise<AutoSettleSettings>;
    onChanged: () => void;
  },
): { evaluate: () => Promise<string[]>; reevaluate: () => Promise<string[]> } {
  const { kv } = bb.storage;

  const pass = async (): Promise<string[]> => {
    const settings = await readSettings();
    const [threads, captains, parks] = await Promise.all([
      loadThreads(bb),
      listRecords(kv, CAPTAIN_KEY_PREFIX, parseStoredCaptain, bb.log.warn),
      listRecords(kv, PARK_KEY_PREFIX, parseStoredPark, bb.log.warn),
    ]);
    const parkOf = new Map(parks.map((park) => [park.threadId, park]));
    const { roots, subtreeOf } = threadForest(
      threads,
      new Set(captains.map((record) => record.threadId)),
    );
    const cards = roots.map((root) => ({
      root,
      facts: foldCard([root, ...subtreeOf(root.id)]),
    }));
    const environmentIds = [
      ...new Set(
        cards.flatMap(({ root, facts }) =>
          root.environmentId !== null &&
          needsPullRequest(parkOf.get(root.id) ?? null, facts)
            ? [root.environmentId]
            : [],
        ),
      ),
    ];
    const pullRequests = await loadPullRequests(bb, environmentIds);
    const now = Date.now();

    const decide = (
      { root, facts }: (typeof cards)[number],
      park: Park | null,
    ): AutoSettleDecision =>
      decideAutoSettle({
        park,
        now,
        settings,
        thread: facts,
        pullRequest:
          root.environmentId === null
            ? { outcome: "absent" }
            : (pullRequests.get(root.environmentId) ?? { outcome: "unknown" }),
      });

    const changed: string[] = [];
    for (const card of cards) {
      const threadId = card.root.id;
      if (decide(card, parkOf.get(threadId) ?? null) === "keep") continue;
      const wrote = await queue(threadId, async () => {
        const key = parkKey(threadId);
        const decision = decide(card, parseStoredPark(await kv.get(key)));
        if (decision === "settle") {
          const record: ParkRecord = {
            threadId,
            kind: "settled",
            at: now,
            by: "auto",
          };
          await kv.set(key, record);
        } else if (decision === "unsettle") {
          await kv.delete(key);
        }
        return decision !== "keep";
      });
      if (wrote) changed.push(threadId);
    }
    if (changed.length > 0) onChanged();
    return changed;
  };

  let running: Promise<string[]> | null = null;
  const evaluate = (): Promise<string[]> => {
    running ??= pass().finally(() => {
      running = null;
    });
    return running;
  };
  const reevaluate = (): Promise<string[]> =>
    (running ?? Promise.resolve()).catch(() => undefined).then(evaluate);
  return { evaluate, reevaluate };
}
