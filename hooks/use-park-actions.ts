import { experimental_useRpcMutation } from "@get-bb/plugin-sdk/app";

import { rpcContract } from "@/lib/rpc";
import { toastFailure } from "@/lib/toast";

export type ParkActions = {
  settle: (threadId: string) => void;
  snooze: (threadId: string, until: number) => void;
  unpark: (threadId: string) => void;
};

export function useParkActions(): ParkActions {
  const settle = experimental_useRpcMutation({
    contract: rpcContract,
    method: "parks_settle",
  });
  const snooze = experimental_useRpcMutation({
    contract: rpcContract,
    method: "parks_snooze",
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
        .mutate({ threadId })
        .catch((cause: unknown) => toastFailure("Could not settle", cause));
    },
    snooze: (threadId, until) => {
      snooze
        .mutate({ threadId, until })
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
