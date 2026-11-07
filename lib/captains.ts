import { z } from "zod";

import { COLOR_IDS, DEFAULT_COLOR } from "./colors";
import { DEFAULT_LOGO, LOGOS } from "./logos";

export const threadIdSchema = z.string().min(1).max(200);

export const captainRecordSchema = z.object({
  threadId: threadIdSchema,
  logo: z.enum(LOGOS),
  color: z.enum(COLOR_IDS),
  createdAt: z.string(),
});

export type CaptainRecord = z.infer<typeof captainRecordSchema>;

const storedCaptainSchema = captainRecordSchema.extend({
  logo: z.enum(LOGOS).catch(DEFAULT_LOGO),
  color: z.enum(COLOR_IDS).catch(DEFAULT_COLOR),
});

export const CAPTAIN_KEY_PREFIX = "captain:";
export const LEGACY_CAPTAINS_KEY = "captains";

export const captainKey = (threadId: string): string =>
  `${CAPTAIN_KEY_PREFIX}${threadId}`;

export function parseStoredCaptain(raw: unknown): CaptainRecord | null {
  const parsed = storedCaptainSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
