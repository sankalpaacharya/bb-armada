import { useEffect, useRef } from "react";
import { experimental_useRpcMutation } from "@get-bb/plugin-sdk/app";

import type { ParkRecord } from "@/lib/lifecycle";
import { rpcContract } from "@/lib/rpc";
import { toastFailure } from "@/lib/toast";

export type ParkActions = {
  settle: (threadId: string) => void;
  snooze: (threadId: string, until: number) => void;
  unpark: (threadId: string) => void;
};

/** A thread has one park at most; a new one replaces it. */
const withPark =
  (park: ParkRecord) =>
  (current: readonly ParkRecord[]): ParkRecord[] => [
    ...current.filter((record) => record.threadId !== park.threadId),
    park,
  ];

export function useParkActions(): ParkActions {
  const settle = experimental_useRpcMutation({
    contract: rpcContract,
    method: "parks_settle",
    optimistic: ({ threadId, at }, cache) =>
      cache.update("parks_list", null, withPark({ threadId, kind: "settled", at })),
  });
  const snooze = experimental_useRpcMutation({
    contract: rpcContract,
    method: "parks_snooze",
    optimistic: ({ threadId, at, until }, cache) =>
      cache.update(
        "parks_list",
        null,
        withPark({ threadId, kind: "snoozed", at, until }),
      ),
  });
  const unpark = experimental_useRpcMutation({
    contract: rpcContract,
    method: "parks_unpark",
    optimistic: ({ threadId }, cache) =>
      cache.update("parks_list", null, (current) =>
        current.filter((record) => record.threadId !== threadId),
      ),
  });
  return {
    settle: (threadId) => {
      settle
        .mutate({ threadId, at: Date.now() })
        .catch((cause: unknown) => toastFailure("Could not settle", cause));
    },
    snooze: (threadId, until) => {
      snooze
        .mutate({ threadId, at: Date.now(), until })
        .catch((cause: unknown) => toastFailure("Could not snooze", cause));
    },
    unpark: (threadId) => {
      unpark
        .mutate({ threadId })
        .catch((cause: unknown) =>
          toastFailure("Could not move to active", cause),
        );
    },
  };
}

/**
 * Deletes parks the model found expired, once each, so the stored set stays
 * small. A failed delete is left for the next session: an expired park
 * changes nothing the list shows.
 */
export function usePruneParks(expired: readonly string[]): void {
  const { mutate } = experimental_useRpcMutation({
    contract: rpcContract,
    method: "parks_unpark",
  });
  const tried = useRef(new Set<string>());
  useEffect(() => {
    for (const threadId of expired) {
      if (tried.current.has(threadId)) continue;
      tried.current.add(threadId);
      mutate({ threadId }).catch(() => undefined);
    }
  }, [expired, mutate]);
}
