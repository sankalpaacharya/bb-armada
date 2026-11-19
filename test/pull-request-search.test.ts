import { describe, expect, it, vi } from "vitest";

import { createPullRequestReader, parseSearch } from "../lib/pull-request-search";
import { EMPTY_CACHE, type SharedCache } from "../lib/shared-pr-cache";

/** One search node in the shape `gh api graphql` returns for SEARCH_QUERY. */
const node = (number: number, overrides: Record<string, unknown> = {}) => ({
  number,
  title: `PR ${number}`,
  url: `https://github.com/productstudioinc/cops/pull/${number}`,
  isDraft: false,
  additions: 2334,
  deletions: 135,
  updatedAt: "2026-11-17T09:30:00Z",
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

const data = (...nodes: unknown[]) => ({ search: { nodes } });

const rollup = (state: string | null) => ({
  commits: {
    nodes: [
      { commit: { statusCheckRollup: state === null ? null : { state } } },
    ],
  },
});

type Project = {
  kind: "standard" | "personal";
  gitRemoteUrl: string | null;
  sources?: { type: "local_path"; path: string; isDefault: boolean }[];
};

const checkout = (path: string) => [{ type: "local_path" as const, path, isDefault: true }];

const PROJECTS: Record<string, Project> = {
  proj_cops: {
    kind: "standard",
    gitRemoteUrl: "https://github.com/productstudioinc/cops.git",
  },
  proj_gym: { kind: "standard", gitRemoteUrl: null },
  proj_me: { kind: "personal", gitRemoteUrl: null },
  proj_fig: { kind: "standard", gitRemoteUrl: null, sources: checkout("/work/fig") },
  proj_lab: { kind: "standard", gitRemoteUrl: null, sources: checkout("/work/lab") },
  proj_bare: { kind: "standard", gitRemoteUrl: null, sources: checkout("/work/bare") },
  proj_gitlab: {
    kind: "standard",
    gitRemoteUrl: "https://gitlab.com/acme/app.git",
    sources: checkout("/work/fig"),
  },
};

/** What `git remote get-url origin` says in each checkout. */
const ORIGINS: Record<string, string> = {
  "/work/fig": "git@github.com:sankalpaacharya/gymside.git",
  "/work/lab": "https://gitlab.com/acme/lab.git",
};

const NOW = 1_800_000_000_000;

function reader(start: Partial<SharedCache>, clock = { now: NOW }) {
  let shared: SharedCache = { ...EMPTY_CACHE, ...start };
  const cache = {
    read: vi.fn(async () => shared),
    refresh: vi.fn(async () => {
      shared = { ...shared, fetchedAt: NOW, data: data(node(1)) };
      return shared;
    }),
  };
  const gitRemote = vi.fn(async (path: string) => {
    const origin = ORIGINS[path];
    if (origin === undefined) throw new Error("fatal: No such remote 'origin'");
    return origin;
  });
  const read = createPullRequestReader(
    {
      log: { warn: () => {} } as never,
      sdk: {
        projects: {
          get: async ({ projectId }: { projectId: string }) =>
            PROJECTS[projectId] as never,
        },
      } as never,
    },
    { cache, now: () => clock.now, gitRemote },
  );
  return { ...read, cache, gitRemote };
}

describe("parsing the search", () => {
  it("maps checks, review, conflicts, draft, branches and size", () => {
    const [failing, running, passing, none] = parseSearch(
      data(
        node(1, { ...rollup("FAILURE"), reviewDecision: "CHANGES_REQUESTED" }),
        node(2, { ...rollup("PENDING"), isDraft: true }),
        node(3, { reviewDecision: "APPROVED", mergeable: "CONFLICTING" }),
        node(4, { ...rollup(null), reviewDecision: "REVIEW_REQUIRED" }),
      ),
    );
    expect(failing).toMatchObject({ checks: "failing", review: "changes_requested" });
    expect(running).toMatchObject({ checks: "running", draft: true });
    expect(passing).toMatchObject({ checks: "passing", review: "approved", conflicts: true });
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
      review: "required",
      conflicts: false,
      updatedAt: "2026-11-17T09:30:00Z",
    });
  });
});

describe("the pull request reader", () => {
  it("serves the project's repo out of the one shared search, never searching again", async () => {
    const { read, cache } = reader({
      fetchedAt: NOW - 60_000,
      data: data(
        node(1972),
        node(5, { repository: { nameWithOwner: "acme/app" } }),
        node(1973, { repository: { nameWithOwner: "ProductStudioInc/COPS" } }),
      ),
    });
    const result = await read("proj_cops");
    expect(result).toMatchObject({
      repo: "productstudioinc/cops",
      fetchedAt: NOW - 60_000,
      retryAt: null,
    });
    expect(result.pullRequests.map((p) => p.number)).toEqual([1972, 1973]);
    expect(cache.refresh).not.toHaveBeenCalled();
  });

  it("searches on a read only when nothing was ever read", async () => {
    const { read, cache } = reader({});
    expect((await read("proj_cops")).pullRequests.map((p) => p.number)).toEqual([1]);
    expect(cache.refresh).toHaveBeenCalledTimes(1);
  });

  it("reads the repo from the project's own checkout when bb has no remote on record", async () => {
    const { read, gitRemote } = reader({
      fetchedAt: NOW - 60_000,
      data: data(
        node(108, { repository: { nameWithOwner: "sankalpaacharya/gymside" } }),
        node(1),
      ),
    });
    const result = await read("proj_fig");
    expect(result.repo).toBe("sankalpaacharya/gymside");
    expect(result.pullRequests.map((p) => p.number)).toEqual([108]);
    expect(gitRemote).toHaveBeenCalledWith("/work/fig");
  });

  it("asks git once per checkout, and again after ten minutes", async () => {
    const clock = { now: NOW };
    const { read, gitRemote } = reader({ fetchedAt: NOW, data: data() }, clock);
    await read("proj_fig");
    await read("proj_fig");
    expect(gitRemote).toHaveBeenCalledTimes(1);
    clock.now += 10 * 60_000;
    await read("proj_fig");
    expect(gitRemote).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["a personal project", "proj_me"],
    ["a project with no remote or checkout", "proj_gym"],
    ["a checkout off GitHub", "proj_lab"],
    ["a checkout without an origin", "proj_bare"],
  ])("hides the group for %s, reading nothing", async (_, projectId) => {
    const { read, cache } = reader({});
    expect(await read(projectId)).toEqual({
      repo: null,
      pullRequests: [],
      fetchedAt: null,
      retryAt: null,
    });
    expect(cache.read).not.toHaveBeenCalled();
  });

  it("trusts bb's remote on record over the checkout", async () => {
    const { read, gitRemote } = reader({});
    expect((await read("proj_gitlab")).repo).toBeNull();
    expect(gitRemote).not.toHaveBeenCalled();
  });

  it("keeps the last PRs while a failed read backs off, and says until when", async () => {
    const { read } = reader({
      fetchedAt: NOW - 20 * 60_000,
      nextAllowedAt: NOW + 7 * 60_000,
      failures: 1,
      lastError: { at: NOW - 60_000, kind: "rate-limited", message: "API rate limit exceeded" },
      data: data(node(1)),
    });
    expect(await read("proj_cops")).toMatchObject({
      pullRequests: [{ number: 1 }],
      retryAt: NOW + 7 * 60_000,
    });
  });
});
