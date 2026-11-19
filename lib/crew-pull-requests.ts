import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { z } from "zod";

/** A GitHub repo as `owner/name`. */
const REPO = /^[\w.-]+\/[\w.-]+$/;

/** https, ssh and scp-style GitHub remotes, with or without `.git`. */
const GITHUB_REMOTE =
  /^(?:(?:https?|ssh|git):\/\/(?:[^@/]+@)?github\.com(?::\d+)?\/|[^@/]+@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i;

/** The `owner/name` a remote points at, or null for anything but GitHub. */
export function githubRepoOf(remoteUrl: string | null): string | null {
  if (remoteUrl === null) return null;
  return GITHUB_REMOTE.exec(remoteUrl.trim())?.[1] ?? null;
}

/**
 * The repo a project's pull requests come from: its GitHub remote. A personal
 * project, or one with no GitHub remote, has none.
 */
export function projectRepo(project: {
  kind: "personal" | "standard";
  gitRemoteUrl: string | null;
}): string | null {
  return project.kind === "personal" ? null : githubRepoOf(project.gitRemoteUrl);
}

/**
 * The folder whose own `origin` names a project's repo when bb has no remote
 * on record: its default local source, else its first. A personal project has
 * none.
 */
export function projectCheckout(project: {
  kind: "personal" | "standard";
  sources?: readonly { type: string; path: string; isDefault: boolean }[];
}): string | null {
  if (project.kind === "personal") return null;
  const local = (project.sources ?? []).filter(
    (source) => source.type === "local_path",
  );
  return (local.find((source) => source.isDefault) ?? local[0])?.path ?? null;
}

export const CHECKS = ["failing", "running", "passing", "none"] as const;
export const REVIEWS = [
  "approved",
  "changes_requested",
  "required",
  "none",
] as const;

export const crewPullRequestSchema = z.object({
  repo: z.string().regex(REPO),
  number: z.number().int().positive(),
  title: z.string(),
  url: z.url(),
  draft: z.boolean(),
  base: z.string(),
  head: z.string(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  checks: z.enum(CHECKS),
  review: z.enum(REVIEWS),
  conflicts: z.boolean(),
  updatedAt: z.iso.datetime(),
});

export type CrewPullRequest = z.infer<typeof crewPullRequestSchema>;

/** The user's open pull requests in a project's repo; `repo` is null when it has none. */
export const crewPullRequestsSchema = z.object({
  repo: z.string().regex(REPO).nullable(),
  pullRequests: z.array(crewPullRequestSchema),
  /** When GitHub was last read, by any plugin; null before the first read. */
  fetchedAt: z.number().nullable(),
  /** Set while a failed read backs off: when the next one may run. */
  retryAt: z.number().nullable(),
});

export type CrewPullRequests = z.infer<typeof crewPullRequestsSchema>;

/** The row's one icon: the most pressing thing about the PR, first match wins. */
export const PULL_REQUEST_STATES = [
  "failing",
  "conflicts",
  "changes",
  "draft",
  "running",
  "ready",
  "open",
] as const;

export type PullRequestState = (typeof PULL_REQUEST_STATES)[number];

export function stateOf(pr: CrewPullRequest): PullRequestState {
  if (pr.checks === "failing") return "failing";
  if (pr.conflicts) return "conflicts";
  if (pr.review === "changes_requested") return "changes";
  if (pr.draft) return "draft";
  if (pr.checks === "running") return "running";
  if (pr.review === "approved") return "ready";
  if (pr.checks === "passing" && pr.review !== "required") return "ready";
  return "open";
}

type Mark = { icon: string; word: string; tone: string };

/** Red for failing CI, amber for what else needs the user, the theme's success colour for ready. */
const STATE_MARK: Record<PullRequestState, Mark> = {
  failing: {
    icon: "GitPullRequest",
    word: "Checks failing",
    tone: "text-destructive-text",
  },
  conflicts: {
    icon: "GitPullRequest",
    word: "Conflicts",
    tone: "text-warning-text",
  },
  changes: {
    icon: "GitPullRequest",
    word: "Changes requested",
    tone: "text-warning-text",
  },
  draft: {
    icon: "GitPullRequestDraft",
    word: "Draft",
    tone: "text-muted-foreground/60",
  },
  running: {
    icon: "GitPullRequest",
    word: "Checks running",
    tone: "text-warning-text",
  },
  ready: { icon: "Check", word: "Ready", tone: "text-success" },
  open: {
    icon: "GitPullRequest",
    word: "Open",
    tone: "text-muted-foreground",
  },
};

export type PullRequestRow = {
  key: string;
  url: string;
  number: number;
  title: string;
  draft: boolean;
  state: Mark;
  additions: number;
  deletions: number;
  /** When the PR last changed, in ms. */
  updatedAt: number;
  /** What the row leaves out: the title in full, `repo#number`, its branches and state. */
  details: string;
  /** The crew worker whose branch this is. */
  via: { threadId: string; title: string } | null;
};

type Worker = {
  thread: Pick<PluginSidebarThread, "id" | "displayTitle" | "environment">;
};

/**
 * Each pull request as a Crew row. A PR whose head branch is a worker's
 * environment branch names that worker; the first worker on the branch wins,
 * so pass the active ones first.
 */
export function pullRequestRows(
  pullRequests: readonly CrewPullRequest[],
  workers: readonly Worker[],
): PullRequestRow[] {
  const byBranch = new Map<string, Worker>();
  for (const entry of workers) {
    const branch = entry.thread.environment?.branchName ?? null;
    if (branch !== null && !byBranch.has(branch)) byBranch.set(branch, entry);
  }
  return pullRequests.map((pr) => {
    const worker = byBranch.get(pr.head);
    const state = STATE_MARK[stateOf(pr)];
    return {
      key: `${pr.repo}#${pr.number}`,
      url: pr.url,
      number: pr.number,
      title: pr.title,
      draft: pr.draft,
      state,
      additions: pr.additions,
      deletions: pr.deletions,
      updatedAt: Date.parse(pr.updatedAt),
      details: [
        pr.title,
        `${pr.repo.split("/")[1]}#${pr.number} · ${pr.base} ← ${pr.head}`,
        state.word,
      ].join("\n"),
      via:
        worker === undefined
          ? null
          : { threadId: worker.thread.id, title: worker.thread.displayTitle },
    };
  });
}

/** A pull request's page on GitHub, the only URL the server opens. */
export const PULL_REQUEST_URL =
  /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/;
