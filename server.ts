import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

import { captainPrompt, captainTitle } from "./lib/captain-text";
import {
  CAPTAIN_KEY_PREFIX,
  LEGACY_CAPTAINS_KEY,
  captainKey,
  parseStoredCaptain,
  type CaptainRecord,
} from "./lib/captains";
import { listRecords } from "./lib/kv-records";
import { CAPTAINS_TAG, rpcContract } from "./lib/rpc";

const RECORD_ATTEMPTS = 3;

const legacyRegistrySchema = z.object({
  captains: z.record(z.string(), z.unknown()),
});

async function migrateLegacyCaptains(bb: BbPluginApi): Promise<void> {
  const { kv } = bb.storage;
  const raw = await kv.get<unknown>(LEGACY_CAPTAINS_KEY);
  if (raw === undefined) return;
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
  await migrateLegacyCaptains(bb);

  const list = () =>
    listRecords(kv, CAPTAIN_KEY_PREFIX, parseStoredCaptain, bb.log.warn);

  const find = async (threadId: string): Promise<CaptainRecord | null> =>
    parseStoredCaptain(await kv.get<unknown>(captainKey(threadId)));

  const save = async (record: CaptainRecord): Promise<CaptainRecord> => {
    await kv.set(captainKey(record.threadId), record);
    bb.rpc.experimental_invalidate([CAPTAINS_TAG]);
    return record;
  };

  bb.rpc.register(rpcContract, {
    captains_list: list,

    captains_create: async ({ projectId, projectName, logo, color }) => {
      const thread = await bb.sdk.threads.spawn({
        projectId,
        environment: { type: "project-default" },
        title: captainTitle(projectName),
        prompt: captainPrompt(projectName),
      });
      const record: CaptainRecord = {
        threadId: thread.id,
        logo,
        color,
        createdAt: new Date().toISOString(),
      };
      let failure: unknown;
      for (let attempt = 0; attempt < RECORD_ATTEMPTS; attempt += 1) {
        try {
          return await save(record);
        } catch (cause) {
          failure = cause;
        }
      }
      const reason = failure instanceof Error ? failure.message : String(failure);
      throw new Error(
        `Started captain thread ${thread.id} but could not record it (${reason}). Use "Make captain" on that thread.`,
      );
    },

    captains_adopt: async ({ threadId, logo, color }) => {
      const createdAt =
        (await find(threadId))?.createdAt ?? new Date().toISOString();
      return save({ threadId, logo, color, createdAt });
    },

    captains_update: async ({ threadId, logo, color }) => {
      const current = await find(threadId);
      if (current === null)
        throw new Error(`Thread ${threadId} is not a captain`);
      return save({
        ...current,
        logo: logo ?? current.logo,
        color: color ?? current.color,
      });
    },

    captains_remove: async ({ threadId }) => {
      await kv.delete(captainKey(threadId));
      bb.rpc.experimental_invalidate([CAPTAINS_TAG]);
      return null;
    },
  });

  bb.log.info("loaded");
}
