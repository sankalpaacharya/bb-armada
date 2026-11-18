import { useEffect, useRef } from "react";
import {
  experimental_useRpcQuery,
  experimental_useTabVisible,
} from "@get-bb/plugin-sdk/app";

import type { CrewPullRequest } from "@/lib/crew-pull-requests";
import { rpcContract } from "@/lib/rpc";

/** How often an open tab reads the pull requests again. */
export const REFRESH_MS = 3 * 60_000;

const NONE: readonly CrewPullRequest[] = [];

/**
 * The user's open pull requests in a project's repo, read again whenever the
 * tab comes into view and every few minutes while it stays there. The last
 * read stays on screen meanwhile; none before the first, or without a repo.
 */
export function useCrewPullRequests(
  projectId: string,
): readonly CrewPullRequest[] {
  const visible = experimental_useTabVisible();
  const { data, refetch } = experimental_useRpcQuery({
    contract: rpcContract,
    method: "crew_pull_requests",
    input: { projectId },
  });
  const read = useRef(refetch);
  read.current = refetch;
  const shown = useRef(visible);
  useEffect(() => {
    const wasShown = shown.current;
    shown.current = visible;
    if (!visible) return;
    if (!wasShown) void read.current();
    const timer = setInterval(() => void read.current(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [visible]);
  return data?.pullRequests ?? NONE;
}
