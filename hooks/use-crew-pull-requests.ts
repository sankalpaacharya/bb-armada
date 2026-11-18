import { useEffect, useRef } from "react";
import {
  experimental_useRpcMutation,
  experimental_useRpcQuery,
  experimental_useTabVisible,
} from "@get-bb/plugin-sdk/app";

import type { CrewPullRequests } from "@/lib/crew-pull-requests";
import { rpcContract } from "@/lib/rpc";

/** How often a visible tab asks for a fresh search; the shared cache allows one per five minutes. */
export const REFRESH_MS = 5 * 60_000;

const NONE: CrewPullRequests = {
  repo: null,
  pullRequests: [],
  fetchedAt: null,
  retryAt: null,
};

/**
 * The user's open pull requests in a project's repo. Coming into view only
 * re-reads the shared cache; a timer asks for a fresh search every five
 * minutes while the tab and its window are both visible. The last read stays
 * on screen meanwhile; none before the first, or without a repo.
 */
export function useCrewPullRequests(projectId: string): CrewPullRequests {
  const visible = experimental_useTabVisible();
  const { data, refetch } = experimental_useRpcQuery({
    contract: rpcContract,
    method: "crew_pull_requests",
    input: { projectId },
  });
  const { mutate: refresh } = experimental_useRpcMutation({
    contract: rpcContract,
    method: "pull_requests_refresh",
  });
  const latest = useRef({ refetch, refresh });
  latest.current = { refetch, refresh };
  const shown = useRef(visible);
  useEffect(() => {
    const wasShown = shown.current;
    shown.current = visible;
    if (!visible) return;
    if (!wasShown) void latest.current.refetch();
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void latest.current
        .refresh(null)
        .catch(() => null)
        .then(() => latest.current.refetch());
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [visible]);
  return data ?? NONE;
}
