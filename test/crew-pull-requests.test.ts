import { describe, expect, it } from "vitest";

import {
  githubRepoOf,
  projectRepo,
  PULL_REQUEST_URL,
  pullRequestRows,
} from "../lib/crew-pull-requests";
import { pr, thread } from "./fixtures";

const worker = (id: string, title: string, branchName: string | null) => ({
  thread: thread(id, {
    title,
    environment: {
      id: `env_${id}`,
      name: id,
      branchName,
      path: null,
      isWorktree: true,
      providerId: null,
      workspaceDisplayKind: null,
    },
  }),
});

describe("a project's repo", () => {
  it.each([
    ["https://github.com/productstudioinc/cops.git", "productstudioinc/cops"],
    [
      "https://github.com/sankalpaacharya/goodluck-butwal.git",
      "sankalpaacharya/goodluck-butwal",
    ],
    ["https://github.com/acme/app", "acme/app"],
    ["git@github.com:acme/app.git", "acme/app"],
    ["ssh://git@github.com/acme/my.app.git", "acme/my.app"],
    ["https://x-access-token@github.com/acme/app.git/", "acme/app"],
  ])("reads %s as %s", (remote, repo) => {
    expect(projectRepo({ kind: "standard", gitRemoteUrl: remote })).toBe(repo);
  });

  it("is none for a project without a remote, off GitHub, or personal", () => {
    expect(projectRepo({ kind: "standard", gitRemoteUrl: null })).toBeNull();
    expect(githubRepoOf("https://gitlab.com/acme/app.git")).toBeNull();
    expect(githubRepoOf("https://github.com/acme")).toBeNull();
    expect(githubRepoOf("https://github.com.evil.dev/acme/app")).toBeNull();
    expect(
      projectRepo({
        kind: "personal",
        gitRemoteUrl: "https://github.com/acme/app.git",
      }),
    ).toBeNull();
  });
});

describe("pull request rows", () => {
  it("keeps the number, title and size, and leaves the repo and branches to the tooltip", () => {
    const [row] = pullRequestRows([pr(8357, { title: "Fix sign up" })], []);
    expect(row).toMatchObject({
      key: "productstudioinc/cops#8357",
      number: 8357,
      title: "Fix sign up",
      additions: 17,
      deletions: 35,
      updatedAt: Date.parse("2026-09-29T15:00:00Z"),
      details: "Fix sign up\ncops#8357 · main ← feat/8357\nReady",
      via: null,
    });
  });

  it.each([
    [{ checks: "failing", conflicts: true }, "Checks failing", "text-destructive-text"],
    [{ conflicts: true, review: "changes_requested" }, "Conflicts", "text-warning-text"],
    [{ review: "changes_requested", draft: true }, "Changes requested", "text-warning-text"],
    [{ draft: true, checks: "running" }, "Draft", "text-muted-foreground/60"],
    [{ checks: "running", review: "approved" }, "Checks running", "text-warning-text"],
    [{ review: "approved", checks: "none" }, "Ready", "text-success"],
    [{ checks: "passing" }, "Ready", "text-success"],
    [{ checks: "passing", review: "required" }, "Open", "text-muted-foreground"],
    [{ checks: "none" }, "Open", "text-muted-foreground"],
  ] as const)("shows %o as %s", (overrides, word, tone) => {
    const [row] = pullRequestRows([pr(1, overrides)], []);
    expect(row!.state).toMatchObject({ word, tone });
  });

  it("draws ready as a check and drafts as a draft PR", () => {
    const [ready, draft, open] = pullRequestRows(
      [pr(1), pr(2, { draft: true }), pr(3, { checks: "none" })],
      [],
    );
    expect([ready, draft, open].map((row) => row!.state.icon)).toEqual([
      "Check",
      "GitPullRequestDraft",
      "GitPullRequest",
    ]);
  });

  it("names the worker whose branch the PR is from, the first one on it", () => {
    const rows = pullRequestRows(
      [pr(1, { head: "capy/fix-sign-up-form" }), pr(2, { head: "elsewhere" })],
      [
        worker("w_none", "No branch", null),
        worker("w_fix", "WEB-41", "capy/fix-sign-up-form"),
        worker("w_old", "Older", "capy/fix-sign-up-form"),
      ],
    );
    expect(rows.map((row) => row.via)).toEqual([
      { threadId: "w_fix", title: "WEB-41" },
      null,
    ]);
  });
});

describe("a pull request's URL", () => {
  it.each([
    ["https://github.com/productstudioinc/cops/pull/1966", true],
    ["https://github.com/acme/my.app/pull/7", true],
    ["https://github.com/acme/app/issues/7", false],
    ["http://github.com/acme/app/pull/7", false],
    ["https://github.com.evil.dev/acme/app/pull/7", false],
    ["https://github.com/acme/app/pull/7; rm -rf ~", false],
    ["https://github.com/acme/app/pull/7\n", false],
  ])("%s is a PR's page: %s", (url, ok) => {
    expect(PULL_REQUEST_URL.test(url)).toBe(ok);
  });
});
