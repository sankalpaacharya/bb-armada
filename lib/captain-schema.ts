import { z } from "zod";

import { EMPTY_REGISTRY, type CaptainRecord, type CaptainRegistry } from "./captains";
import { COLOR_IDS } from "./colors";
import { LOGOS } from "./logos";

export const captainRecordSchema = z.object({
  threadId: z.string().min(1).max(200),
  logo: z.enum(LOGOS),
  color: z.enum(COLOR_IDS),
  createdAt: z.string(),
}) satisfies z.ZodType<CaptainRecord>;

export const captainRegistrySchema = z.object({
  version: z.literal(1),
  captains: z.record(z.string(), captainRecordSchema),
}) satisfies z.ZodType<CaptainRegistry>;

const storedShape = z.object({ captains: z.record(z.string(), z.unknown()) });

export function parseRegistry(raw: unknown): CaptainRegistry {
  const stored = storedShape.safeParse(raw);
  if (!stored.success) return EMPTY_REGISTRY;
  const captains: CaptainRegistry["captains"] = {};
  for (const [threadId, candidate] of Object.entries(stored.data.captains)) {
    const record = captainRecordSchema.safeParse(candidate);
    if (record.success && record.data.threadId === threadId) captains[threadId] = record.data;
  }
  return { version: 1, captains };
}
