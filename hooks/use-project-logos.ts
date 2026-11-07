import { experimental_useRpcQuery } from "@get-bb/plugin-sdk/app";

import type { ProjectLogos } from "@/lib/project-logos";
import { rpcContract } from "@/lib/rpc";

const NO_LOGOS: Readonly<ProjectLogos> = {};

/** Before the logos are read, or when they cannot be, no project has one. */
export function useProjectLogos(): Readonly<ProjectLogos> {
  const { data } = experimental_useRpcQuery({
    contract: rpcContract,
    method: "project_logos",
    input: null,
  });
  return data ?? NO_LOGOS;
}
