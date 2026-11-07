import { experimental_useRpcQuery } from "@get-bb/plugin-sdk/app";

import type { CaptainRecord } from "@/lib/captains";
import { rpcContract } from "@/lib/rpc";

export type CaptainsRead =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; records: readonly CaptainRecord[] };

/** Data wins over a later refresh error, which keeps the last good list. */
export function useCaptains(): CaptainsRead {
  const { data, error } = experimental_useRpcQuery({
    contract: rpcContract,
    method: "captains_list",
    input: null,
  });
  if (data !== undefined) return { status: "ready", records: data };
  return error === null ? { status: "loading" } : { status: "error" };
}
