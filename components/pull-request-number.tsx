import { useMemo } from "react";
import { experimental_useRpcKeyedQuery } from "@get-bb/plugin-sdk/app";

import {
  PULL_REQUESTS_PLUGIN_ID,
  pullRequestContract,
  type PrAttention,
} from "@/lib/pull-requests";
import { cn } from "@/lib/utils";

const NO_KEYS: readonly string[] = [];

const STATE = {
  draft: { word: "Draft", tone: "text-muted-foreground" },
  open: { word: "Open", tone: "text-success-foreground" },
  merged: { word: "Merged", tone: "text-[color:var(--pr-merged)]" },
  closed: { word: "Closed", tone: "text-destructive-text" },
} as const;

/** An open PR's attention outranks its state colour: failing checks or conflicts read red. */
const ATTENTION_TONE: Partial<Record<PrAttention, string>> = {
  checks_failed: "text-destructive-text",
  conflicts: "text-destructive-text",
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
  const state = STATE[pullRequest.state];
  return (
    <a
      href={pullRequest.url}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
      title={`${state.word} · #${pullRequest.number} ${pullRequest.title}`}
      className={cn(
        "pointer-events-auto relative shrink-0 font-mono hover:underline",
        (pullRequest.state === "open"
          ? ATTENTION_TONE[pullRequest.attention]
          : undefined) ?? state.tone,
      )}
    >
      #{pullRequest.number}
    </a>
  );
}
