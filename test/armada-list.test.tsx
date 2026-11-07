// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";

import app from "../app";
import type { CaptainRecord } from "../lib/captains";
import { NOW, project, thread } from "./fixtures";

const stored = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => void stored.set(key, value),
});

vi.stubGlobal("matchMedia", () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
}));

beforeEach(() => stored.clear());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const projects = [
  project("proj_a", "Alpha"),
  project("proj_b", "Beta"),
  project("proj_me", "Personal", true),
];

const registry = (...ids: string[]): CaptainRecord[] =>
  ids.map((id) => ({
    threadId: id,
    logo: "rocket",
    color: "emerald",
    createdAt: "2026-01-01T00:00:00.000Z",
  }));

const busy = { status: "active" } as const;

const threads = [
  thread("cap", { title: "Captain Alpha", projectId: "proj_a" }),
  thread("w_busy1", { title: "Build parser", parentThreadId: "cap", ...busy }),
  thread("w_busy2", { title: "Write docs", parentThreadId: "cap", ...busy }),
  thread("w_wait", {
    title: "Approve deploy",
    parentThreadId: "cap",
    hasPendingInteraction: true,
  }),
  thread("w_deep", { title: "Nested helper", parentThreadId: "w_busy1" }),
  thread("plain", { title: "Loose idea", projectId: "proj_b", updatedAt: NOW }),
];

async function render(
  options: {
    registry?: CaptainRecord[];
    threads?: typeof threads;
    activeThreadId?: string | null;
    rpc?: Record<string, (input: never) => unknown>;
  } = {},
) {
  const loaded = await loadPluginApp(app);
  const registration = loaded.threadLists[0];
  if (registration === undefined)
    throw new Error("thread list is not registered");
  const onNavigate = vi.fn();
  const view = renderSlot(
    registration,
    {
      activeThreadId: options.activeThreadId ?? null,
      activeProjectId: "proj_b",
      isCompactViewport: false,
      onNavigate,
      searchQuery: "",
    },
    {
      sidebarThreads: {
        status: "ready",
        threads: options.threads ?? threads,
        projects,
        sections: [],
      },
      rpc: {
        captains_list: () => options.registry ?? registry("cap"),
        ...options.rpc,
      } as never,
    },
  );
  return { view, onNavigate };
}

const anchorOf = (container: HTMLElement, id: string) =>
  container.querySelector<HTMLAnchorElement>(
    `a[data-sidebar-thread-id="${id}"]`,
  );
const rowOf = (container: HTMLElement, id: string) =>
  anchorOf(container, id)?.closest("li") ?? null;
const listOf = (container: HTMLElement, id: string) =>
  rowOf(container, id)?.closest("ul")?.getAttribute("aria-label") ?? null;

