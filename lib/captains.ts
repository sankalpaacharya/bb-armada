import { z } from "zod";

export const threadIdSchema = z.string().min(1).max(200);

export const avatarSchema = z.object({
  style: z.literal("micah"),
  seed: z.string().min(1).max(64),
});

export type Avatar = z.infer<typeof avatarSchema>;

export const captainRecordSchema = z.object({
  threadId: threadIdSchema,
  avatar: avatarSchema,
  createdAt: z.string(),
});

export type CaptainRecord = z.infer<typeof captainRecordSchema>;

const storedAvatarSchema = z.object({
  style: z.enum(["adventurer", "micah"]),
  seed: avatarSchema.shape.seed,
});

/**
 * Stored records may predate avatars (a logo and colour, seeded by their thread)
 * or carry the retired Adventurer style; both read as Micah and keep their seed.
 */
const storedCaptainSchema = z
  .object({
    threadId: threadIdSchema,
    avatar: storedAvatarSchema.optional(),
    createdAt: z.string(),
  })
  .transform(
    ({ threadId, avatar, createdAt }): CaptainRecord => ({
      threadId,
      avatar: { style: "micah", seed: avatar?.seed ?? threadId },
      createdAt,
    }),
  );

export const CAPTAIN_KEY_PREFIX = "captain:";
export const LEGACY_CAPTAINS_KEY = "captains";

export const captainKey = (threadId: string): string =>
  `${CAPTAIN_KEY_PREFIX}${threadId}`;

export function parseStoredCaptain(raw: unknown): CaptainRecord | null {
  const parsed = storedCaptainSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
