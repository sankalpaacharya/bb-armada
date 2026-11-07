import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const PULL_REQUESTS_PLUGIN_ID = "bb--github-pr-status";

const PR_ATTENTIONS = [
  "none",
  "checks_failed",
  "conflicts",
  "ready_to_merge",
] as const;

export type PrAttention = (typeof PR_ATTENTIONS)[number];

export const pullRequestContract = defineRpcContract({
  pullRequests: {
    input: z.object({ keys: z.array(z.string()) }),
    output: z.record(
      z.string(),
      z.discriminatedUnion("outcome", [
        z.object({
          outcome: z.literal("available"),
          pullRequest: z.object({
            number: z.number(),
            title: z.string(),
            url: z.string(),
            state: z.enum(["draft", "open", "merged", "closed"]),
            attention: z.enum(PR_ATTENTIONS).catch("none"),
          }),
        }),
        z.object({ outcome: z.literal("absent") }),
        z.object({ outcome: z.literal("unavailable"), message: z.string() }),
      ]),
    ),
  },
});
