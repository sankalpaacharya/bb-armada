import { experimental_useRpcQuery } from "@get-bb/plugin-sdk/app";

import type { CaptainRecord } from "@/lib/captains";
import { rpcContract } from "@/lib/rpc";

const NONE: readonly CaptainRecord[] = [];

/** Undefined until the first read settles; a failed read lists no captains. */
export function useCaptains(): readonly CaptainRecord[] | undefined {
  const { data, error } = experimental_useRpcQuery({
    contract: rpcContract,
    method: "captains_list",
    input: null,
  });
  return data ?? (error === null ? undefined : NONE);
}
