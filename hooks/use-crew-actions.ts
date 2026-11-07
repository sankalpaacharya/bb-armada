import { useSdk } from "@get-bb/plugin-sdk/app";

import { toastFailure } from "@/lib/toast";

export type CrewActions = {
  add: (threadId: string, captainId: string) => void;
};

/** A thread is a captain's crew when the captain is its parent. */
export function useCrewActions(): CrewActions {
  const sdk = useSdk();
  return {
    add: (threadId, captainId) => {
      sdk.threads
        .update({ threadId, parentThreadId: captainId })
        .catch((cause: unknown) =>
          toastFailure("Could not add the thread to the captain", cause),
        );
    },
  };
}
