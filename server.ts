import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

import { createAutoSettle } from "./lib/auto-settle";
import { captainInput } from "./lib/captain-text";
import {
  CAPTAIN_KEY_PREFIX,
  LEGACY_CAPTAINS_BACKUP_KEY,
  LEGACY_CAPTAINS_KEY,
  captainKey,
  parseStoredCaptain,
  type CaptainRecord,
} from "./lib/captains";
import { createHomeReader, supervisorIdsOf } from "./lib/home-reader";
import { listRecords, queueByKey } from "./lib/kv-records";
import {
  PARK_KEY_PREFIX,
  parkKey,
  parseStoredPark,
  type ParkRecord,
} from "./lib/lifecycle";
import { createLogoReader } from "./lib/project-logos";
import {
  CAPTAINS_TAG,
  HOMES_TAG,
  LOGOS_TAG,
  PARKS_TAG,
  rpcContract,
  stepsTag,
  type Created,
} from "./lib/rpc";
import { SETTINGS, logoSkipProjects, parseSettings } from "./lib/settings";
import { buildThreadSteps, focusTurn, outputOfRow } from "./lib/steps";

/** A failed record write is retried after each wait, longer each time. */
const RECORD_BACKOFF_MS = [100, 400] as const;

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/** Thread statuses with a turn under way. */
const RUNNING_STATUSES = new Set(["active", "starting", "pending"]);

/** Thread events that only stream text or counters, and so change no step. */
const DELTA_EVENTS = new Set([
  "item/agentMessage/delta",
  "item/reasoning/summaryTextDelta",
  "item/reasoning/textDelta",
  "item/commandExecution/outputDelta",
  "item/fileChange/outputDelta",
  "item/plan/delta",
  "thread/tokenUsage/updated",
  "thread/contextWindowUsage/updated",
  "provider/rateLimits/updated",
  "item/toolCall/progress",
  "item/mcpToolCall/progress",
  "item/backgroundTask/progress",
  "turn/diff/updated",
]);

type TimelineRead = Extract<
  Awaited<ReturnType<BbPluginApi["sdk"]["threads"]["timeline"]>>,
  { rows: unknown }
>;
type TimelineRow = TimelineRead["rows"][number];

/** Enough pages for the longest Steps list, should a thread read short. */
const MAX_TIMELINE_PAGES = 40;

/** Changes to one thread within this window refresh its steps once. */
const STEPS_COALESCE_MS = 700;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const legacyRegistrySchema = z.object({
  captains: z.record(z.string(), z.unknown()),
});

/**
 * Moves records out of the old single key. The raw value is copied aside
 * first, so records it cannot read are not lost with the key.
 */
async function migrateLegacyCaptains(bb: BbPluginApi): Promise<void> {
  const { kv } = bb.storage;
  const raw = await kv.get<unknown>(LEGACY_CAPTAINS_KEY);
  if (raw === undefined) return;
  await kv.set(LEGACY_CAPTAINS_BACKUP_KEY, raw);
  const legacy = legacyRegistrySchema.safeParse(raw);
  if (legacy.success) {
    for (const [threadId, candidate] of Object.entries(legacy.data.captains)) {
      const record = parseStoredCaptain(candidate);
      if (record === null || record.threadId !== threadId) {
        bb.log.warn(`dropping unreadable legacy captain ${threadId}`);
        continue;
      }
      await kv.set(captainKey(threadId), record);
    }
  } else {
    bb.log.warn("dropping unreadable legacy captain registry");
  }
  await kv.delete(LEGACY_CAPTAINS_KEY);
}

