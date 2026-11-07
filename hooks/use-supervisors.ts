import { useMemo } from "react";
import { experimental_useRpcQuery } from "@get-bb/plugin-sdk/app";

import { rpcContract } from "@/lib/rpc";

/** Before the homes are read, or when they cannot be, no thread is a supervisor. */
export function useSupervisors(): ReadonlySet<string> {
  const { data } = experimental_useRpcQuery({
    contract: rpcContract,
    method: "captain_supervisors",
    input: null,
  });
  return useMemo(() => new Set(data), [data]);
}
