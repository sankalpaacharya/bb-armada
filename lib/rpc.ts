import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

import { avatarSchema, captainRecordSchema, idSchema } from "./captains";
import { parkRecordSchema } from "./lifecycle";

export const CAPTAINS_TAG = "captains";
export const PARKS_TAG = "parks";

const threadId = idSchema;
const avatar = avatarSchema;
/**
 * Park and adopt writes carry the time the user acted, stamped once by the
 * client, so the optimistic prediction and the stored record agree.
 */
const time = z.number().int().positive();

/**
 * A create spawns the thread first, so it can end with a thread that is
 * running but not recorded. The client then records that thread instead of
 * spawning another.
 */
const createdSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("recorded"), record: captainRecordSchema }),
  z.object({
    outcome: z.literal("unrecorded"),
    threadId,
    reason: z.string(),
  }),
]);

export type Created = z.infer<typeof createdSchema>;

export const rpcContract = defineRpcContract({
  captains_list: {
    input: z.null(),
    output: z.array(captainRecordSchema),
    tags: () => [CAPTAINS_TAG],
  },
  captains_create: {
    input: z.strictObject({
      projectId: idSchema,
      projectName: z.string().min(1).max(200),
      name: z.string().trim().min(1).max(80),
      avatar,
    }),
    output: createdSchema,
  },
  captains_adopt: {
    /** `createdAt` applies only when the thread is not a captain already. */
    input: z.strictObject({ threadId, avatar, createdAt: z.iso.datetime() }),
    output: captainRecordSchema,
  },
  captains_update: {
    input: z.strictObject({ threadId, avatar }),
    output: captainRecordSchema,
  },
  captains_remove: { input: z.strictObject({ threadId }), output: z.null() },

  parks_list: {
    input: z.null(),
    output: z.array(parkRecordSchema),
    tags: () => [PARKS_TAG],
  },
  parks_settle: {
    input: z.strictObject({ threadId, at: time }),
    output: parkRecordSchema,
  },
  parks_snooze: {
    input: z.strictObject({ threadId, at: time, until: time }),
    output: parkRecordSchema,
  },
  parks_unpark: { input: z.strictObject({ threadId }), output: z.null() },
  /** "Move to active": a user override that auto-settle never undoes. */
  parks_keep: {
    input: z.strictObject({ threadId, at: time }),
    output: parkRecordSchema,
  },
  /** Runs auto-settle now; the threads whose park it wrote. */
  parks_evaluate: {
    input: z.null(),
    output: z.object({ changed: z.array(threadId) }),
  },
});
