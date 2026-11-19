import { z } from "zod";

/** bb ids for threads and projects. */
export const idSchema = z.string().min(1).max(200);

const SEED_MAX = 64;

const seedSchema = z.string().min(1).max(SEED_MAX);
const avatarImageSchema = z
  .string()
  .startsWith("data:image/svg+xml")
  .max(64 * 1024);

/**
 * A seeded face, or a logo with an optional custom image.
 * A logo avatar keeps a seed
 * for the face it shows while the logo loads or when the project has none.
 */
export const avatarSchema = z.discriminatedUnion("style", [
  z.strictObject({ style: z.literal("micah"), seed: seedSchema }),
  z.strictObject({
    style: z.literal("logo"),
    seed: seedSchema,
    image: avatarImageSchema.optional(),
  }),
]);

export type Avatar = z.infer<typeof avatarSchema>;

/** A captain's own folder under `~/.bb/captains`, as a slug. */
export const homeSchema = z
  .string()
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Not a home folder name");

export const captainRecordSchema = z.object({
  threadId: idSchema,
  avatar: avatarSchema,
  createdAt: z.string(),
  /** Absent on captains made before each had its own home; they use their project's. */
  home: homeSchema.optional(),
});

export type CaptainRecord = z.infer<typeof captainRecordSchema>;

/**
 * Stored records may predate avatars (a logo and colour) or carry a retired
 * style. A logo stays a logo; adventurer reads as Micah with the same seed; a
 * record without an avatar, or with an anime portrait, reads as Micah seeded
 * by its thread. The result is parsed again as a record, so one that still
 * does not fit is skipped here instead of failing the list's output check.
 */
const storedCaptainSchema = captainRecordSchema
  .extend({
    avatar: z
      .union([
        z.object({
          style: z.enum(["adventurer", "micah", "logo"]),
          seed: seedSchema,
          image: avatarImageSchema.optional(),
        }),
        z.object({ style: z.literal("anime") }),
      ])
      .optional(),
  })
  .transform(({ avatar, ...record }) => ({
    ...record,
    avatar: {
      style: avatar?.style === "logo" ? avatar.style : ("micah" as const),
      ...(avatar?.style === "logo"
        ? {
            ...(avatar.image === undefined ? {} : { image: avatar.image }),
          }
        : {}),
      seed:
        avatar !== undefined && "seed" in avatar
          ? avatar.seed
          : record.threadId.slice(0, SEED_MAX),
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
