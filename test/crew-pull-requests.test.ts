import { describe, expect, it } from "vitest";

import {
  githubRepoOf,
  projectCheckout,
  projectRepo,
  pullRequestRows,
} from "../lib/crew-pull-requests";
import { pr } from "./fixtures";

describe("a project's repo", () => {
  it.each([
    ["https://github.com/productstudioinc/cops.git", "productstudioinc/cops"],
    ["git@github.com:acme/app.git", "acme/app"],
    ["ssh://git@github.com/acme/my.app.git", "acme/my.app"],
    ["https://x-access-token@github.com/acme/app.git/", "acme/app"],
  ])("reads %s as %s", (remote, repo) => {
    expect(projectRepo({ kind: "standard", gitRemoteUrl: remote })).toBe(repo);
  });

  it("is none for a project without a remote, off GitHub, or personal", () => {
    expect(projectRepo({ kind: "standard", gitRemoteUrl: null })).toBeNull();
    expect(githubRepoOf("https://gitlab.com/acme/app.git")).toBeNull();
    expect(githubRepoOf("https://github.com.evil.dev/acme/app")).toBeNull();
    expect(
      projectRepo({ kind: "personal", gitRemoteUrl: "https://github.com/acme/app.git" }),
    ).toBeNull();
  });
});

describe("a project's checkout", () => {
  const source = (path: string, isDefault: boolean) => ({
    type: "local_path",
    path,
    isDefault,
  });

  it("is the default local folder, else the first", () => {
    const old = source("/work/old", false);
    expect(
      projectCheckout({ kind: "standard", sources: [old, source("/work/fig", true)] }),
    ).toBe("/work/fig");
    expect(projectCheckout({ kind: "standard", sources: [old] })).toBe("/work/old");
  });

  it("is none for a personal project or one without a folder", () => {
    expect(
      projectCheckout({ kind: "personal", sources: [source("/work/me", true)] }),
    ).toBeNull();
    expect(projectCheckout({ kind: "standard", sources: [] })).toBeNull();
    expect(projectCheckout({ kind: "standard" })).toBeNull();
  });
});

describe("pull request rows", () => {
  it.each([
    [{ checks: "failing", conflicts: true }, "Checks failing"],
    [{ conflicts: true, review: "changes_requested" }, "Conflicts"],
    [{ review: "changes_requested", draft: true }, "Changes requested"],
    [{ draft: true, checks: "running" }, "Draft"],
    [{ checks: "running", review: "approved" }, "Checks running"],
    [{ review: "approved", checks: "none" }, "Ready"],
    [{ checks: "passing" }, "Ready"],
    [{ checks: "passing", review: "required" }, "Open"],
    [{ checks: "none" }, "Open"],
  ] as const)("shows %o as %s", (overrides, word) => {
    const [row] = pullRequestRows([pr(1, overrides)], []);
    expect(row!.state.word).toBe(word);
  });
});
