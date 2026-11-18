import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { experimental_execHostFile } from "@get-bb/plugin-sdk/process";
import { z } from "zod";

import {
  projectRepo,
  type CrewPullRequest,
  type CrewPullRequests,
} from "./crew-pull-requests";

/** Read-only: one search, never a mutation. `author:@me` is whoever gh is signed in as. */
export const SEARCH_QUERY = `query($q: String!) {
  search(query: $q, type: ISSUE, first: 50) {
    nodes {
      ... on PullRequest {
        number title url isDraft additions deletions
        baseRefName headRefName mergeable reviewDecision
        repository { nameWithOwner }
        commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
      }
    }
  }
}`;

export const searchOf = (repo: string): string =>
  `is:pr is:open author:@me archived:false repo:${repo} sort:updated-desc`;

const nodeSchema = z.object({
  number: z.number(),
  title: z.string(),
  url: z.string(),
  isDraft: z.boolean(),
  additions: z.number(),
  deletions: z.number(),
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

const responseSchema = z.object({
  data: z.object({
    search: z.object({
      // `is:pr` makes every node a pull request; anything else is skipped.
      nodes: z.array(z.unknown()),
    }),
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
};

/** Every pull request in a `gh api graphql` search response, in its order. */
export function parseSearch(stdout: string): CrewPullRequest[] {
  const { nodes } = responseSchema.parse(JSON.parse(stdout)).data.search;
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
      },
    ];
  });
}

/** Runs `gh` with these arguments and resolves with its stdout. */
export type RunGh = (args: readonly string[]) => Promise<string>;

const runGh: RunGh = async (args) =>
  (
    await experimental_execHostFile("gh", args, {
      encoding: "utf8",
      timeout: 20_000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" },
    })
  ).stdout;

/** Why gh failed, in words safe to log: never its output beyond one short line. */
function failureOf(cause: unknown): string {
  const error = cause as { code?: unknown; stderr?: unknown };
  if (error.code === "ENOENT") return "gh is not installed";
  const stderr = typeof error.stderr === "string" ? error.stderr : "";
  if (error.code === 4 || /gh auth login/.test(stderr))
    return "gh is not signed in";
  const line = stderr.split("\n").find((text) => text.trim() !== "");
  return (line ?? (cause instanceof Error ? cause.message : String(cause)))
    .trim()
    .slice(0, 160);
}

/** A repo's read is reused this long; the tab's own refreshes are minutes apart. */
export const FRESH_MS = 30_000;

type Entry = { at: number; pullRequests: CrewPullRequest[] };

/**
 * Reads the user's open pull requests in a project's repo through their own
 * `gh` sign-in, so no token passes through the plugin. Each repo's last good
 * read is kept, and stays the answer when gh fails, so the tab never blanks.
 */
export function createPullRequestReader(
  bb: Pick<BbPluginApi, "log"> & {
    sdk: Pick<BbPluginApi["sdk"], "projects">;
  },
  options: { run?: RunGh; now?: () => number } = {},
) {
  const run = options.run ?? runGh;
  const now = options.now ?? Date.now;
  const cache = new Map<string, Entry>();
  const reading = new Map<string, Promise<CrewPullRequest[]>>();
  const failures = new Map<string, string>();

  const fetchRepo = async (repo: string): Promise<CrewPullRequest[]> => {
    const previous = cache.get(repo);
    try {
      const stdout = await run([
        "api",
        "graphql",
        "-f",
        `query=${SEARCH_QUERY}`,
        "-f",
        `q=${searchOf(repo)}`,
      ]);
      const pullRequests = parseSearch(stdout);
      cache.set(repo, { at: now(), pullRequests });
      failures.delete(repo);
      return pullRequests;
    } catch (cause) {
      const reason = failureOf(cause);
      if (failures.get(repo) !== reason)
        bb.log.warn(`could not read pull requests in ${repo}: ${reason}`);
      failures.set(repo, reason);
      const pullRequests = previous?.pullRequests ?? [];
      cache.set(repo, { at: now(), pullRequests });
      return pullRequests;
    }
  };

  const readRepo = (repo: string): Promise<CrewPullRequest[]> => {
    const entry = cache.get(repo);
    if (entry !== undefined && now() - entry.at < FRESH_MS)
      return Promise.resolve(entry.pullRequests);
    const current = reading.get(repo);
    if (current !== undefined) return current;
    const next = fetchRepo(repo).finally(() => reading.delete(repo));
    reading.set(repo, next);
    return next;
  };

  return {
    read: async (projectId: string): Promise<CrewPullRequests> => {
      const repo = projectRepo(await bb.sdk.projects.get({ projectId }));
      if (repo === null) return { repo: null, pullRequests: [] };
      return { repo, pullRequests: await readRepo(repo) };
    },
  };
}
