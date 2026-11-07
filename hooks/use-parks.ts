import { experimental_useRpcQuery } from "@get-bb/plugin-sdk/app";

import type { ParkRecord } from "@/lib/lifecycle";
import { rpcContract } from "@/lib/rpc";

const NONE: readonly ParkRecord[] = [];

/** Parks are a refinement of the list: before they load, or when they fail, nothing is parked. */
export function useParks(): readonly ParkRecord[] {
  const { data } = experimental_useRpcQuery({
    contract: rpcContract,
    method: "parks_list",
    input: null,
  });
  return data ?? NONE;
}
