import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

import { captainHomeSchema } from "./captain-home";
import { INSTRUCTIONS_MAX } from "./captain-instructions";
import {
  avatarSchema,
  captainRecordSchema,
  homeSchema,
  idSchema,
} from "./captains";
import { parkRecordSchema } from "./lifecycle";

export const CAPTAINS_TAG = "captains";
export const PARKS_TAG = "parks";
export const HOMES_TAG = "homes";
export const LOGOS_TAG = "logos";

const threadId = idSchema;
const avatar = avatarSchema;
/** A captain by its thread, and its project's name for a captain without a home of its own. */
const captain = { threadId, project: z.string().min(1).max(200) };
const name = z.string().trim().min(1).max(80);
/**
 * Park and adopt writes carry the time the user acted, stamped once by the
 * client, so the optimistic prediction and the stored record agree.
 */
const time = z.number().int().positive();
/** What the user wants a captain to be; blank means none. */
const instructions = z.string().max(INSTRUCTIONS_MAX);

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
    /** The home its first message named, for the retry to record. */
    home: homeSchema,
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
      name,
      avatar,
      /** Written to the captain's new home before its thread starts. */
      instructions: instructions.optional(),
    }),
    output: createdSchema,
  },
  captains_adopt: {
    /**
     * `createdAt` and `name` apply only when the thread is not a captain
     * already; `name` names its new home. `home` records the one a create
     * already gave the thread, instead of making another.
     */
    input: z.strictObject({
      threadId,
      avatar,
      createdAt: z.iso.datetime(),
      name,
      home: homeSchema.optional(),
    }),
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

  captain_home: {
    input: z.strictObject(captain),
    output: captainHomeSchema,
    tags: () => [HOMES_TAG],
  },
  /** The user's instructions in a captain's `captain.md`, "" when none. */
  captain_instructions: {
    input: z.strictObject(captain),
    output: z.string(),
    tags: () => [HOMES_TAG],
  },
  /**
   * Replaces the instructions, or removes them when blank, then tells the
   * captain to re-read them; `told` says whether it was.
   */
  captain_instructions_save: {
    input: z.strictObject({ ...captain, instructions }),
    output: z.object({ told: z.boolean() }),
  },
  /** Every captain home's supervisor thread. */
  captain_supervisors: {
    input: z.null(),
    output: z.array(threadId),
    tags: () => [HOMES_TAG],
  },
  /** Each project's logo as an image data URI; a project without one is absent. */
  project_logos: {
    input: z.null(),
    output: z.record(idSchema, z.string().startsWith("data:image/")),
    tags: () => [LOGOS_TAG],
  },
});
