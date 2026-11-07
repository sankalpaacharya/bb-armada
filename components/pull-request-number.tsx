import { useMemo } from "react";
import { experimental_useRpcKeyedQuery } from "@get-bb/plugin-sdk/app";

import {
  PULL_REQUESTS_PLUGIN_ID,
  pullRequestContract,
  type PrAttention,
} from "@/lib/pull-requests";
import { cn } from "@/lib/utils";

const NO_KEYS: readonly string[] = [];

const ATTENTION_TONE: Record<PrAttention, string> = {
  none: "text-muted-foreground",
  checks_failed: "text-destructive-text",
  conflicts: "text-destructive-text",
  ready_to_merge: "text-success-foreground",
};

export function PullRequestNumber({
  environmentId,
}: {
  environmentId: string | null;
}) {
  const keys = useMemo(
    () => (environmentId === null ? NO_KEYS : [environmentId]),
    [environmentId],
  );
  const { data } = experimental_useRpcKeyedQuery({
    pluginId: PULL_REQUESTS_PLUGIN_ID,
    contract: pullRequestContract,
    method: "pullRequests",
    keys,
  });
  const row = environmentId === null ? undefined : data?.[environmentId];
  if (row?.outcome !== "available") return null;
  const { pullRequest } = row;
  return (
    <a
      href={pullRequest.url}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
      title={pullRequest.title}
      className={cn(
        "pointer-events-auto relative shrink-0 font-mono hover:underline",
        pullRequest.state === "merged"
          ? "text-[color:var(--pr-merged)]"
          : ATTENTION_TONE[pullRequest.attention],
      )}
    >
      #{pullRequest.number}
    </a>
  );
}
