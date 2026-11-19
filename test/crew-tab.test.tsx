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
  const reads: unknown[] = [];
  const view = renderSlot(
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
        captain_home: (input: unknown) => {
          reads.push(input);
          return home();
        },
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
  return { view, reads };
}

const openMemory = async () =>
  fireEvent.click(await screen.findByRole("button", { name: "Memory" }));

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
  it("shows the captain's home as files, startup memory first, then a folder per task", async () => {
    const { reads } = renderCrew(() =>
      ready(
        "tasks/fix-login/brief.md",
        "archive.md",
        "backlog.md",
        "captain.md",
        "learnings.md",
      ),
    );
    await openMemory();
    await screen.findByText("~/.bb/captains/cops");
    expect(new Set(reads.map((read) => JSON.stringify(read)))).toEqual(
      new Set([JSON.stringify({ threadId: "cap", project: "cops" })]),
    );
    expect(memoryRows()).toEqual([
      "captain.md",
      "learnings.md",
      "backlog.md",
      "archive.md",
      "tasks/",
      "fix-login/",
    ]);
    fireEvent.click(screen.getByRole("button", { name: /fix-login/ }));
    expect(memoryRows()).toContain("brief.md");
  });

  it("opens a file whole in bb's preview, on the captain's machine", async () => {
    const { view } = renderCrew(() => ready("tasks/fix-login/brief.md"));
    await openMemory();
    fireEvent.click(await screen.findByRole("button", { name: /fix-login/ }));
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

  it("reads the folder again when opened, and when Refresh is pressed", async () => {
    const { reads } = renderCrew(() => ready("backlog.md"));
    await screen.findByRole("button", { name: "Memory" });
    await waitFor(() => expect(reads.length).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const beforeOpen = reads.length;
    await openMemory();
    await waitFor(() => expect(reads.length).toBeGreaterThan(beforeOpen));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const beforeRefresh = reads.length;
    fireEvent.click(screen.getByRole("button", { name: "Refresh memory" }));
    await waitFor(() => expect(reads.length).toBeGreaterThan(beforeRefresh));
  });

  it("resizes the open folder from its top edge, and keeps the height", async () => {
    stored.clear();
    renderCrew(() => ready("captain.md"));
    await openMemory();
    const handle = await screen.findByRole("separator", { name: "Resize memory" });
    const before = Number(handle.getAttribute("aria-valuenow"));
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(Number(handle.getAttribute("aria-valuenow"))).toBe(before + 24);
    expect(stored.get("armada:memory-height")).toBe(String(before + 24));
    fireEvent.doubleClick(handle);
    expect(Number(handle.getAttribute("aria-valuenow"))).toBe(before);
  });

  it("starts folded, opens, and folds away again", async () => {
    renderCrew(() => ready("backlog.md"));
    const header = await screen.findByRole("button", { name: "Memory" });
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(memoryRows()).toEqual([]);
    fireEvent.click(header);
    expect(header.getAttribute("aria-expanded")).toBe("true");
    await waitFor(() => expect(memoryRows()).toEqual(["backlog.md"]));
    fireEvent.click(header);
    expect(memoryRows()).toEqual([]);
  });

  it("says when the captain has no memory folder yet", async () => {
    renderCrew(() => ({
      status: "missing",
      folder: "~/.bb/captains/cops",
    }));
    await openMemory();
    await screen.findByText("No memory folder yet at ~/.bb/captains/cops.");
  });
});

describe("the crew tab's workers", () => {
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

  it("takes a worker out of the crew from its menu, clearing its parent", async () => {
    const { view } = renderCrew(() => ready(), {
      workers,
      sdk: { threads: { update: async () => ({}) } },
    });
    await screen.findByText("Fix login");
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

  it("settles a worker from its hover button, moving it under Settled", async () => {
    let parks: unknown[] = [];
    const { view } = renderCrew(() => ready(), {
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
    await waitFor(() =>
      expect(
        view.inspection.rpcCalls.find((call) => call.method === "parks_settle")
          ?.input,
      ).toEqual({ threadId: "w_fix", at: expect.any(Number) }),
    );
    await view.experimental_invalidateRpc(["parks"]);
    fireEvent.click(await screen.findByRole("button", { name: /^Settled/ }));
    expect(
      within(screen.getByRole("region", { name: "Settled" })).getByText("Fix login"),
    ).toBeTruthy();
  });

  it("folds Active, and keeps Settled folded until it is opened", async () => {
    renderCrew(() => ready(), {
      workers,
      rpc: {
        parks_list: () => [
          { threadId: "w_fix", kind: "settled", at: Date.now(), by: "user" },
        ],
      },
    });
    const settled = await screen.findByRole("button", { name: /^Settled/ });
    expect(settled.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Fix login")).toBeNull();
    fireEvent.click(settled);
    expect(await screen.findByText("Fix login")).toBeTruthy();
    const active = screen.getByRole("button", { name: /^Active/ });
    expect(screen.getByText("Owned helper")).toBeTruthy();
    fireEvent.click(active);
    expect(screen.queryByText("Owned helper")).toBeNull();
  });

  it("offers Settle and Snooze in a worker's menu", async () => {
    renderCrew(() => ready(), { workers });
    await screen.findByText("Fix login");
    fireEvent.contextMenu(workerRow("Fix login"));
    expect(await screen.findByRole("menuitem", { name: "Settle" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Snooze/ })).toBeTruthy();
  });

  it("does not offer it for a worker its lifecycle owner would keep in the crew", async () => {
    renderCrew(() => ready(), { workers });
    await screen.findByText("Owned helper");
    fireEvent.contextMenu(workerRow("Owned helper"));
    await screen.findByRole("menu");
    expect(
      screen.queryByRole("menuitem", { name: "Remove from crew" }),
    ).toBeNull();
  });
});

describe("the crew tab's running workers", () => {
  const MINUTE = 60_000;
  const running = (id: string, title: string, updatedAgo: number) =>
    thread(id, {
      title,
      parentThreadId: "cap",
      status: "active",
      runtimeStatus: "active",
      createdAt: Date.now() - 3 * 60 * MINUTE,
      updatedAt: Date.now() - updatedAgo,
    });
  const timeOf = (name: string) =>
    screen.getByText(name).closest("button")!.querySelector("[title]");

  it("shows how long a worker has run since its turn started, not since its last change", async () => {
    const turnStartedAt = Date.now() - 64 * MINUTE;
    const { view } = renderCrew(() => ready(), {
      workers: [
        running("w_long", "Long run", 2 * MINUTE),
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
    await screen.findByText("Long run");
    await waitFor(() =>
      expect(timeOf("Long run")?.textContent).toBe("1h 4m"),
    );
    expect(timeOf("Long run")?.getAttribute("title")).toMatch(
      /^Running for 1h 4m · started .+ · created .+ \(3h ago\)$/,
    );
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
    expect(timeOf("Resting")?.textContent).toBe("1h ago");
    expect(timeOf("Resting")?.getAttribute("title")).toMatch(
      /^Created .+ \(1h ago\) · idle for 1h · /,
    );
    expect(
      screen.getByText("Resting").closest("button")!.querySelectorAll("[title]"),
    ).toHaveLength(1);
  });

  it("counts from the thread's last change when the turn cannot be read, and says so", async () => {
    renderCrew(() => ready(), {
      workers: [running("w_new", "New run", 5 * MINUTE)],
      sdk: {
        threads: {
          events: {
            list: async () => {
              throw new Error("offline");
            },
          },
        },
      },
    });
    await screen.findByText("New run");
    expect(timeOf("New run")?.textContent).toBe("5m");
    await waitFor(() =>
      expect(timeOf("New run")?.getAttribute("title")).toMatch(
        /by its last status change · created /,
      ),
    );
  });

  it("puts the longest run in the captain's summary tooltip", async () => {
    renderCrew(() => ready(), {
      workers: [
        running("w_a", "First", 12 * MINUTE),
        running("w_b", "Second", 34 * MINUTE),
      ],
      sdk: { threads: { events: { list: async () => [] } } },
    });
    await screen.findByText("First");
    const summary = screen.getByText("2 working").parentElement!;
    expect(summary.getAttribute("title")).toBe("2 working · longest 34m");
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

  it("lists the user's open PRs in the captain's repo, asking by project", async () => {
    const { view } = renderCrew(() => ready(), {
      workers: [fixer],
      rpc: { crew_pull_requests: () => pulls },
    });
    const heading = await screen.findByRole("button", {
      name: /^Pull requests/,
    });
    expect(heading.textContent).toBe("Pull requests2");
    expect(
      view.inspection.rpcCalls.find(
        (call) => call.method === "crew_pull_requests",
      )?.input,
    ).toEqual({ projectId: "proj_a" });
    const first = within(section()).getAllByRole("listitem")[0]!;
    expect(first.textContent).toBe("Fix the sign up form#8357·2d·via WEB-41+17−35");
    expect(within(first).getByLabelText("Checks failing")).toBeTruthy();
    expect(
      within(first).getByLabelText("17 lines added, 35 removed"),
    ).toBeTruthy();
    const second = within(section()).getAllByRole("listitem")[1]!;
    expect(second.textContent).not.toContain("via");
    expect(within(second).getByLabelText("Ready")).toBeTruthy();
  });

  it("keeps the repo and branches out of the row, in its tooltip", async () => {
    renderCrew(() => ready(), {
      workers: [fixer],
      rpc: { crew_pull_requests: () => pulls },
    });
    const title = await screen.findByRole("button", {
      name: "Fix the sign up form",
    });
    expect(section().textContent).not.toMatch(/cops#|←/);
    expect(title.getAttribute("title")).toBe(
      "Fix the sign up form\ncops#8357 · main ← capy/fix-sign-up-form\nChecks failing",
    );
  });

  it("scrolls the PRs in a box of their own, under a heading that stays", async () => {
    renderCrew(() => ready(), {
      workers: [fixer],
      rpc: {
        crew_pull_requests: () => ({
          ...pulls,
          pullRequests: Array.from({ length: 15 }, (_, i) => pr(9000 + i)),
        }),
      },
    });
    const heading = await screen.findByRole("button", {
      name: /^Pull requests/,
    });
    const list = within(section()).getByTestId("pull-request-list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(15);
    expect(list.contains(heading)).toBe(false);
    expect(list.className).toMatch(/\bmax-h-\[/);
    expect(list.className).toMatch(/\boverflow-auto\b/);
    expect(list.contains(screen.getByText("WEB-41"))).toBe(false);
  });

  it("opens the PR in the default browser, and its worker from the via", async () => {
    const { view } = renderCrew(() => ready(), {
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
    expect(
      await screen.findByRole("button", { name: /Crew/ }),
    ).toBeTruthy();
    expect(
      view.inspection.rpcCalls.filter(
        (call) => call.method === "open_pull_request",
      ),
    ).toHaveLength(1);
  });

  it("falls back to bb's browser when the default one could not open it", async () => {
    const { view } = renderCrew(() => ready(), {
      rpc: {
        crew_pull_requests: () => pulls,
        open_pull_request: () => false,
      },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Tidy the footer" }),
    );
    await waitFor(() =>
      expect(view.inspection.navigateCalls).toContainEqual({
        method: "openUrl",
        url: "https://github.com/productstudioinc/cops/pull/8360",
      }),
    );
  });

  it("keeps the PRs when a read fails, saying how old they are and when it retries", async () => {
    const retryAt = Date.now() + 7 * 60_000;
    renderCrew(() => ready(), {
      rpc: {
        crew_pull_requests: () => ({
          ...pulls,
          fetchedAt: Date.now() - 12 * 60_000 - 1000,
          retryAt,
        }),
      },
    });
    const heading = await screen.findByRole("button", { name: /^Pull requests/ });
    expect(heading.textContent).toBe("Pull requests212m");
    expect(within(heading).getByLabelText(/^Updated 12m ago\. GitHub is not answering; retrying at /)).toBeTruthy();
    expect(within(section()).getAllByRole("listitem")).toHaveLength(2);
  });

  it("only asks for a fresh search on its five-minute timer", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { view } = renderCrew(() => ready(), {
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
      fireEvent.click(screen.getByRole("button", { name: /^Pull requests/ }));
      fireEvent.click(screen.getByRole("button", { name: /^Pull requests/ }));
      expect(refreshes()).toBe(0);
      await vi.advanceTimersByTimeAsync(5 * 60_000);
      expect(refreshes()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("hides the section when the project has no repo", async () => {
    const { view } = renderCrew(() => ready(), { workers: [fixer] });
    await screen.findByText("WEB-41");
    await waitFor(() =>
      expect(
        view.inspection.rpcCalls.some(
          (call) => call.method === "crew_pull_requests",
        ),
      ).toBe(true),
    );
    expect(screen.queryByRole("button", { name: /^Pull requests/ })).toBeNull();
  });

  it("starts open, and remembers being folded", async () => {
    renderCrew(() => ready(), {
      rpc: { crew_pull_requests: () => pulls },
    });
    const heading = await screen.findByRole("button", {
      name: /^Pull requests/,
    });
    expect(heading.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(heading);
    expect(screen.queryByText(/Tidy the footer/)).toBeNull();
    expect(JSON.parse(stored.get("armada:crew-groups")!)).toMatchObject({
      "Pull requests": false,
    });
    cleanup();
    renderCrew(() => ready(), {
      rpc: { crew_pull_requests: () => pulls },
    });
    expect(
      (
        await screen.findByRole("button", { name: /^Pull requests/ })
      ).getAttribute("aria-expanded"),
    ).toBe("false");
  });
});
