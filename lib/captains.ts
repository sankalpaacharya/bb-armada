import { z } from "zod";

/** bb ids for threads and projects. */
export const idSchema = z.string().min(1).max(200);

export const PORTRAIT_COUNT = 10;

export const AVATAR_BACKGROUNDS = [
  { name: "Sky", color: "#b6e3f4" },
  { name: "Lilac", color: "#c0aede" },
  { name: "Periwinkle", color: "#d1d4f9" },
  { name: "Blush", color: "#ffd5dc" },
  { name: "Peach", color: "#ffdfbf" },
  { name: "Mint", color: "#c1f4c5" },
] as const;

export const avatarSchema = z.strictObject({
  style: z.literal("anime"),
  character: z
    .number()
    .int()
    .min(0)
    .max(PORTRAIT_COUNT - 1),
  background: z
    .number()
    .int()
    .min(0)
    .max(AVATAR_BACKGROUNDS.length - 1),
});

export type Avatar = z.infer<typeof avatarSchema>;

export const captainRecordSchema = z.object({
  threadId: idSchema,
  avatar: avatarSchema,
  createdAt: z.string(),
});

export type CaptainRecord = z.infer<typeof captainRecordSchema>;

/** The same seed always picks the same portrait and background. */
export function avatarFromSeed(seed: string): Avatar {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619) >>> 0;
  }
  return {
    style: "anime",
    character: hash % PORTRAIT_COUNT,
    background: (hash >>> 8) % AVATAR_BACKGROUNDS.length,
  };
}

const retiredAvatarSchema = z.object({
  style: z.enum(["adventurer", "micah"]),
  seed: z.string().min(1),
});

/**
 * Stored records may predate avatars (a logo and colour) or carry a retired
 * DiceBear style; both get a portrait picked by their seed, or by their thread
 * when they have none. The result is parsed again as a record, so one that
 * still does not fit is skipped here instead of failing the list's output check.
 */
const storedCaptainSchema = captainRecordSchema
  .extend({
    avatar: z.union([avatarSchema, retiredAvatarSchema]).optional(),
  })
  .transform(({ avatar, ...record }) => ({
    ...record,
    avatar:
      avatar?.style === "anime"
        ? avatar
        : avatarFromSeed(avatar?.seed ?? record.threadId),
  }))
  .pipe(captainRecordSchema);

export const CAPTAIN_KEY_PREFIX = "captain:";
export const LEGACY_CAPTAINS_KEY = "captains";
export const LEGACY_CAPTAINS_BACKUP_KEY = "legacy-captains-backup";

export const captainKey = (threadId: string): string =>
  `${CAPTAIN_KEY_PREFIX}${threadId}`;

export function parseStoredCaptain(raw: unknown): CaptainRecord | null {
  const parsed = storedCaptainSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
