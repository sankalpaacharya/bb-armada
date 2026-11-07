import { z } from "zod";

export const threadIdSchema = z.string().min(1).max(200);

export const avatarSchema = z.object({
  style: z.literal("adventurer"),
  seed: z.string().min(1).max(64),
});

export type Avatar = z.infer<typeof avatarSchema>;

export const captainRecordSchema = z.object({
  threadId: threadIdSchema,
  avatar: avatarSchema,
  createdAt: z.string(),
});

export type CaptainRecord = z.infer<typeof captainRecordSchema>;

/** Records from before avatars carried a logo and colour; they get an avatar seeded by their thread. */
const storedCaptainSchema = z
  .object({
    threadId: threadIdSchema,
    avatar: avatarSchema.optional(),
    createdAt: z.string(),
  })
  .transform(
    ({ threadId, avatar, createdAt }): CaptainRecord => ({
      threadId,
      avatar: avatar ?? { style: "adventurer", seed: threadId },
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
