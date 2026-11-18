import { describe, expect, it } from "vitest";

import {
  githubRepoOf,
  projectRepo,
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
  it("names the repo without its owner, and keeps branches and size", () => {
    const [row] = pullRequestRows([pr(8357, { title: "Fix sign up" })], []);
    expect(row).toMatchObject({
      key: "productstudioinc/cops#8357",
      label: "cops#8357",
      title: "Fix sign up",
      base: "main",
      head: "feat/8357",
      additions: 17,
      deletions: 35,
      via: null,
    });
  });

  it("shows failing checks red, running amber, passing gray, and none not at all", () => {
    const rows = pullRequestRows(
      [
        pr(1, { checks: "failing" }),
        pr(2, { checks: "running" }),
        pr(3, { checks: "passing" }),
        pr(4, { checks: "none" }),
      ],
      [],
    );
    expect(rows.map((row) => row.checks?.word ?? null)).toEqual([
      "Checks failing",
      "Checks running",
      "Checks passing",
      null,
    ]);
    expect(rows[0]!.checks!.tone).toBe("text-destructive-text");
    expect(rows[1]!.checks!.tone).toBe("text-warning-text");
    expect(rows[2]!.checks!.tone).toBe("text-muted-foreground/70");
  });

  it("never paints anything green", () => {
    const rows = pullRequestRows(
      [
        pr(1, { review: "approved" }),
        pr(2, { review: "changes_requested", conflicts: true }),
      ],
      [],
    );
    const tones = rows.flatMap((row) => [
      row.checks?.tone ?? "",
      ...row.markers.map((mark) => mark.tone),
    ]);
    expect(tones.join(" ")).not.toMatch(/success|green|emerald/);
  });

  it("marks conflicts and the review quietly, conflicts first", () => {
    const rows = pullRequestRows(
      [
        pr(1, { review: "approved" }),
        pr(2, { review: "changes_requested", conflicts: true }),
        pr(3),
      ],
      [],
    );
    expect(rows.map((row) => row.markers.map((mark) => mark.word))).toEqual([
      ["Approved"],
      ["Conflicts", "Changes requested"],
      [],
    ]);
    expect(
      rows.flatMap((row) => row.markers.map((mark) => mark.tone)),
    ).toEqual(Array(3).fill("text-muted-foreground/70"));
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
