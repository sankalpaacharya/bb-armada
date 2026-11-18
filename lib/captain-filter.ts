import { z } from "zod";

import type { CaptainEntry } from "./model";

const captainFilterSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all") }),
  z.object({ kind: z.literal("project"), projectId: z.string() }),
]);

export type CaptainFilter = z.infer<typeof captainFilterSchema>;
export const ALL_CAPTAINS: CaptainFilter = { kind: "all" };

export function parseCaptainFilter(raw: string): CaptainFilter | undefined {
  const result = captainFilterSchema.safeParse(JSON.parse(raw));
  return result.success ? result.data : undefined;
}

export function filterCaptains(
  captains: readonly CaptainEntry[],
  filter: CaptainFilter,
): readonly CaptainEntry[] {
  switch (filter.kind) {
    case "all":
      return captains;
    case "project":
      return captains.filter((entry) => entry.thread.projectId === filter.projectId);
  }
}
