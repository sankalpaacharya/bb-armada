import { describe, expect, it, vi } from "vitest";

import {
  FRESH_MS,
  SEARCH_QUERY,
  createPullRequestReader,
  parseSearch,
  type RunGh,
} from "../lib/pull-request-search";

/** One search node in the shape `gh api graphql` returns for SEARCH_QUERY. */
const node = (number: number, overrides: Record<string, unknown> = {}) => ({
  number,
  title: `PR ${number}`,
  url: `https://github.com/productstudioinc/cops/pull/${number}`,
  isDraft: false,
  additions: 2334,
  deletions: 135,
  baseRefName: "main",
  headRefName: `feat/${number}`,
  mergeable: "MERGEABLE",
  reviewDecision: null,
  repository: { nameWithOwner: "productstudioinc/cops" },
  commits: {
    nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS" } } }],
  },
  ...overrides,
});

const response = (...nodes: unknown[]) =>
  JSON.stringify({ data: { search: { nodes } } });

const rollup = (state: string | null) => ({
  commits: {
    nodes: [
      { commit: { statusCheckRollup: state === null ? null : { state } } },
    ],
  },
});

const PROJECTS: Record<string, { kind: "standard" | "personal"; gitRemoteUrl: string | null }> = {
  proj_cops: {
    kind: "standard",
    gitRemoteUrl: "https://github.com/productstudioinc/cops.git",
  },
  proj_gym: { kind: "standard", gitRemoteUrl: null },
  proj_me: { kind: "personal", gitRemoteUrl: null },
};

function reader(run: RunGh) {
  let now = 1_000_000;
  const warn = vi.fn();
  const read = createPullRequestReader(
    {
      log: { warn } as never,
      sdk: {
        projects: {
          get: async ({ projectId }: { projectId: string }) =>
            PROJECTS[projectId] as never,
        },
      } as never,
    },
    { run, now: () => now },
  ).read;
  return { read, warn, later: (ms: number) => void (now += ms) };
}

describe("parsing the search", () => {
  it("maps checks, review, conflicts, draft, branches and size", () => {
    const [failing, running, passing, none] = parseSearch(
      response(
        node(1, { ...rollup("FAILURE"), reviewDecision: "CHANGES_REQUESTED" }),
        node(2, { ...rollup("PENDING"), isDraft: true }),
        node(3, { reviewDecision: "APPROVED", mergeable: "CONFLICTING" }),
        node(4, { ...rollup(null), reviewDecision: "REVIEW_REQUIRED" }),
      ),
    );
    expect(failing).toMatchObject({ checks: "failing", review: "changes_requested" });
    expect(running).toMatchObject({ checks: "running", draft: true });
    expect(passing).toMatchObject({
      checks: "passing",
      review: "approved",
      conflicts: true,
    });
    expect(none).toEqual({
      repo: "productstudioinc/cops",
      number: 4,
      title: "PR 4",
      url: "https://github.com/productstudioinc/cops/pull/4",
      draft: false,
      base: "main",
      head: "feat/4",
      additions: 2334,
      deletions: 135,
      checks: "none",
      review: "none",
      conflicts: false,
    });
  });

  it("skips a node that is not a pull request", () => {
    expect(parseSearch(response({}, node(7))).map((p) => p.number)).toEqual([7]);
  });
});

describe("the pull request reader", () => {
  it("searches the project's repo for the user's open PRs, read-only", async () => {
    const calls: (readonly string[])[] = [];
    const { read } = reader(async (args) => {
      calls.push(args);
      return response(node(1972));
    });
    const result = await read("proj_cops");
    expect(result.repo).toBe("productstudioinc/cops");
    expect(result.pullRequests.map((p) => p.number)).toEqual([1972]);
    expect(calls).toEqual([
      [
        "api",
        "graphql",
        "-f",
        `query=${SEARCH_QUERY}`,
        "-f",
        "q=is:pr is:open author:@me archived:false repo:productstudioinc/cops sort:updated-desc",
      ],
    ]);
    expect(SEARCH_QUERY).not.toMatch(/mutation/i);
  });

  it("has no repo and never runs gh for a personal or remote-less project", async () => {
    const run = vi.fn<RunGh>();
    const { read } = reader(run);
    expect(await read("proj_me")).toEqual({ repo: null, pullRequests: [] });
    expect(await read("proj_gym")).toEqual({ repo: null, pullRequests: [] });
    expect(run).not.toHaveBeenCalled();
  });

  it("reuses a fresh read and shares one in flight", async () => {
    const run = vi.fn<RunGh>(async () => response(node(1)));
    const { read, later } = reader(run);
    await Promise.all([read("proj_cops"), read("proj_cops")]);
    await read("proj_cops");
    expect(run).toHaveBeenCalledTimes(1);
    later(FRESH_MS);
    await read("proj_cops");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("keeps the last good read when gh fails, and says why once", async () => {
    let fail = false;
    const { read, warn, later } = reader(async () => {
      if (fail)
        throw Object.assign(new Error("Command failed: gh"), {
          code: 4,
          stderr: "To get started with GitHub CLI, please run:  gh auth login\n",
        });
      return response(node(1), node(2));
    });
    expect((await read("proj_cops")).pullRequests).toHaveLength(2);
    fail = true;
    later(FRESH_MS);
    expect((await read("proj_cops")).pullRequests).toHaveLength(2);
    later(FRESH_MS);
    await read("proj_cops");
    expect(warn.mock.calls).toEqual([
      ["could not read pull requests in productstudioinc/cops: gh is not signed in"],
    ]);
  });

  it("reads as none, quietly, when gh is missing", async () => {
    const { read, warn } = reader(async () => {
      throw Object.assign(new Error("spawn gh ENOENT"), { code: "ENOENT" });
    });
    expect(await read("proj_cops")).toEqual({
      repo: "productstudioinc/cops",
      pullRequests: [],
    });
    expect(warn.mock.calls).toEqual([
      ["could not read pull requests in productstudioinc/cops: gh is not installed"],
    ]);
  });
});
