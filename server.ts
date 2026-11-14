import path from "node:path";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

import { createAutoSettle } from "./lib/auto-settle";
import { captainSlug, freshHome, homeOf } from "./lib/captain-home";
import {
  adoptedInput,
  captainInput,
  instructionsChangedInput,
} from "./lib/captain-text";
import {
  CAPTAIN_KEY_PREFIX,
  LEGACY_CAPTAINS_BACKUP_KEY,
  LEGACY_CAPTAINS_KEY,
  captainKey,
  parseStoredCaptain,
  type CaptainRecord,
} from "./lib/captains";
import {
  HOMES_ROOT,
  createHomeReader,
  supervisorIdsOf,
} from "./lib/home-reader";
import { createInstructionsFile } from "./lib/instructions-file";
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
  type Created,
} from "./lib/rpc";
import { SETTINGS, logoSkipProjects, parseSettings } from "./lib/settings";

/** The queue key that makes new homes one at a time; no thread id looks like it. */
const HOME_CLAIM = "home claim";

/** A failed record write is retried after each wait, longer each time. */
const RECORD_BACKOFF_MS = [100, 400] as const;

const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

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
  const instructionsFile = createInstructionsFile(bb);
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

  const captainRecords = () =>
    listRecords(kv, CAPTAIN_KEY_PREFIX, parseStoredCaptain, bb.log.warn);

  const homeOfCaptain = async (captain: {
    threadId: string;
    project: string;
  }): Promise<string> =>
    homeOf(await findCaptain(captain.threadId), captain.project);

  /**
   * The project homes that captains from before per-captain homes use, so a
   * new captain never takes one, even before that captain made its folder.
   */
  const projectHomes = async (
    records: readonly CaptainRecord[],
  ): Promise<string[]> => {
    const legacy = records.filter((record) => record.home === undefined);
    if (legacy.length === 0) return [];
    let names: Map<string, string>;
    try {
      names = new Map(
        (await bb.sdk.projects.list()).map((project) => [
          project.id,
          project.name,
        ]),
      );
    } catch (cause) {
      bb.log.warn(`could not list projects: ${messageOf(cause)}`);
      return [];
    }
    const found = await Promise.all(
      legacy.map(async ({ threadId }) => {
        try {
          const { projectId } = await bb.sdk.threads.get({ threadId });
          const name = names.get(projectId);
          return name === undefined ? [] : [captainSlug(name)];
        } catch (cause) {
          bb.log.warn(
            `could not find captain ${threadId}'s project: ${messageOf(cause)}`,
          );
          return [];
        }
      }),
    );
    return found.flat();
  };

  /**
   * Makes a new captain's own empty home, named after it and numbered past
   * every folder on disk and every home a captain uses. One at a time, so two
   * new captains never get the same one.
   */
  const claimHome = (name: string): Promise<string> =>
    queue(HOME_CLAIM, async () => {
      const records = await captainRecords();
      const taken = new Set([
        // Every `tasks` folder is a task's, never a home, to the memory reader.
        "tasks",
        ...(await homes.taken()),
        ...records.flatMap(({ home }) => (home === undefined ? [] : [home])),
        ...(await projectHomes(records)),
      ]);
      const home = freshHome(name, taken);
      await bb.sdk.files.mkdir({
        path: path.join(HOMES_ROOT, home),
        recursive: true,
      });
      return home;
    });

  const savePark = (record: ParkRecord): Promise<ParkRecord> =>
    queue(record.threadId, async () => {
      await kv.set(parkKey(record.threadId), record);
      bb.rpc.experimental_invalidate([PARKS_TAG]);
      return record;
    });

  /**
   * Every auto-settle pass, the first one at start included, reads the
   * backlogs afresh and refreshes the homes reads when they changed, so a new
   * supervisor reaches the sidebar within one schedule.
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

  bb.rpc.register(rpcContract, {
    captains_list: captainRecords,

    captains_create: async ({
      projectId,
      projectName,
      name,
      avatar,
      instructions = "",
    }): Promise<Created> => {
      const hasInstructions = instructions.trim() !== "";
      const home = await claimHome(name);
      // Written first, so the captain finds them on its first turn.
      if (hasInstructions) {
        await instructionsFile.write(home, instructions);
        bb.rpc.experimental_invalidate([HOMES_TAG]);
      }
      const thread = await bb.sdk.threads.spawn({
        projectId,
        environment: { type: "project-default" },
        title: name,
        input: captainInput(projectName, home, { hasInstructions }),
      });
      const record: CaptainRecord = {
        threadId: thread.id,
        avatar,
        createdAt: new Date().toISOString(),
        home,
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
          return { outcome: "unrecorded", threadId: thread.id, home, reason };
        }
      }
    },

    captains_adopt: ({ threadId, avatar, createdAt, name, home: given }) =>
      queue(threadId, async () => {
        const current = await findCaptain(threadId);
        // A removed captain made one again gets back the home it owns.
        const owned =
          current === null && given === undefined
            ? (await homes.backlogs()).find(
                ({ captainId }) => captainId === threadId,
              )?.home
            : undefined;
        const fresh =
          current === null && given === undefined && owned === undefined;
        const home = fresh
          ? await claimHome(name)
          : (current?.home ?? given ?? owned);
        const record: CaptainRecord = {
          threadId,
          avatar,
          createdAt: current?.createdAt ?? createdAt,
          ...(home === undefined ? {} : { home }),
        };
        await kv.set(captainKey(threadId), record);
        await kv.delete(parkKey(threadId));
        bb.rpc.experimental_invalidate([CAPTAINS_TAG, PARKS_TAG]);
        if (fresh && home !== undefined)
          await bb.sdk.threads
            .send({
              threadId,
              mode: "queue-if-active",
              input: adoptedInput(home),
            })
            .catch((cause: unknown) =>
              bb.log.warn(
                `could not tell captain ${threadId} where its home is: ${messageOf(cause)}`,
              ),
            );
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

    captain_home: async (captain) => homes.home(await homeOfCaptain(captain)),

    captain_instructions: async (captain) =>
      instructionsFile.read(await homeOfCaptain(captain)),

    captain_instructions_save: async ({ instructions, ...captain }) => {
      const { threadId } = captain;
      await instructionsFile.write(await homeOfCaptain(captain), instructions);
      bb.rpc.experimental_invalidate([HOMES_TAG]);
      try {
        await bb.sdk.threads.send({
          threadId,
          mode: "queue-if-active",
          input: instructionsChangedInput(),
        });
        return { told: true };
      } catch (cause) {
        bb.log.warn(
          `could not tell captain ${threadId} its instructions changed: ${messageOf(cause)}`,
        );
        return { told: false };
      }
    },

    captain_supervisors: async () => supervisorIdsOf(await homes.backlogs()),

    project_logos: () => logos.logos(),
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
