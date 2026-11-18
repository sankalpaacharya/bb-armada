import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { experimental_execHostFile } from "@get-bb/plugin-sdk/process";
import { z } from "zod";

import {
  createSharedPrCache,
  type Gh,
  type SharedCache,
} from "./shared-pr-cache";
import {
  projectRepo,
  type CrewPullRequest,
  type CrewPullRequests,
} from "./crew-pull-requests";

const nodeSchema = z.object({
  number: z.number(),
  title: z.string(),
  url: z.string(),
  isDraft: z.boolean(),
  additions: z.number(),
  deletions: z.number(),
  updatedAt: z.iso.datetime(),
  baseRefName: z.string(),
  headRefName: z.string(),
  mergeable: z.string(),
  reviewDecision: z.string().nullable(),
  repository: z.object({ nameWithOwner: z.string() }),
  commits: z.object({
    nodes: z.array(
      z.object({
        commit: z.object({
          statusCheckRollup: z.object({ state: z.string() }).nullable(),
        }),
      }),
    ),
  }),
});

const dataSchema = z.object({
  search: z.object({
    // `is:pr` makes every node a pull request; anything else is skipped.
    nodes: z.array(z.unknown()),
  }),
});

const CHECKS: Record<string, CrewPullRequest["checks"]> = {
  SUCCESS: "passing",
  FAILURE: "failing",
  ERROR: "failing",
  PENDING: "running",
  EXPECTED: "running",
};

const REVIEWS: Record<string, CrewPullRequest["review"]> = {
  APPROVED: "approved",
  CHANGES_REQUESTED: "changes_requested",
  REVIEW_REQUIRED: "required",
};

/** Every pull request in the shared search's `data`, in its order; none when it has none. */
export function parseSearch(data: unknown): CrewPullRequest[] {
  const parsed = dataSchema.safeParse(data);
  if (!parsed.success) return [];
  const { nodes } = parsed.data.search;
  return nodes.flatMap((candidate) => {
    const parsed = nodeSchema.safeParse(candidate);
    if (!parsed.success) return [];
    const node = parsed.data;
    const rollup = node.commits.nodes[0]?.commit.statusCheckRollup ?? null;
    return [
      {
        repo: node.repository.nameWithOwner,
        number: node.number,
        title: node.title,
        url: node.url,
        draft: node.isDraft,
        base: node.baseRefName,
        head: node.headRefName,
        additions: node.additions,
        deletions: node.deletions,
        checks: (rollup === null ? undefined : CHECKS[rollup.state]) ?? "none",
        review:
          (node.reviewDecision === null
            ? undefined
            : REVIEWS[node.reviewDecision]) ?? "none",
        conflicts: node.mergeable === "CONFLICTING",
        updatedAt: node.updatedAt,
      },
    ];
  });
}

const runGh: Gh = async (args) =>
  (
    await experimental_execHostFile("gh", args, {
      encoding: "utf8",
      timeout: 20_000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" },
    })
  ).stdout;

/** A repo's pull requests out of everything the search found. */
export const inRepo = (
  repo: string,
  pullRequests: readonly CrewPullRequest[],
): CrewPullRequest[] =>
  pullRequests.filter((pr) => pr.repo.toLowerCase() === repo.toLowerCase());

type SharedPrCache = Pick<
  ReturnType<typeof createSharedPrCache>,
  "read" | "refresh"
>;

/**
 * The Crew tab's view of the shared pull request cache: one search for all of
 * the user's open PRs, filtered to a project's repo here. A read never calls
 * GitHub unless nothing was ever read; the tab's five-minute timer refreshes.
 * A failed search keeps the last PRs, with when the next try is allowed.
 */
export function createPullRequestReader(
  bb: Pick<BbPluginApi, "log"> & {
    sdk: Pick<BbPluginApi["sdk"], "projects">;
  },
  options: { cache?: SharedPrCache; now?: () => number } = {},
) {
  const cache = options.cache ?? createSharedPrCache({ gh: runGh });
  const now = options.now ?? Date.now;
  let logged: string | null = null;

  const note = (shared: SharedCache): SharedCache => {
    const error = shared.lastError;
    const reason = error === null ? null : `${error.kind}: ${error.message}`;
    if (reason !== null && reason !== logged)
      bb.log.warn(`could not read pull requests: ${reason}`);
    logged = reason;
    return shared;
  };

  return {
    read: async (projectId: string): Promise<CrewPullRequests> => {
      const repo = projectRepo(await bb.sdk.projects.get({ projectId }));
      if (repo === null)
        return { repo: null, pullRequests: [], fetchedAt: null, retryAt: null };
      let shared = await cache.read();
      if (shared.data === null) shared = await cache.refresh();
      note(shared);
      return {
        repo,
        pullRequests: inRepo(repo, parseSearch(shared.data)),
        fetchedAt: shared.fetchedAt,
        retryAt:
          shared.lastError !== null && shared.nextAllowedAt > now()
            ? shared.nextAllowedAt
            : null,
      };
    },
    refresh: async (): Promise<void> => {
      note(await cache.refresh());
    },
  };
}
