import { z } from "zod";

/** bb ids for threads and projects. */
export const idSchema = z.string().min(1).max(200);

const SEED_MAX = 64;

export const avatarSchema = z.strictObject({
  style: z.literal("micah"),
  seed: z.string().min(1).max(SEED_MAX),
});

export type Avatar = z.infer<typeof avatarSchema>;

export const captainRecordSchema = z.object({
  threadId: idSchema,
  avatar: avatarSchema,
  createdAt: z.string(),
});

export type CaptainRecord = z.infer<typeof captainRecordSchema>;

/**
 * Stored records may predate avatars (a logo and colour, seeded by their
 * thread) or carry the retired Adventurer style; both read as Micah and keep
 * their seed. The result is parsed again as a record, so one that still does
 * not fit is skipped here instead of failing the list's output check.
 */
const storedCaptainSchema = captainRecordSchema
  .extend({
    avatar: z
      .object({
        style: z.enum(["adventurer", "micah"]),
        seed: avatarSchema.shape.seed,
      })
      .optional(),
  })
  .transform(({ avatar, ...record }) => ({
    ...record,
    avatar: {
      style: "micah" as const,
      seed: avatar?.seed ?? record.threadId.slice(0, SEED_MAX),
    },
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
