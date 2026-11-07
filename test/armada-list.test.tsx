// @vitest-environment jsdom
import {
  act,
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
import type { ParkRecord } from "../lib/lifecycle";
import { NOW, project, settledAt, snoozedUntil, thread } from "./fixtures";

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
    avatar: { style: "adventurer", seed: id },
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
    parks?: ParkRecord[];
    threads?: typeof threads;
    activeThreadId?: string | null;
    rpc?: Record<string, (input: never) => unknown>;
    sdk?: Record<string, unknown>;
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
        parks_list: () => options.parks ?? [],
        ...options.rpc,
      } as never,
      sdk: options.sdk as never,
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
    expect(screen.getByRole("heading", { level: 2, name: "Captains" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Threads" })).toBeTruthy();
  });

  it("shows the captain's title as it is, with its avatar as a decorative image in the tile", async () => {
    const { view } = await render({
      threads: [thread("cap", { title: "cops", projectId: "proj_a" })],
    });
    await waitFor(() => expect(rowOf(view.container, "cap")).not.toBeNull());
    const row = rowOf(view.container, "cap")!;
    expect(within(row).getByRole("link", { name: "cops" })).toBeTruthy();
    const image = row.querySelector("img");
    expect(image?.getAttribute("alt")).toBe("");
    expect(image?.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
    expect(image?.parentElement?.className).toContain("rounded-");
    expect(image?.parentElement?.className).not.toContain("rounded-full");
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

  it("sums up the captain's tree under its name: how many are working and how many need you", async () => {
    const { view } = await render();
    await waitFor(() => expect(rowOf(view.container, "cap")).not.toBeNull());
    const captain = within(
      rowOf(view.container, "cap")!.querySelector("div.group\\/row")!,
    );
    expect(captain.getByText("2 working")).toBeTruthy();
    expect(captain.getByText("1 needs you")).toBeTruthy();
    expect(captain.queryByText("Idle")).toBeNull();
  });

  it("draws the shade grid on a captain whose tree is working and nothing needs you", async () => {
    const { view } = await render({
      threads: [
        thread("cap", { title: "cops" }),
        thread("w", { title: "Build", parentThreadId: "cap", ...busy }),
      ],
    });
    await waitFor(() => expect(rowOf(view.container, "cap")).not.toBeNull());
    const captain = within(
      rowOf(view.container, "cap")!.querySelector("div.group\\/row")!,
    );
    expect(captain.getByText("1 working")).toBeTruthy();
    expect(captain.getByRole("img", { name: "Working" })).toBeTruthy();
  });

  it("says Idle with the age on a quiet captain, and offers no workers toggle", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    const { view } = await render({
      threads: [thread("cap", { title: "Captain Alpha", projectId: "proj_a" })],
    });
    await waitFor(() => expect(rowOf(view.container, "cap")).not.toBeNull());
    const row = within(rowOf(view.container, "cap")!);
    expect(row.getByText("1h")).toBeTruthy();
    expect(row.getByText("Idle")).toBeTruthy();
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
  it("creates it from the dialog with the typed name, chosen project and avatar, then opens it", async () => {
    const created = {
      threadId: "thr_new",
      avatar: { style: "adventurer", seed: "x" },
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
    const preview = (text: string) =>
      dialog
        .getAllByText(text)
        .filter((element) => element.closest("[role=option]") === null);
    const name = dialog.getByRole("textbox", { name: "Name" }) as HTMLInputElement;
    expect(preview("Beta")).toHaveLength(1);
    expect(name.value).toBe("Beta");
    fireEvent.click(dialog.getByRole("option", { name: "Alpha" }));
    expect(preview("Alpha")).toHaveLength(1);
    expect(name.value).toBe("Alpha");
    fireEvent.change(name, { target: { value: "  Fleet " } });
    fireEvent.click(dialog.getByRole("option", { name: "Beta" }));
    fireEvent.click(dialog.getByRole("option", { name: "Alpha" }));
    expect(name.value).toBe("  Fleet ");
    expect(dialog.getByText("Fleet")).toBeTruthy();
    const avatars = within(dialog.getByRole("listbox", { name: "Avatar" }));
    const seedsBefore = avatars
      .getAllByRole("option")
      .map((option) => option.querySelector("img")?.getAttribute("src"));
    expect(new Set(seedsBefore).size).toBe(12);
    fireEvent.click(dialog.getByRole("button", { name: "Shuffle" }));
    const seedsAfter = avatars
      .getAllByRole("option")
      .map((option) => option.querySelector("img")?.getAttribute("src"));
    expect(seedsAfter).not.toEqual(seedsBefore);
    fireEvent.click(avatars.getByRole("option", { name: "Avatar 3" }));
    fireEvent.keyDown(name, { key: "Enter" });

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
      name: "Fleet",
      avatar: { style: "adventurer", seed: expect.stringMatching(/^[a-z0-9]{10}$/) },
    });
    expect(onNavigate).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("will not create a captain without a name", async () => {
    const { view } = await render();
    fireEvent.click(await screen.findByRole("button", { name: "New captain" }));
    const dialog = within(await screen.findByRole("dialog"));
    const name = dialog.getByRole("textbox", { name: "Name" });
    fireEvent.change(name, { target: { value: "   " } });
    const button = dialog.getByRole("button", {
      name: "Create captain",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.keyDown(name, { key: "Enter" });
    fireEvent.click(button);
    expect(
      view.inspection.rpcCalls.some((call) => call.method === "captains_create"),
    ).toBe(false);
  });

  it("lists personal projects after the others", async () => {
    await render();
    fireEvent.click(await screen.findByRole("button", { name: "New captain" }));
    const names = within(
      within(await screen.findByRole("dialog")).getByRole("listbox", {
        name: "Project",
      }),
    )
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

  it("offers to make a root thread a captain and adopts it with the picked avatar, keeping its title", async () => {
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
    const picked = dialog.getByRole("option", { name: "Avatar 5" });
    fireEvent.click(picked);
    const pickedSrc = picked.querySelector("img")?.getAttribute("src");
    fireEvent.click(dialog.getByRole("button", { name: "Make captain" }));
    await waitFor(() =>
      expect(
        view.inspection.rpcCalls.find(
          (call) => call.method === "captains_adopt",
        )?.input,
      ).toMatchObject({ threadId: "plain", avatar: { style: "adventurer" } }),
    );
    expect(pickedSrc).toBeTruthy();
    expect(view.inspection.sdkCalls).toEqual([]);
  });

  it("renames the thread it adopts when the name was changed", async () => {
    const { view } = await render({
      sdk: { threads: { update: async () => ({}) } },
      rpc: { captains_adopt: () => registry("plain")[0] },
    });
    await waitFor(() =>
      expect(anchorOf(view.container, "plain")).not.toBeNull(),
    );
    rightClick(anchorOf(view.container, "plain")!);
    fireEvent.click(
      await screen.findByRole("menuitem", { name: /Make captain/ }),
    );
    const dialog = within(await screen.findByRole("dialog"));
    const name = dialog.getByRole("textbox", { name: "Name" }) as HTMLInputElement;
    expect(name.value).toBe("Loose idea");
    fireEvent.change(name, { target: { value: "Idea captain" } });
    fireEvent.click(dialog.getByRole("button", { name: "Make captain" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(view.inspection.sdkCalls).toEqual([
      {
        method: "threads.update",
        args: [{ threadId: "plain", title: "Idea captain" }],
      },
    ]);
    expect(
      view.inspection.rpcCalls.find((call) => call.method === "captains_adopt")
        ?.input,
    ).toMatchObject({ threadId: "plain" });
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

  it("lets a captain change only its avatar or be removed without touching the thread", async () => {
    const { view } = await render({
      rpc: { captains_update: () => registry("cap")[0] },
    });
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
      await screen.findByRole("menuitem", { name: "Edit captain…" }),
    );
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByRole("heading", { name: "Edit captain" })).toBeTruthy();
    expect(
      (dialog.getByRole("textbox", { name: "Name" }) as HTMLInputElement).value,
    ).toBe("Captain Alpha");
    expect(dialog.getByText("Alpha")).toBeTruthy();
    expect(dialog.queryByRole("listbox", { name: "Project" })).toBeNull();
    const save = dialog.getByRole("button", {
      name: "Save changes",
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    const current = dialog.getByRole("option", { name: "Avatar 1" });
    expect(current.getAttribute("aria-selected")).toBe("true");
    expect(current.querySelector("img")?.getAttribute("src")).toBe(
      rowOf(view.container, "cap")!.querySelector("img")?.getAttribute("src"),
    );
    fireEvent.click(dialog.getByRole("option", { name: "Avatar 2" }));
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() =>
      expect(
        view.inspection.rpcCalls.find(
          (call) => call.method === "captains_update",
        )?.input,
      ).toMatchObject({ threadId: "cap", avatar: { style: "adventurer" } }),
    );
    expect(
      (
        view.inspection.rpcCalls.find(
          (call) => call.method === "captains_update",
        )?.input as { avatar: { seed: string } }
      ).avatar.seed,
    ).not.toBe("cap");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(view.inspection.sdkCalls).toEqual([]);
  });

  const editCaptain = async (sdk: Record<string, unknown>) => {
    const rendered = await render({ sdk });
    await waitFor(() =>
      expect(anchorOf(rendered.view.container, "cap")).not.toBeNull(),
    );
    rightClick(anchorOf(rendered.view.container, "cap")!);
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Edit captain…" }),
    );
    const dialog = within(await screen.findByRole("dialog"));
    return {
      ...rendered,
      dialog,
      name: dialog.getByRole("textbox", { name: "Name" }),
      save: dialog.getByRole("button", {
        name: "Save changes",
      }) as HTMLButtonElement,
    };
  };

  it("renames a captain's thread without touching its avatar", async () => {
    const { view, name, save } = await editCaptain({
      threads: { update: async () => ({}) },
    });
    fireEvent.change(name, { target: { value: " Captain Alpha " } });
    expect(save.disabled).toBe(true);
    fireEvent.change(name, { target: { value: "" } });
    expect(save.disabled).toBe(true);
    fireEvent.change(name, { target: { value: "Flagship" } });
    fireEvent.keyDown(name, { key: "Enter" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(view.inspection.sdkCalls).toEqual([
      { method: "threads.update", args: [{ threadId: "cap", title: "Flagship" }] },
    ]);
    expect(
      view.inspection.rpcCalls.some((call) => call.method === "captains_update"),
    ).toBe(false);
  });

  it("keeps the edit open when the rename fails", async () => {
    const { name, save } = await editCaptain({
      threads: {
        update: async () => {
          throw new Error("offline");
        },
      },
    });
    fireEvent.change(name, { target: { value: "Flagship" } });
    fireEvent.click(save);
    await waitFor(() => expect(save.disabled).toBe(false));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

describe("shelves", () => {
  const HOUR = 3_600_000;

  it("settles a card from its hover button, lists it under Settled, and brings it back with Move to active", async () => {
    let parks: ParkRecord[] = [];
    const { view } = await render({
      threads: [
        thread("done", { title: "Finished work", projectId: "proj_b" }),
        thread("other", { title: "Other work", projectId: "proj_b" }),
      ],
      rpc: {
        parks_list: () => parks,
        parks_settle: ({ threadId }: { threadId: string }) => {
          const park = settledAt(threadId, NOW);
          parks = [park];
          return park;
        },
        parks_unpark: ({ threadId }: { threadId: string }) => {
          parks = parks.filter((park) => park.threadId !== threadId);
          return null;
        },
      },
    });
    await waitFor(() => expect(rowOf(view.container, "done")).not.toBeNull());
    fireEvent.click(
      within(rowOf(view.container, "done")!).getByRole("button", {
        name: "Settle",
      }),
    );
    await waitFor(() =>
      expect(
        view.inspection.rpcCalls.find((call) => call.method === "parks_settle")
          ?.input,
      ).toEqual({ threadId: "done" }),
    );
    await view.experimental_invalidateRpc(["parks"]);
    await waitFor(() => expect(listOf(view.container, "done")).toBeNull());
    expect(listOf(view.container, "other")).toBe("Threads");
    expect(screen.getByRole("heading", { name: /Settled/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Show settled" }));
    expect(listOf(view.container, "done")).toBe("Settled");
    fireEvent.click(
      within(rowOf(view.container, "done")!).getByRole("button", {
        name: "Move to active",
      }),
    );
    await waitFor(() => expect(listOf(view.container, "done")).toBe("Threads"));
    expect(
      view.inspection.rpcCalls.find((call) => call.method === "parks_unpark")
        ?.input,
    ).toEqual({ threadId: "done" });
  });

  it("offers no park buttons on a working card, and keeps a stored settle from hiding it", async () => {
    const { view } = await render({
      threads: [thread("busy", { title: "Busy", ...busy })],
      parks: [settledAt("busy", NOW)],
    });
    await waitFor(() => expect(rowOf(view.container, "busy")).not.toBeNull());
    expect(listOf(view.container, "busy")).toBe("Threads");
    expect(
      within(rowOf(view.container, "busy")!).queryByRole("button", {
        name: "Settle",
      }),
    ).toBeNull();
    expect(screen.queryByRole("heading", { name: /Settled/ })).toBeNull();
  });

  it("shows a snoozed thread with its wake time and wakes it on time", async () => {
    vi.useFakeTimers({ now: NOW, shouldAdvanceTime: true });
    const { view } = await render({
      threads: [thread("later", { title: "Later" })],
      parks: [snoozedUntil("later", NOW + 2 * HOUR)],
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Show snoozed" })).toBeTruthy(),
    );
    expect(
      screen.getByText("Nothing active. Settled and snoozed threads are below."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show snoozed" }));
    expect(listOf(view.container, "later")).toBe("Snoozed");
    expect(within(rowOf(view.container, "later")!).getByText("2h")).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(2 * HOUR + 100);
    });
    expect(listOf(view.container, "later")).toBe("Threads");
  });

  it("puts Settle, the snooze presets and Move to active in the thread menu", async () => {
    const { view } = await render({
      threads: [
        thread("quiet", { title: "Quiet" }),
        thread("parked", { title: "Parked" }),
      ],
      parks: [settledAt("parked", NOW)],
    });
    await waitFor(() => expect(anchorOf(view.container, "quiet")).not.toBeNull());
    fireEvent.contextMenu(anchorOf(view.container, "quiet")!);
    expect(await screen.findByRole("menuitem", { name: "Settle" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Snooze/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "Settle" }));
    await waitFor(() =>
      expect(
        view.inspection.rpcCalls.find((call) => call.method === "parks_settle")
          ?.input,
      ).toEqual({ threadId: "quiet" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Show settled" }));
    fireEvent.contextMenu(anchorOf(view.container, "parked")!);
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Move to active" }),
    );
    await waitFor(() =>
      expect(
        view.inspection.rpcCalls.find((call) => call.method === "parks_unpark")
          ?.input,
      ).toEqual({ threadId: "parked" }),
    );
  });
});