describe("Armada thread list", () => {
  it("nests every worker under its captain and leaves the captain tree out of the thread list", async () => {
    const { view } = await render();
    await waitFor(() => expect(rowOf(view.container, "cap")).not.toBeNull());

    const workers = within(
      screen.getByRole("list", { name: "Workers of Captain Alpha" }),
    );
    for (const title of ["Build parser", "Write docs", "Approve deploy"]) {
      expect(workers.getByText(title)).toBeTruthy();
    }
    expect(workers.queryByText("Nested helper")).toBeNull();
    const list = screen.getByRole("list", { name: "Threads" });
    expect(
      within(list)
        .getAllByRole("link")
        .map((link) => link.getAttribute("aria-label")),
    ).toEqual(["Loose idea"]);
    expect(listOf(view.container, "plain")).toBe("Threads");
    expect(listOf(view.container, "cap")).toBe("Captains");
  });

  it("nests the workers inside their captain's list item, under a heading that is only its title", async () => {
    const { view } = await render();
    await waitFor(() => expect(rowOf(view.container, "cap")).not.toBeNull());
    const workers = screen.getByRole("list", { name: "Workers of Captain Alpha" });
    expect(rowOf(view.container, "cap")!.contains(workers)).toBe(true);
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(["Captains", "Threads"]);
  });

  it("names the captain without the title's emoji", async () => {
    const { view } = await render({
      threads: [
        thread("cap", { title: "🧭 Captain · Alpha", projectId: "proj_a" }),
      ],
    });
    await waitFor(() => expect(rowOf(view.container, "cap")).not.toBeNull());
    const row = within(rowOf(view.container, "cap")!);
    expect(row.getByText("Captain · Alpha")).toBeTruthy();
    expect(row.queryByText(/🧭/)).toBeNull();
    expect(row.getByRole("link", { name: "Captain · Alpha" })).toBeTruthy();
  });

  it("still lists every thread when the captains read fails", async () => {
    const { view } = await render({
      rpc: {
        captains_list: () => {
          throw new Error("kv unavailable");
        },
      },
    });
    await waitFor(() => expect(rowOf(view.container, "cap")).not.toBeNull());
    expect(listOf(view.container, "cap")).toBe("Threads");
    expect(listOf(view.container, "plain")).toBe("Threads");
  });

  it("shows bb's waiting glyph on a captain whose worker needs you", async () => {
    const { view } = await render();
    await waitFor(() => expect(rowOf(view.container, "cap")).not.toBeNull());
    expect(
      rowOf(view.container, "cap")!.querySelector(
        '[data-thread-status-glyph="waiting-for-input"]',
      ),
    ).not.toBeNull();
  });

  it("shows the age on an idle captain and no workers toggle", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    const { view } = await render({
      threads: [thread("cap", { title: "Captain Alpha", projectId: "proj_a" })],
    });
    await waitFor(() => expect(rowOf(view.container, "cap")).not.toBeNull());
    expect(within(rowOf(view.container, "cap")!).getByText("1h")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /workers/i })).toBeNull();
  });

  it("shows five workers and the rest on request", async () => {
    await render({
      threads: [
        thread("cap", { title: "Captain Alpha" }),
        ...Array.from({ length: 7 }, (_, index) =>
          thread(`w${index}`, {
            title: `Worker ${index}`,
            parentThreadId: "cap",
            updatedAt: NOW - index * 1000,
            ...busy,
          }),
        ),
      ],
    });
    const workers = await screen.findByRole("list", {
      name: "Workers of Captain Alpha",
    });
    expect(within(workers).getAllByRole("link")).toHaveLength(5);
    fireEvent.click(within(workers).getByRole("button", { name: "2 more" }));
    expect(within(workers).getAllByRole("link")).toHaveLength(7);
  });

  it("draws a thread as a card with its project, status, branch, pull request and harness", async () => {
    const { view } = await render({
      threads: [
        thread("plain", {
          title: "Loose idea",
          projectId: "proj_b",
          status: "active",
          environment: {
            id: "env_1",
            name: "loose-idea",
            branchName: "feat/loose-idea",
            path: null,
            isWorktree: true,
            providerId: null,
            workspaceDisplayKind: null,
          },
        }),
      ],
      rpc: {
        pullRequests: () => ({
          env_1: {
            outcome: "available",
            pullRequest: {
              number: 42,
              title: "Loose idea",
              url: "https://github.com/acme/app/pull/42",
              state: "open",
              attention: "none",
              checks: { state: "passing" },
            },
          },
        }),
      },
    });
    await waitFor(() => expect(rowOf(view.container, "plain")).not.toBeNull());
    const card = within(rowOf(view.container, "plain")!);
    expect(card.getByText("Beta")).toBeTruthy();
    expect(card.getByRole("img", { name: "Working" })).toBeTruthy();
    expect(card.getByText("feat/loose-idea")).toBeTruthy();
    expect(card.getByLabelText("Worktree")).toBeTruthy();
    expect(
      rowOf(view.container, "plain")!.querySelector(
        '[data-provider-id="claude-code"]',
      ),
    ).not.toBeNull();
    expect(
      (await card.findByRole("link", { name: "#42" })).getAttribute("href"),
    ).toBe("https://github.com/acme/app/pull/42");
  });

  it("shows only the chosen project's threads, without repeating the project on each card", async () => {
    stored.set("armada/thread-scope", JSON.stringify("proj_b"));
    const { view } = await render({
      threads: [
        thread("a", { title: "Alpha work", projectId: "proj_a" }),
        thread("b", { title: "Beta work", projectId: "proj_b" }),
      ],
    });
    await waitFor(() => expect(rowOf(view.container, "b")).not.toBeNull());
    expect(rowOf(view.container, "a")).toBeNull();
    expect(within(rowOf(view.container, "b")!).queryByText("Beta")).toBeNull();
  });

  it("picks a project from a list that opens inside the sidebar", async () => {
    const { view } = await render({
      threads: [
        thread("a", { title: "Alpha work", projectId: "proj_a" }),
        thread("b", { title: "Beta work", projectId: "proj_b" }),
      ],
    });
    await waitFor(() => expect(rowOf(view.container, "a")).not.toBeNull());
    fireEvent.click(
      screen.getByRole("button", { name: "Threads from All projects" }),
    );
    const list = screen.getByRole("listbox", { name: "Show threads from" });
    expect(view.container.contains(list)).toBe(true);
    fireEvent.click(within(list).getByRole("option", { name: "Beta" }));
    await waitFor(() => expect(rowOf(view.container, "a")).toBeNull());
    expect(rowOf(view.container, "b")).not.toBeNull();
    expect(
      screen.queryByRole("listbox", { name: "Show threads from" }),
    ).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Threads from Beta" }),
    );
  });

  it("moves through the project list with the keyboard and hands focus back on Escape", async () => {
    const { view } = await render();
    await waitFor(() => expect(rowOf(view.container, "plain")).not.toBeNull());
    const trigger = screen.getByRole("button", {
      name: "Threads from All projects",
    });
    fireEvent.click(trigger);
    const list = screen.getByRole("listbox", { name: "Show threads from" });
    const all = within(list).getByRole("option", { name: "All projects" });
    expect(document.activeElement).toBe(all);
    expect(all.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(document.activeElement).toBe(
      within(list).getByRole("option", { name: "Alpha" }),
    );
    fireEvent.keyDown(list, { key: "End" });
    expect(document.activeElement).toBe(
      within(list).getByRole("option", { name: "Personal" }),
    );
    fireEvent.keyDown(list, { key: "Escape" });
    expect(
      screen.queryByRole("listbox", { name: "Show threads from" }),
    ).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes the project list on a click elsewhere", async () => {
    const { view } = await render();
    await waitFor(() => expect(rowOf(view.container, "plain")).not.toBeNull());
    fireEvent.click(
      screen.getByRole("button", { name: "Threads from All projects" }),
    );
    expect(screen.getByRole("listbox", { name: "Show threads from" })).toBeTruthy();
    fireEvent.pointerDown(document.body);
    await waitFor(() =>
      expect(
        screen.queryByRole("listbox", { name: "Show threads from" }),
      ).toBeNull(),
    );
  });

  it("falls back to every project when the remembered one is gone", async () => {
    stored.set("armada/thread-scope", JSON.stringify("proj_gone"));
    const { view } = await render();
    await waitFor(() => expect(rowOf(view.container, "plain")).not.toBeNull());
    expect(
      within(rowOf(view.container, "plain")!).getByText("Beta"),
    ).toBeTruthy();
  });

  it("says when the chosen project has no threads", async () => {
    stored.set("armada/thread-scope", JSON.stringify("proj_me"));
    await render();
    expect(await screen.findByText("No threads in Personal yet.")).toBeTruthy();
  });

  it("gives every row bb's thread-row contract", async () => {
    const { view } = await render({ activeThreadId: "w_wait" });
    await waitFor(() =>
      expect(anchorOf(view.container, "plain")).not.toBeNull(),
    );
    for (const id of ["cap", "w_busy1", "plain"]) {
      const anchor = anchorOf(view.container, id)!;
      expect(anchor.getAttribute("href")).toBe(
        `/projects/proj_a/threads/${id}`,
      );
      expect(anchor.hasAttribute("data-sidebar-thread-shortcut-target")).toBe(
        true,
      );
    }
    expect(
      anchorOf(view.container, "w_wait")!.getAttribute("aria-current"),
    ).toBe("page");
    expect(
      anchorOf(view.container, "plain")!.hasAttribute("aria-current"),
    ).toBe(false);
  });

  it("opens a thread on click and in a split on cmd-click, then closes the mobile drawer", async () => {
    const { view, onNavigate } = await render();
    await waitFor(() =>
      expect(anchorOf(view.container, "plain")).not.toBeNull(),
    );
    fireEvent.click(anchorOf(view.container, "plain")!);
    fireEvent.click(anchorOf(view.container, "w_busy2")!, { metaKey: true });
    expect(view.inspection.navigateCalls).toEqual([
      { method: "toThread", threadId: "plain", options: { split: false } },
      { method: "toThread", threadId: "w_busy2", options: { split: true } },
    ]);
    expect(onNavigate).toHaveBeenCalledTimes(2);
  });

  it("opens the workers of a captain with something going on and remembers a manual toggle", async () => {
    const { view } = await render();
    const toggle = await screen.findByRole("button", { name: "Hide workers" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(
      screen.queryByRole("list", { name: "Workers of Captain Alpha" }),
    ).toBeNull();
    expect(JSON.parse(stored.get("armada/captain-toggles")!)).toEqual({
      cap: false,
    });
    view.unmount();

    await render();
    expect(
      (
        await screen.findByRole("button", { name: "Show workers" })
      ).getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("keeps the workers of a quiet captain closed until asked", async () => {
    await render({
      threads: [
        thread("cap", { title: "Captain Alpha" }),
        thread("w", { title: "Idle worker", parentThreadId: "cap" }),
      ],
    });
    const toggle = await screen.findByRole("button", { name: "Show workers" });
    expect(screen.queryByText("Idle worker")).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByText("Idle worker")).toBeTruthy();
  });

  it("invites the first captain when there are none", async () => {
    await render({
      registry: registry(),
      threads: [thread("plain", { title: "Loose idea" })],
    });
    expect(
      await screen.findByText(
        "Start a captain to run a project from one chat.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "New captain" })).toBeTruthy();
  });

  it("shows a captain as soon as the server invalidates the captains read", async () => {
    let answer = registry();
    const { view } = await render({ rpc: { captains_list: () => answer } });
    await waitFor(() => expect(rowOf(view.container, "cap")).not.toBeNull());
    expect(listOf(view.container, "cap")).toBe("Threads");
    answer = registry("cap");
    await view.experimental_invalidateRpc(["captains"]);
    await waitFor(() => expect(listOf(view.container, "cap")).toBe("Captains"));
  });
});

describe("creating a captain", () => {
  it("creates it from the dialog with the chosen project, logo and colour, then opens it", async () => {
    const created = {
      threadId: "thr_new",
      logo: "flag",
      color: "violet",
      createdAt: "2026-02-01T00:00:00.000Z",
    };
    const { view, onNavigate } = await render({
      rpc: { captains_create: () => created },
    });
    fireEvent.click(await screen.findByRole("button", { name: "New captain" }));

    const dialog = within(await screen.findByRole("dialog"));
    expect(
      dialog.getByRole("option", { name: "Beta" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(dialog.getByText("Captain · Beta")).toBeTruthy();
    fireEvent.click(dialog.getByRole("option", { name: "Alpha" }));
    fireEvent.click(dialog.getByRole("radio", { name: "flag" }));
    fireEvent.click(dialog.getByRole("radio", { name: "Violet" }));
    fireEvent.click(dialog.getByRole("button", { name: "Create captain" }));

    await waitFor(() =>
      expect(view.inspection.navigateCalls).toEqual([
        { method: "toThread", threadId: "thr_new", options: undefined },
      ]),
    );
    expect(
      view.inspection.rpcCalls.find((call) => call.method === "captains_create")
        ?.input,
    ).toEqual({
      projectId: "proj_a",
      projectName: "Alpha",
      logo: "flag",
      color: "violet",
    });
    expect(onNavigate).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("lists personal projects after the others", async () => {
    await render();
    fireEvent.click(await screen.findByRole("button", { name: "New captain" }));
    const names = within(await screen.findByRole("dialog"))
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(names).toEqual(["Alpha", "Beta", "Personal"]);
  });

  it("stays open and does not navigate when the server refuses", async () => {
    const { view } = await render({
      rpc: {
        captains_create: () => {
          throw new Error("no host");
        },
      },
    });
    fireEvent.click(await screen.findByRole("button", { name: "New captain" }));
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.click(dialog.getByRole("button", { name: "Create captain" }));
    await waitFor(() =>
      expect(
        view.inspection.rpcCalls.some(
          (call) => call.method === "captains_create",
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(
        (
          dialog.getByRole("button", {
            name: "Create captain",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    expect(view.inspection.navigateCalls).toEqual([]);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

describe("thread menu", () => {
  const rightClick = (element: HTMLElement) => fireEvent.contextMenu(element);

  it("offers to make a root thread a captain and adopts it with the picked logo", async () => {
    const { view } = await render();
    await waitFor(() =>
      expect(anchorOf(view.container, "plain")).not.toBeNull(),
    );
    rightClick(anchorOf(view.container, "plain")!);
    fireEvent.click(
      await screen.findByRole("menuitem", { name: /Make captain/ }),
    );

    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText("Loose idea")).toBeTruthy();
    expect(dialog.queryByRole("listbox", { name: "Project" })).toBeNull();
    fireEvent.click(dialog.getByRole("radio", { name: "crown" }));
    fireEvent.click(dialog.getByRole("button", { name: "Make captain" }));
    await waitFor(() =>
      expect(
        view.inspection.rpcCalls.find(
          (call) => call.method === "captains_adopt",
        )?.input,
      ).toMatchObject({
        threadId: "plain",
        logo: "crown",
      }),
    );
  });

  it("offers it on a root whose parent is archived", async () => {
    const { view } = await render({
      threads: [
        thread("parent", { isArchived: true, archivedAt: NOW }),
        thread("orphan", { title: "Orphan", parentThreadId: "parent" }),
      ],
    });
    await waitFor(() =>
      expect(anchorOf(view.container, "orphan")).not.toBeNull(),
    );
    rightClick(anchorOf(view.container, "orphan")!);
    expect(
      await screen.findByRole("menuitem", { name: /Make captain/ }),
    ).toBeTruthy();
  });

  it("does not offer it on a worker", async () => {
    const { view } = await render();
    await waitFor(() =>
      expect(anchorOf(view.container, "w_busy2")).not.toBeNull(),
    );
    rightClick(anchorOf(view.container, "w_busy2")!);
    expect(screen.queryByRole("menuitem", { name: /Make captain/ })).toBeNull();
  });

  it("lets a captain change its logo or be removed without touching the thread", async () => {
    const { view } = await render();
    await waitFor(() => expect(anchorOf(view.container, "cap")).not.toBeNull());
    rightClick(anchorOf(view.container, "cap")!);
    expect(screen.queryByRole("menuitem", { name: /Make captain/ })).toBeNull();
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Remove from captains" }),
    );
    await waitFor(() =>
      expect(
        view.inspection.rpcCalls.find(
          (call) => call.method === "captains_remove",
        )?.input,
      ).toEqual({ threadId: "cap" }),
    );
    expect(view.inspection.sdkCalls).toEqual([]);

    rightClick(anchorOf(view.container, "cap")!);
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Change logo…" }),
    );
    const dialog = within(await screen.findByRole("dialog"));
    expect(
      dialog
        .getByRole("radio", { name: "rocket" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    fireEvent.click(dialog.getByRole("radio", { name: "map" }));
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(
        view.inspection.rpcCalls.find(
          (call) => call.method === "captains_update",
        )?.input,
      ).toMatchObject({ threadId: "cap", logo: "map" }),
    );
  });
});
