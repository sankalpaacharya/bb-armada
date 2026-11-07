import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

import { captainRecordSchema, threadIdSchema } from "./captains";
import { COLOR_IDS } from "./colors";
import { parkRecordSchema } from "./lifecycle";
import { LOGOS } from "./logos";

export const CAPTAINS_TAG = "captains";
export const PARKS_TAG = "parks";

const threadId = threadIdSchema;
const logo = z.enum(LOGOS);
const color = z.enum(COLOR_IDS);

export const rpcContract = defineRpcContract({
  captains_list: {
    input: z.null(),
    output: z.array(captainRecordSchema),
    tags: () => [CAPTAINS_TAG],
  },
  captains_create: {
    input: z.object({
      projectId: z.string().min(1).max(200),
      projectName: z.string().min(1).max(200),
      logo,
      color,
    }),
    output: captainRecordSchema,
  },
  captains_adopt: {
    input: z.object({ threadId, logo, color }),
    output: captainRecordSchema,
  },
  captains_update: {
    input: z.object({
      threadId,
      logo: logo.optional(),
      color: color.optional(),
    }),
    output: captainRecordSchema,
  },
  captains_remove: { input: z.object({ threadId }), output: z.null() },

  parks_list: {
    input: z.null(),
    output: z.array(parkRecordSchema),
    tags: () => [PARKS_TAG],
  },
  parks_settle: { input: z.object({ threadId }), output: parkRecordSchema },
  parks_snooze: {
    input: z.object({ threadId, until: z.number().int().positive() }),
    output: parkRecordSchema,
  },
  parks_unpark: { input: z.object({ threadId }), output: z.null() },
});
