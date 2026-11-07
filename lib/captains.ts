import { z } from "zod";

import { COLOR_IDS } from "./colors";
import { LOGOS } from "./logos";

export const captainRecordSchema = z.object({
  threadId: z.string().min(1).max(200),
  logo: z.enum(LOGOS),
  color: z.enum(COLOR_IDS),
  createdAt: z.string(),
});

export const captainRegistrySchema = z.object({
  version: z.literal(1),
  captains: z.record(z.string(), captainRecordSchema),
});

export type CaptainRecord = z.infer<typeof captainRecordSchema>;
export type CaptainRegistry = z.infer<typeof captainRegistrySchema>;

export const REGISTRY_KEY = "captains";
export const REGISTRY_CHANNEL = "captains";

export const EMPTY_REGISTRY: CaptainRegistry = { version: 1, captains: {} };
