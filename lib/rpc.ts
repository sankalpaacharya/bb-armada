import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

import { captainRecordSchema, captainRegistrySchema } from "./captain-schema";
import { COLOR_IDS } from "./colors";
import { LOGOS } from "./logos";

const threadId = z.string().min(1).max(200);
const logo = z.enum(LOGOS);
const color = z.enum(COLOR_IDS);

export const rpcContract = defineRpcContract({
  captains_list: { input: z.null(), output: captainRegistrySchema },
  captains_create: {
    input: z.object({
      projectId: z.string().min(1).max(200),
      projectName: z.string().min(1).max(200),
      logo,
      color,
    }),
    output: captainRecordSchema,
  },
  captains_adopt: { input: z.object({ threadId, logo, color }), output: captainRecordSchema },
  captains_update: {
    input: z.object({ threadId, logo: logo.optional(), color: color.optional() }),
    output: captainRecordSchema,
  },
  captains_remove: { input: z.object({ threadId }), output: z.null() },
});
