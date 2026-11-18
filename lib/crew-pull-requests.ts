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

export const CHECKS = ["failing", "running", "passing", "none"] as const;
export const REVIEWS = ["approved", "changes_requested", "none"] as const;

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
});

export type CrewPullRequest = z.infer<typeof crewPullRequestSchema>;

/** The user's open pull requests in a project's repo; `repo` is null when it has none. */
export const crewPullRequestsSchema = z.object({
  repo: z.string().regex(REPO).nullable(),
  pullRequests: z.array(crewPullRequestSchema),
});

export type CrewPullRequests = z.infer<typeof crewPullRequestsSchema>;

type Mark = { icon: string; word: string; tone: string };

/** CI as one small icon: failing reads red, running amber, passing a quiet gray. */
const CHECK_MARK: Record<CrewPullRequest["checks"], Mark | null> = {
  failing: {
    icon: "CircleX",
    word: "Checks failing",
    tone: "text-destructive-text",
  },
  running: {
    icon: "Clock",
    word: "Checks running",
    tone: "text-warning-text",
  },
  passing: {
    icon: "CircleCheck",
    word: "Checks passing",
    tone: "text-muted-foreground/70",
  },
  none: null,
};

const QUIET = "text-muted-foreground/70";

export type PullRequestRow = {
  key: string;
  url: string;
  /** `repo#number`, the repo without its owner. */
  label: string;
  title: string;
  draft: boolean;
  base: string;
  head: string;
  additions: number;
  deletions: number;
  checks: Mark | null;
  /** Review and merge markers, kept quiet: conflicts, then the review. */
  markers: Mark[];
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
    return {
      key: `${pr.repo}#${pr.number}`,
      url: pr.url,
      label: `${pr.repo.split("/")[1]}#${pr.number}`,
      title: pr.title,
      draft: pr.draft,
      base: pr.base,
      head: pr.head,
      additions: pr.additions,
      deletions: pr.deletions,
      checks: CHECK_MARK[pr.checks],
      markers: [
        ...(pr.conflicts
          ? [{ icon: "DiffConflict", word: "Conflicts", tone: QUIET }]
          : []),
        ...(pr.review === "approved"
          ? [{ icon: "Check", word: "Approved", tone: QUIET }]
          : pr.review === "changes_requested"
            ? [{ icon: "FileDiff", word: "Changes requested", tone: QUIET }]
            : []),
      ],
      via:
        worker === undefined
          ? null
          : { threadId: worker.thread.id, title: worker.thread.displayTitle },
    };
  });
}