export default async function plugin(bb: BbPluginApi) {
  const { kv } = bb.storage;
  try {
    await migrateLegacyCaptains(bb);
  } catch (cause) {
    bb.log.error(
      `could not move captains out of the old key, will retry on the next start: ${messageOf(cause)}`,
    );
  }
  const queue = queueByKey();
  const settings = bb.settings.define(SETTINGS);
  const homes = createHomeReader(bb);
  const logos = createLogoReader(bb, async () =>
    logoSkipProjects(await settings.get()),
  );

  const findCaptain = async (threadId: string): Promise<CaptainRecord | null> =>
    parseStoredCaptain(await kv.get<unknown>(captainKey(threadId)));

  const saveCaptain = async (record: CaptainRecord): Promise<CaptainRecord> => {
    await kv.set(captainKey(record.threadId), record);
    bb.rpc.experimental_invalidate([CAPTAINS_TAG]);
    return record;
  };

  const savePark = (record: ParkRecord): Promise<ParkRecord> =>
    queue(record.threadId, async () => {
      await kv.set(parkKey(record.threadId), record);
      bb.rpc.experimental_invalidate([PARKS_TAG]);
      return record;
    });

  /**
   * Every auto-settle pass, the first one at start included, reads the
   * backlogs afresh and refreshes the homes reads when they changed, so a new
   * supervisor or decision reaches the sidebar within one schedule.
   */
  let backlogsSeen: string | null = null;
  const readSupervisors = async (): Promise<ReadonlySet<string>> => {
    const backlogs = await homes.backlogs();
    const seen = JSON.stringify(backlogs);
    if (seen !== backlogsSeen) {
      backlogsSeen = seen;
      bb.rpc.experimental_invalidate([HOMES_TAG]);
    }
    return new Set(supervisorIdsOf(backlogs));
  };

  const { evaluate, reevaluate } = createAutoSettle(bb, {
    queue,
    readSettings: async () => parseSettings(await settings.get()).autoSettle,
    readSupervisors,
    onChanged: () => bb.rpc.experimental_invalidate([PARKS_TAG]),
  });
  const inBackground = (run: () => Promise<unknown>) => () => {
    run().catch((cause: unknown) =>
      bb.log.warn(`auto-settle failed: ${messageOf(cause)}`),
    );
  };

  /** bb caps one read, so older history comes back a page at a time. */
  const readTimeline = async (threadId: string, segments: number) => {
    const byId = new Map<string, TimelineRow>();
    let older: { anchorId: string; anchorSeq: number } | null = null;
    let rows: TimelineRow[] = [];
    let read = 0;
    for (let page = 0; page < MAX_TIMELINE_PAGES; page += 1) {
      const timeline: TimelineRead = await bb.sdk.threads.timeline({
        threadId,
        includeNestedRows: "true",
        segmentLimit: String(segments - read),
        ...(older === null
          ? {}
          : {
              beforeAnchorId: older.anchorId,
              beforeAnchorSeq: String(older.anchorSeq),
            }),
      });
      for (const row of timeline.timelinePage?.olderRowUpdates ?? [])
        if (byId.has(row.id)) byId.set(row.id, row);
      rows = [...timeline.rows, ...rows];
      for (const row of timeline.rows) byId.set(row.id, row);
      older = timeline.timelinePage?.olderCursor ?? null;
      read += timeline.timelinePage?.returnedSegmentCount ?? segments;
      if (older === null || read >= segments) break;
    }
    const seen = new Set<string>();
    const merged = rows.flatMap((row) => {
      if (seen.has(row.id)) return [];
      seen.add(row.id);
      return [byId.get(row.id) ?? row];
    });
    return { rows: merged, hasOlder: older !== null };
  };

  bb.rpc.register(rpcContract, {
    captains_list: () =>
      listRecords(kv, CAPTAIN_KEY_PREFIX, parseStoredCaptain, bb.log.warn),

    captains_create: async ({
      projectId,
      projectName,
      name,
      avatar,
    }): Promise<Created> => {
      const thread = await bb.sdk.threads.spawn({
        projectId,
        environment: { type: "project-default" },
        title: name,
        input: captainInput(projectName),
      });
      const record: CaptainRecord = {
        threadId: thread.id,
        avatar,
        createdAt: new Date().toISOString(),
      };
      for (let attempt = 0; ; attempt += 1) {
        try {
          return {
            outcome: "recorded",
            record: await queue(record.threadId, () => saveCaptain(record)),
          };
        } catch (cause) {
          const wait = RECORD_BACKOFF_MS[attempt];
          if (wait !== undefined) {
            await sleep(wait);
            continue;
          }
          const reason = messageOf(cause);
          bb.log.error(`could not record captain thread ${thread.id}: ${reason}`);
          return { outcome: "unrecorded", threadId: thread.id, reason };
        }
      }
    },

    captains_adopt: ({ threadId, avatar, createdAt }) =>
      queue(threadId, async () => {
        const current = await findCaptain(threadId);
        const record: CaptainRecord = {
          threadId,
          avatar,
          createdAt: current?.createdAt ?? createdAt,
        };
        await kv.set(captainKey(threadId), record);
        await kv.delete(parkKey(threadId));
        bb.rpc.experimental_invalidate([CAPTAINS_TAG, PARKS_TAG]);
        return record;
      }),

    captains_update: ({ threadId, avatar }) =>
      queue(threadId, async () => {
        const current = await findCaptain(threadId);
        if (current === null)
          throw new Error(`Thread ${threadId} is not a captain`);
        return saveCaptain({ ...current, avatar });
      }),

    captains_remove: ({ threadId }) =>
      queue(threadId, async () => {
        await kv.delete(captainKey(threadId));
        await kv.delete(parkKey(threadId));
        bb.rpc.experimental_invalidate([CAPTAINS_TAG, PARKS_TAG]);
        return null;
      }),

    parks_list: () =>
      listRecords(kv, PARK_KEY_PREFIX, parseStoredPark, bb.log.warn),

    parks_settle: ({ threadId, at }) =>
      savePark({ threadId, kind: "settled", at, by: "user" }),

    parks_snooze: ({ threadId, at, until }) => {
      if (until <= at) throw new Error("A snooze must end after it starts");
      return savePark({ threadId, kind: "snoozed", at, until });
    },

    parks_unpark: ({ threadId }) =>
      queue(threadId, async () => {
        await kv.delete(parkKey(threadId));
        bb.rpc.experimental_invalidate([PARKS_TAG]);
        return null;
      }),

    parks_keep: ({ threadId, at }) => savePark({ threadId, kind: "kept", at }),

    parks_evaluate: async () => ({ changed: await evaluate() }),

    captain_home: ({ project }) => homes.home(project),

    captain_supervisors: async () => supervisorIdsOf(await homes.backlogs()),

    project_logos: () => logos.logos(),

    thread_steps: async ({ threadId, turns, turnId }) => {
      const [thread, timeline] = await Promise.all([
        bb.sdk.threads.get({ threadId }),
        readTimeline(threadId, turns + 1),
      ]);
      const steps = buildThreadSteps(timeline.rows, {
        threadId,
        running: RUNNING_STATUSES.has(thread.status),
        now: Date.now(),
        hasOlder: timeline.hasOlder,
      });
      return focusTurn(steps, turnId, turns);
    },

    step_output: async ({ threadId, stepId, turns }) => {
      const { rows } = await readTimeline(threadId, turns + 1);
      return { output: outputOfRow(rows, stepId) };
    },
  });

  const changedThreads = new Set<string>();
  let stepsTimer: ReturnType<typeof setTimeout> | null = null;
  const unsubscribe = bb.sdk.subscribe({
    event: "thread:changed",
    callback: (event) => {
      const types = event.metadata?.eventTypes;
      if (types?.length && types.every((type) => DELTA_EVENTS.has(type)))
        return;
      if (event.id === undefined) return;
      changedThreads.add(event.id);
      stepsTimer ??= setTimeout(() => {
        stepsTimer = null;
        const tags = [...changedThreads].map(stepsTag);
        changedThreads.clear();
        bb.rpc.experimental_invalidate(tags);
      }, STEPS_COALESCE_MS);
    },
  });
  bb.onDispose(() => {
    unsubscribe();
    if (stepsTimer !== null) clearTimeout(stepsTimer);
  });

  bb.background.schedule("auto-settle", "*/5 * * * *", async () => {
    await evaluate();
  });
  bb.background.schedule("project-logos", "*/5 * * * *", async () => {
    if (await logos.refresh()) bb.rpc.experimental_invalidate([LOGOS_TAG]);
  });
  settings.onChange(inBackground(reevaluate));
  inBackground(evaluate)();

  bb.log.info("loaded");
}
