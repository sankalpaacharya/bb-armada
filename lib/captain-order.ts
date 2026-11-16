import { z } from "zod";

import { idSchema, type CaptainRecord } from "./captains";

export const CAPTAIN_ORDER_KEY = "captain-order";
export const captainOrderSchema = z.array(idSchema);

export function orderedCaptains(
  records: readonly CaptainRecord[],
  order: readonly string[],
): CaptainRecord[] {
  const positions = new Map(order.map((id, index) => [id, index]));
  return [...records].sort(
    (a, b) =>
      (positions.get(a.threadId) ?? order.length) -
        (positions.get(b.threadId) ?? order.length) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.threadId.localeCompare(b.threadId),
  );
}

/** A relative move preserves other clients' changes and newly added captains. */
export function moveCaptain(
  records: readonly CaptainRecord[],
  threadId: string,
  beforeThreadId: string | null,
): CaptainRecord[] {
  const captain = records.find((record) => record.threadId === threadId);
  if (captain === undefined)
    throw new Error(`Thread ${threadId} is not a captain`);
  if (beforeThreadId === threadId) return [...records];
  const rest = records.filter((record) => record.threadId !== threadId);
  const index =
    beforeThreadId === null
      ? rest.length
      : rest.findIndex((record) => record.threadId === beforeThreadId);
  if (index < 0) throw new Error(`Thread ${beforeThreadId} is not a captain`);
  rest.splice(index, 0, captain);
  return rest;
}
