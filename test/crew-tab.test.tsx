// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";

import { CrewTab } from "../components/crew-tab";
import type { CaptainHome } from "../lib/captain-home";
import { pr, project, thread } from "./fixtures";

afterEach(cleanup);

type ReadyHome = Extract<CaptainHome, { status: "ready" }>;

const stored = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => void stored.set(key, value),
  removeItem: (key: string) => void stored.delete(key),
});

beforeEach(() => stored.clear());

const ready = (...paths: string[]): ReadyHome => ({
  status: "ready",
  folder: "~/.bb/captains/cops",
  root: "/home/me/.bb/captains/cops",
  files: paths.map((path) => ({
    path,
    sizeBytes: 100,
    modifiedAt: Date.now() - 3_600_000,
  })),
});

function renderCrew(
  home: () => unknown,
  options: {
    workers?: PluginSidebarThread[];
    sdk?: Record<string, unknown>;
    rpc?: Record<string, unknown>;
  } = {},
) {
  return renderSlot(
    { component: CrewTab },
    { threadId: "cap", environment: null, params: null },
    {
      sidebarThreads: {
        status: "ready",
        threads: [
          thread("cap", {
            title: "cops",
            host: { id: "host_mac", name: "MacBook" },
          }),
          ...(options.workers ?? []),
        ],
        projects: [project("proj_a", "cops")],
        sections: [],
      },
      rpc: {
        captains_list: () => [
          {
            threadId: "cap",
            avatar: { style: "micah", seed: "cap" },
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        parks_list: () => [],
        captain_supervisors: () => [],
        captain_home: home,
        crew_pull_requests: () => ({
          repo: null,
          pullRequests: [],
          fetchedAt: null,
          retryAt: null,
        }),
        ...options.rpc,
      } as never,
      sdk: options.sdk as never,
      settings: { inactiveAfterHours: 0 },
    },
  );
}

/** Each row of the Memory section, with its age dropped. */
const memoryRows = () =>
  within(screen.getByRole("heading", { name: "Memory" }).closest("section")!)
    .queryAllByRole("button")
    .filter(
      (button) =>
        button.textContent !== "Memory" &&
        button.getAttribute("aria-label") !== "Refresh memory",
    )
    .map((button) => button.textContent?.replace(/(\d+[a-z]+|now)$/, ""));

describe("the crew tab's memory", () => {
  it("shows the captain's home as files, startup memory first, then a folder per task, and opens one in bb's preview on the captain's machine", async () => {
    const view = renderCrew(() =>
      ready(
        "tasks/fix-login/brief.md",
        "archive.md",
        "backlog.md",
        "captain.md",
        "learnings.md",
      ),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Memory" }));
    await screen.findByText("~/.bb/captains/cops");
    expect(
      view.inspection.rpcCalls.find((call) => call.method === "captain_home")?.input,
    ).toEqual({ threadId: "cap", project: "cops" });
    expect(memoryRows()).toEqual([
      "captain.md",
      "learnings.md",
      "backlog.md",
      "archive.md",
      "tasks/",
      "fix-login/",
    ]);
    fireEvent.click(screen.getByRole("button", { name: /fix-login/ }));
    fireEvent.click(screen.getByRole("button", { name: /brief\.md/ }));
    expect(view.inspection.navigateCalls).toContainEqual({
      method: "experimental_openFilePreview",
      options: {
        target: {
          kind: "host",
          hostId: "host_mac",
          path: "/home/me/.bb/captains/cops/tasks/fix-login/brief.md",
        },
        location: null,
      },
    });
  });
});

describe("the crew tab's workers", () => {
  const MINUTE = 60_000;
  const workers = [
    thread("w_fix", { title: "Fix login", parentThreadId: "cap" }),
    thread("w_owned", {
      title: "Owned helper",
      parentThreadId: "cap",
      lifecycleOwnerThreadId: "cap",
    }),
  ];
  const workerRow = (name: string) =>
    screen.getByText(name).closest("button")!;

  it("takes a worker out of the crew from its menu, unless its lifecycle owner would keep it there", async () => {
    const view = renderCrew(() => ready(), {
      workers,
      sdk: { threads: { update: async () => ({}) } },
    });
    await screen.findByText("Owned helper");
    fireEvent.contextMenu(workerRow("Owned helper"));
    await screen.findByRole("menu");
    expect(screen.queryByRole("menuitem", { name: "Remove from crew" })).toBeNull();
    fireEvent.contextMenu(workerRow("Fix login"));
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Remove from crew" }),
    );
    await waitFor(() =>
      expect(view.inspection.sdkCalls).toEqual([
        {
          method: "threads.update",
          args: [{ threadId: "w_fix", parentThreadId: null }],
        },
      ]),
    );
  });

  it("settles a worker from its hover button, moving it under a folded Settled", async () => {
    let parks: unknown[] = [];
    const view = renderCrew(() => ready(), {
      workers,
      rpc: {
        parks_list: () => parks,
        parks_settle: ({ threadId, at }: { threadId: string; at: number }) => {
          const park = { threadId, kind: "settled", at, by: "user" };
          parks = [park];
          return park;
        },
      },
    });
    await screen.findByText("Fix login");
    const row = workerRow("Fix login").closest("li")!;
    fireEvent.click(within(row).getByRole("button", { name: "Settle" }));
    await waitFor(() => expect(parks).toHaveLength(1));
    await view.experimental_invalidateRpc(["parks"]);
    const settled = await screen.findByRole("button", { name: /^Settled/ });
    expect(screen.queryByText("Fix login")).toBeNull();
    fireEvent.click(settled);
    expect(
      within(screen.getByRole("region", { name: "Settled" })).getByText("Fix login"),
    ).toBeTruthy();
  });

  it("shows one time per row, a run's since its turn started rather than its last change, an idle one's age", async () => {
    const turnStartedAt = Date.now() - 64 * MINUTE;
    const view = renderCrew(() => ready(), {
      workers: [
        thread("w_long", {
          title: "Long run",
          parentThreadId: "cap",
          status: "active",
          runtimeStatus: "active",
          createdAt: Date.now() - 3 * 60 * MINUTE,
          updatedAt: Date.now() - 2 * MINUTE,
        }),
        thread("w_idle", {
          title: "Resting",
          parentThreadId: "cap",
          createdAt: Date.now() - 60 * MINUTE,
          updatedAt: Date.now() - 60 * MINUTE,
        }),
      ],
      sdk: {
        threads: {
          events: { list: async () => [{ createdAt: turnStartedAt }] },
        },
      },
    });
    const times = (name: string) =>
      screen.getByText(name).closest("button")!.querySelectorAll("[title]");
    await screen.findByText("Long run");
    await waitFor(() => expect(times("Long run")[0]?.textContent).toBe("1h 4m"));
    expect(view.inspection.sdkCalls).toEqual([
      {
        method: "threads.events.list",
        args: [
          expect.objectContaining({
            threadId: "w_long",
            types: ["turn/started"],
            order: "desc",
            limit: "1",
          }),
        ],
      },
    ]);
    expect(times("Long run")).toHaveLength(1);
    expect(times("Resting")).toHaveLength(1);
    expect(times("Resting")[0]?.textContent).toBe("1h ago");
  });
});

describe("the crew tab's pull requests", () => {
  const fixer = thread("w_fix", {
    title: "WEB-41",
    parentThreadId: "cap",
    environment: {
      id: "env_fix",
      name: "fix",
      branchName: "capy/fix-sign-up-form",
      path: null,
      isWorktree: true,
      providerId: null,
      workspaceDisplayKind: null,
    },
  });
  const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000 - 60_000).toISOString();
  const pulls = {
    repo: "productstudioinc/cops",
    fetchedAt: Date.now() - 60_000,
    retryAt: null,
    pullRequests: [
      pr(8357, {
        title: "Fix the sign up form",
        head: "capy/fix-sign-up-form",
        checks: "failing",
        updatedAt: twoDaysAgo,
      }),
      pr(8360, { title: "Tidy the footer", review: "approved" }),
    ],
  };
  const section = () => screen.getByRole("region", { name: "Pull requests" });

  it("lists the user's open PRs in the captain's repo, asking by project, with the repo and branches in the tooltip", async () => {
    const view = renderCrew(() => ready(), {
      workers: [fixer],
      rpc: { crew_pull_requests: () => pulls },
    });
    const heading = await screen.findByRole("button", { name: /^Pull requests/ });
    expect(heading.textContent).toBe("Pull requests2");
    expect(
      view.inspection.rpcCalls.find(
        (call) => call.method === "crew_pull_requests",
      )?.input,
    ).toEqual({ projectId: "proj_a" });
    const [first, second] = within(section()).getAllByRole("listitem");
    expect(first!.textContent).toBe("Fix the sign up form#8357·2d·via WEB-41+17−35");
    expect(
      within(first!).getByRole("button", { name: "Fix the sign up form" })
        .getAttribute("title"),
    ).toBe(
      "Fix the sign up form\ncops#8357 · main ← capy/fix-sign-up-form\nChecks failing",
    );
    expect(within(second!).getByLabelText("Ready")).toBeTruthy();
  });

  it("opens the PR in the default browser, and its worker from the via", async () => {
    const view = renderCrew(() => ready(), {
      workers: [fixer],
      rpc: {
        crew_pull_requests: () => pulls,
        open_pull_request: () => true,
      },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Tidy the footer" }),
    );
    await waitFor(() =>
      expect(
        view.inspection.rpcCalls.find(
          (call) => call.method === "open_pull_request",
        )?.input,
      ).toEqual({ url: "https://github.com/productstudioinc/cops/pull/8360" }),
    );
    expect(view.inspection.navigateCalls).not.toContainEqual(
      expect.objectContaining({ method: "openUrl" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "via WEB-41" }));
    expect(await screen.findByRole("button", { name: /Crew/ })).toBeTruthy();
  });

  it("keeps the PRs when a read fails, saying how old they are and when it retries", async () => {
    renderCrew(() => ready(), {
      rpc: {
        crew_pull_requests: () => ({
          ...pulls,
          fetchedAt: Date.now() - 12 * 60_000 - 1000,
          retryAt: Date.now() + 7 * 60_000,
        }),
      },
    });
    const heading = await screen.findByRole("button", { name: /^Pull requests/ });
    expect(heading.textContent).toBe("Pull requests212m");
    expect(within(heading).getByLabelText(/^Updated 12m ago\. GitHub is not answering; retrying at /)).toBeTruthy();
    expect(within(section()).getAllByRole("listitem")).toHaveLength(2);
  });

  it("asks for a fresh search every five minutes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const view = renderCrew(() => ready(), {
        rpc: {
          crew_pull_requests: () => pulls,
          pull_requests_refresh: () => null,
        },
      });
      await screen.findByRole("button", { name: /^Pull requests/ });
      const refreshes = () =>
        view.inspection.rpcCalls.filter(
          (call) => call.method === "pull_requests_refresh",
        ).length;
      expect(refreshes()).toBe(0);
      await vi.advanceTimersByTimeAsync(5 * 60_000);
      expect(refreshes()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
