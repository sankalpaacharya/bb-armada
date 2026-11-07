import { experimental_useRpcQuery } from "@get-bb/plugin-sdk/app";

import type { CaptainRecord } from "@/lib/captains";
import { rpcContract } from "@/lib/rpc";

export function useCaptains(): readonly CaptainRecord[] | undefined {
  const { data } = experimental_useRpcQuery({
    contract: rpcContract,
    method: "captains_list",
    input: null,
  });
  return data;
}
