// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PluginProvidersState,
  PluginThreadActionsContextMenuProps,
  PluginThreadActionsInlineItem,
} from "@get-bb/plugin-sdk/app";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";

import app from "../app";
import { avatarDataUri } from "../lib/avatar";
import type { Avatar, CaptainRecord } from "../lib/captains";
import { moveCaptain } from "../lib/captain-order";
import { rpcContract } from "../lib/rpc";
import type { ParkRecord } from "../lib/lifecycle";
import { NOW, project, settledAt, snoozedUntil, thread } from "./fixtures";

/**
 * The fake thread menu runs an item without a value, so a test picks a choice
 * by running the row's item itself, as bb's submenu does.
 */
const menuItems = vi.hoisted(
  () => new Map<string, readonly PluginThreadActionsInlineItem[]>(),
);
vi.mock("@get-bb/plugin-sdk/app", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@get-bb/plugin-sdk/app")>();
  const Menu = actual.experimental_ThreadActionsContextMenu;
  return {
    ...actual,
    experimental_ThreadActionsContextMenu: (
      props: PluginThreadActionsContextMenuProps,
    ) => {
      menuItems.set(props.thread.id, props.inline ?? []);
      return createElement(Menu, props);
    },
  };
});

const pick = (threadId: string, key: string, value: string) =>
  act(async () => {
    const item = menuItems.get(threadId)?.find((each) => each.key === key);
    if (item === undefined) throw new Error(`no ${key} item on ${threadId}`);
    await item.action.run({ value, requestRename: () => {} });
  });

const stored = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => void stored.set(key, value),
  removeItem: (key: string) => void stored.delete(key),
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

const execution = {
  providerId: "claude-code",
  model: "claude-sonnet-4-6",
  reasoningLevel: "high",
  serviceTier: "default",
};

const fastCatalog = {
  modelLoadError: null,
  providers: [
    {
      id: "codex",
      capabilities: { supportsServiceTier: true },
      serviceTiers: [{ id: "fast" }],
    },
  ],
  models: [
    {
      id: "gpt-5.5",
      model: "gpt-5.5",
      supportedServiceTiers: [{ id: "fast" }],
    },
  ],
  selectedOnlyModels: [],
};

const codexProject = {
  providers: { models: async () => fastCatalog },
  projects: {
    get: async () => ({ sources: [{ hostId: "host_mac", isDefault: true }] }),
    defaultExecutionOptions: async () => ({
      ...execution,
      providerId: "codex",
      model: "gpt-5.5",
    }),
  },
};

const createButton = () =>
  screen.getByRole("button", { name: "Create captain" }) as HTMLButtonElement;
const waitCreateReady = () =>
  waitFor(() => expect(createButton().disabled).toBe(false));
const serviceTier = () =>
  (screen.getByLabelText("Service tier") as HTMLSelectElement).value;
const applySelection = (fields: Record<string, string>) => {
  for (const [label, value] of Object.entries(fields)) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  fireEvent.click(
    screen.getByRole("button", { name: "Apply execution selection" }),
  );
};

const projects = [
  project("proj_a", "Alpha"),
  project("proj_b", "Beta"),
  project("proj_me", "Personal", true),
];

const registry = (...ids: string[]): CaptainRecord[] =>
  ids.map((id) => ({
    threadId: id,
    avatar: { style: "micah", seed: id },
    createdAt: "2026-01-01T00:00:00.000Z",
  }));

const recorded = {
  captains_create: () => ({
    outcome: "recorded",
    record: registry("thr_new")[0],
  }),
};

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
    settings?: Record<string, number | boolean>;
    providers?: Partial<PluginProvidersState>;
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
      providers: options.providers,
      sidebarThreads: {
        status: "ready",
        threads: options.threads ?? threads,
        projects,
        sections: [],
      },
      rpc: {
        captains_list: () => options.registry ?? registry("cap"),
        parks_list: () => options.parks ?? [],
        parks_evaluate: () => ({ changed: [] }),
        captain_supervisors: () => [],
        captain_instructions: () => "",
        project_logos: () => ({}),
        ...options.rpc,
      } as never,
      sdk: {
        system: {
          config: async () => ({
            primaryHostId: "host_mac",
            generalSettings: { defaultProviderId: "codex" },
          }),
        },
        providers: {
          models: async () => ({
            modelLoadError: null,
            providers: [],
            models: [],
            selectedOnlyModels: [],
          }),
        },
        projects: {
          get: async () => ({
            sources: [{ hostId: "host_mac", isDefault: true }],
          }),
          defaultExecutionOptions: async () => ({
            ...execution,
            permissionMode: "auto",
          }),
        },
        threads: { defaultExecutionOptions: async () => execution },
        ...options.sdk,
      } as never,
      settings: options.settings ?? { inactiveAfterHours: 0 },
    },
  );
  return { view, onNavigate };
}

type View = Awaited<ReturnType<typeof render>>["view"];

const inputOf = (view: View, method: string) =>
  view.inspection.rpcCalls.find((call) => call.method === method)?.input;
const callsOf = (view: View, method: string) =>
  view.inspection.rpcCalls.filter((call) => call.method === method);
const threadWrites = (view: View) =>
  view.inspection.sdkCalls.filter(
    (call) => call.method !== "threads.defaultExecutionOptions",
  );

const anchorOf = (container: HTMLElement, id: string) =>
  container.querySelector<HTMLAnchorElement>(
    `a[data-sidebar-thread-id="${id}"]`,
  );
const rowOf = (container: HTMLElement, id: string) =>
  anchorOf(container, id)?.closest("li") ?? null;
const listOf = (container: HTMLElement, id: string) =>
  rowOf(container, id)?.closest("ul")?.getAttribute("aria-label") ?? null;

const previewAvatar = () =>
  screen
    .getByRole("button", { name: "New avatar" })
    .querySelector("img")
    ?.getAttribute("src");

const projectTrigger = (dialog: ReturnType<typeof within>) =>
  dialog.getByRole("button", { name: /^Project: / });

async function openNewCaptain() {
  fireEvent.click(await screen.findByRole("button", { name: "New captain" }));
  await screen.findByTestId("bb-provider-model-picker");
  return within(await screen.findByRole("dialog"));
}

async function openMenu(view: View, id: string, item: string | RegExp) {
  await waitFor(() => expect(anchorOf(view.container, id)).not.toBeNull());
  fireEvent.contextMenu(anchorOf(view.container, id)!);
  fireEvent.click(await screen.findByRole("menuitem", { name: item }));
  return within(await screen.findByRole("dialog"));
}

async function openEdit(view: View) {
  const dialog = await openMenu(view, "cap", "Edit captain…");
  return {
    dialog,
    name: dialog.getByRole("textbox", { name: "Name" }),
    save: dialog.getByRole("button", { name: "Save changes" }),
  };
}

describe("captain reordering", () => {
  const fleet = [
    thread("a", { title: "Alpha", projectId: "proj_a" }),
    thread("b", { title: "Beta", projectId: "proj_b" }),
    thread("c", { title: "Gamma", projectId: "proj_me" }),
  ];
  const order = () =>
    within(screen.getByRole("list", { name: "Captains" }))
      .getAllByRole("link")
      .map((link) => link.getAttribute("data-sidebar-thread-id"));
  const reorderable = () => {
    let records = registry("a", "b", "c");
    return render({
      threads: fleet,
      rpc: {
        captains_list: () => records,
        captains_reorder: (input) => {
          const { threadId, beforeThreadId } =
            rpcContract.captains_reorder.input.parse(input);
          records = moveCaptain(records, threadId, beforeThreadId);
          return null;
        },
      },
    });
  };

  it("drags a captain ahead of another without opening its thread", async () => {
    const { view, onNavigate } = await reorderable();
    const handle = await screen.findByRole("button", { name: "Reorder Gamma" });
    const dataTransfer = { setData: vi.fn() };
    fireEvent.dragStart(handle, { dataTransfer });
    const target = rowOf(view.container, "a")!;
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });
    await waitFor(() => expect(order()).toEqual(["c", "a", "b"]));
    expect(callsOf(view, "captains_reorder").map((call) => call.input)).toEqual(
      [{ threadId: "c", beforeThreadId: "a" }],
    );
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("moves up and down with the keyboard and keeps the handle focused", async () => {
    await reorderable();
    const handle = await screen.findByRole("button", { name: "Reorder Gamma" });
    handle.focus();
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    await waitFor(() => expect(order()).toEqual(["a", "c", "b"]));
    await waitFor(() =>
      expect(handle.getAttribute("aria-disabled")).toBe("false"),
    );
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    await waitFor(() => expect(order()).toEqual(["a", "b", "c"]));
    expect(document.activeElement).toBe(handle);
  });

  it("rolls back a failed save", async () => {
    let reject: (cause: Error) => void = () => {};
    const saved = new Promise<null>((_resolve, fail) => {
      reject = fail;
    });
    await render({
      threads: fleet,
      registry: registry("a", "b", "c"),
      rpc: { captains_reorder: () => saved },
    });
    fireEvent.keyDown(
      await screen.findByRole("button", { name: "Reorder Gamma" }),
      { key: "ArrowUp" },
    );
    await waitFor(() => expect(order()).toEqual(["a", "c", "b"]));
    await act(async () => reject(new Error("disk full")));
    await waitFor(() => expect(order()).toEqual(["a", "b", "c"]));
  });
});

describe("Armada thread list", () => {
  it("keeps a captain's threads out of the sidebar list, counts them on the captain's row, a failure as failed rather than needing you, and counts the active threads in its header", async () => {
    const { view } = await render({
      threads: [
        ...threads,
        thread("w_fail", { parentThreadId: "cap", indicator: "unread-error" }),
      ],
    });
    await waitFor(() => expect(rowOf(view.container, "cap")).not.toBeNull());
    expect(listOf(view.container, "cap")).toBe("Captains");
    expect(listOf(view.container, "plain")).toBe("Threads");
    for (const id of ["w_busy1", "w_busy2", "w_wait", "w_deep", "w_fail"]) {
      expect(anchorOf(view.container, id)).toBeNull();
    }
    const captain = within(rowOf(view.container, "cap")!);
    expect(captain.getByText("2 working")).toBeTruthy();
    expect(captain.getByText("1 needs you")).toBeTruthy();
    expect(captain.getByText("1 failed")).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 2, name: "Threads" }).textContent,
    ).toBe("Threads1");
  });

  it("badges every captain with its thread provider while preserving the primary avatar", async () => {
    const { view } = await render({
      threads: [thread("cap", { providerId: "codex" })],
      providers: {
        providers: [{ id: "codex", displayName: "Codex" }] as never,
      },
    });
    await waitFor(() =>
      expect(anchorOf(view.container, "cap")?.getAttribute("title")).toBe(
        "Provider: Codex",
      ),
    );
    const row = rowOf(view.container, "cap")!;
    expect(row.querySelector('[data-provider-id="codex"]')).not.toBeNull();
    expect(row.querySelector("img")?.getAttribute("src")).toBe(
      avatarDataUri({ style: "micah", seed: "cap" }),
    );
  });

  const invitation = "Start a captain to run a project from one chat.";

  it("says the captains are loading instead of inviting the first one", async () => {
    await render({ rpc: { captains_list: () => new Promise(() => {}) } });
    expect(await screen.findByText("Loading captains…")).toBeTruthy();
    expect(screen.queryByText(invitation)).toBeNull();
  });

  it("says the captains could not be read instead of inviting the first one, and still lists every thread", async () => {
    const { view } = await render({
      rpc: {
        captains_list: () => {
          throw new Error("kv unavailable");
        },
      },
    });
    expect(await screen.findByText("Could not load captains")).toBeTruthy();
    expect(screen.queryByText(invitation)).toBeNull();
    expect(listOf(view.container, "cap")).toBe("Threads");
    expect(listOf(view.container, "plain")).toBe("Threads");
  });

  it("invites the first captain when there are none, and shows one as soon as the server invalidates the captains read", async () => {
    let answer = registry();
    const { view } = await render({ rpc: { captains_list: () => answer } });
    expect(await screen.findByText(invitation)).toBeTruthy();
    expect(listOf(view.container, "cap")).toBe("Threads");
    answer = registry("cap");
    await view.experimental_invalidateRpc(["captains"]);
    await waitFor(() => expect(listOf(view.container, "cap")).toBe("Captains"));
  });

  it("forgets the keys it no longer reads: the old registry cache and the worker toggles", async () => {
    stored.set("armada/captains", "{}");
    stored.set("armada/captain-toggles", "{}");
    const { view } = await render();
    await waitFor(() => expect(rowOf(view.container, "plain")).not.toBeNull());
    expect(stored.has("armada/captains")).toBe(false);
    expect(stored.has("armada/captain-toggles")).toBe(false);
  });

  it("draws every thread with its project, where it runs, its PR and its harness under the title, open or not, with no tooltip", async () => {
    const worktree = (id: string) => ({
      id,
      name: id,
      branchName: `feat/${id}`,
      path: null,
      isWorktree: true,
      providerId: null,
      workspaceDisplayKind: null,
    });
    const { view } = await render({
      activeThreadId: "opened",
      threads: [
        thread("plain", { projectId: "proj_b", environment: worktree("env_1") }),
        thread("opened", { projectId: "proj_b", environment: worktree("env_2") }),
      ],
      rpc: {
        pullRequests: () => ({
          env_2: { outcome: "absent" },
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
    const pr = await within(rowOf(view.container, "plain")!).findByRole(
      "link",
      { name: "#42" },
    );
    expect(pr.getAttribute("href")).toBe("https://github.com/acme/app/pull/42");
    for (const [id, environment] of [
      ["plain", "env_1"],
      ["opened", "env_2"],
    ]) {
      const row = rowOf(view.container, id)!;
      const card = within(row);
      expect(card.getByText("Beta")).toBeTruthy();
      expect(card.getByText(`feat/${environment}`)).toBeTruthy();
      expect(card.getByLabelText("Worktree")).toBeTruthy();
      expect(
        row.querySelector('[data-provider-id="claude-code"]'),
      ).not.toBeNull();
      expect(anchorOf(view.container, id)!.hasAttribute("title")).toBe(false);
    }
  });

  it("gives every row bb's thread-row contract, opening a thread on click and in a split on cmd-click", async () => {
    const { view } = await render({ activeThreadId: "cap" });
    await waitFor(() =>
      expect(anchorOf(view.container, "plain")).not.toBeNull(),
    );
    const plain = anchorOf(view.container, "plain")!;
    const cap = anchorOf(view.container, "cap")!;
    expect(plain.getAttribute("href")).toBe("/projects/proj_a/threads/plain");
    expect(plain.hasAttribute("data-sidebar-thread-shortcut-target")).toBe(
      true,
    );
    expect(cap.getAttribute("aria-current")).toBe("page");
    expect(plain.hasAttribute("aria-current")).toBe(false);
    fireEvent.click(plain);
    fireEvent.click(cap, { metaKey: true });
    expect(view.inspection.navigateCalls).toEqual([
      { method: "toThread", threadId: "plain", options: { split: false } },
      { method: "toThread", threadId: "cap", options: { split: true } },
    ]);
  });
});

describe("project scope", () => {
  const scoped = [
    thread("a", { title: "Alpha work", projectId: "proj_a" }),
    thread("b", { title: "Beta work", projectId: "proj_b" }),
    thread("me", { title: "Mine", projectId: "proj_me" }),
  ];
  const trigger = (name: string) =>
    screen.getByRole("button", { name: `Threads from ${name}` });
  const scopeList = () =>
    screen.getByRole("listbox", { name: "Show threads from" });
  const shown = (view: View) =>
    ["a", "b", "me"].filter((id) => rowOf(view.container, id) !== null);

  it("picks several projects from a list that stays open, and All projects clears them", async () => {
    const { view } = await render({ threads: scoped });
    await waitFor(() => expect(shown(view)).toEqual(["a", "b", "me"]));
    fireEvent.click(trigger("All projects"));
    const list = scopeList();
    fireEvent.click(within(list).getByRole("option", { name: /^Beta/ }));
    await waitFor(() => expect(shown(view)).toEqual(["b"]));
    fireEvent.click(within(list).getByRole("option", { name: /^Alpha/ }));
    await waitFor(() => expect(shown(view)).toEqual(["a", "b"]));
    expect(trigger("Alpha +1")).toBeTruthy();
    fireEvent.click(
      within(list).getByRole("option", { name: /^All projects/ }),
    );
    await waitFor(() => expect(shown(view)).toEqual(["a", "b", "me"]));
  });

  it("says the trigger opens a listbox, points at it only while it is open, and moves through it with the keyboard", async () => {
    const { view } = await render();
    await waitFor(() => expect(rowOf(view.container, "plain")).not.toBeNull());
    const button = trigger("All projects");
    expect(button.getAttribute("aria-haspopup")).toBe("listbox");
    expect(button.hasAttribute("aria-controls")).toBe(false);
    fireEvent.click(button);
    const list = scopeList();
    expect(button.getAttribute("aria-controls")).toBe(list.id);
    expect(document.activeElement).toBe(
      within(list).getByRole("option", { name: "All projects" }),
    );
    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(document.activeElement).toBe(
      within(list).getByRole("option", { name: /^Alpha/ }),
    );
    fireEvent.keyDown(list, { key: "Escape" });
    expect(
      screen.queryByRole("listbox", { name: "Show threads from" }),
    ).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});

describe("creating a captain", () => {
  it("creates it from the dialog with the typed name, chosen project, avatar and instructions, then opens it", async () => {
    const { view } = await render({ rpc: recorded });
    const dialog = await openNewCaptain();
    const name = dialog.getByRole("textbox", {
      name: "Name",
    }) as HTMLInputElement;
    expect(name.value).toBe("Beta");
    fireEvent.click(projectTrigger(dialog));
    fireEvent.click(dialog.getByRole("option", { name: "Personal" }));
    expect(name.value).toBe("Personal");
    fireEvent.change(name, { target: { value: "  Fleet " } });
    fireEvent.click(projectTrigger(dialog));
    fireEvent.click(dialog.getByRole("option", { name: /^Alpha/ }));
    expect(name.value).toBe("  Fleet ");
    fireEvent.change(dialog.getByRole("textbox", { name: "Instructions" }), {
      target: { value: "  Act as a senior engineer.\nKeep replies short. " },
    });
    fireEvent.click(dialog.getByRole("button", { name: "New avatar" }));
    const chosen = previewAvatar();
    await waitCreateReady();
    fireEvent.keyDown(name, { key: "Enter" });

    await waitFor(() =>
      expect(view.inspection.navigateCalls).toEqual([
        { method: "toThread", threadId: "thr_new", options: undefined },
      ]),
    );
    const sent = inputOf(view, "captains_create") as { avatar: Avatar };
    expect(sent).toEqual({
      projectId: "proj_a",
      projectName: "Alpha",
      name: "Fleet",
      execution,
      instructions: "Act as a senior engineer.\nKeep replies short.",
      avatar: { style: "micah", seed: expect.stringMatching(/^[a-z0-9]{10}$/) },
    });
    expect(avatarDataUri(sent.avatar)).toBe(chosen);
  });

  it("preserves an explicit Fast tier across provider switches, reading the catalog from the project host", async () => {
    const { view } = await render({ sdk: codexProject, rpc: recorded });
    fireEvent.click(await screen.findByRole("button", { name: "New captain" }));
    const picker = await screen.findByTestId("bb-provider-model-picker");
    expect(picker.getAttribute("data-routing-id")).toBe("host_mac");
    await waitCreateReady();
    await waitFor(() => expect(serviceTier()).toBe("default"));
    for (const fields of [
      { "Service tier": "fast" },
      { "Provider ID": "claude-code" },
      { "Provider ID": "codex" },
    ] as Record<string, string>[]) {
      applySelection(fields);
      await waitCreateReady();
    }
    await waitFor(() => expect(serviceTier()).toBe("fast"));
    fireEvent.click(createButton());
    await waitFor(() =>
      expect(inputOf(view, "captains_create")).toMatchObject({
        execution: {
          providerId: "codex",
          model: "gpt-5.5",
          reasoningLevel: "high",
          serviceTier: "fast",
        },
      }),
    );
  });

  it("disables the picker while tier discovery is pending and keeps an explicit Fast choice", async () => {
    let finish: ((catalog: typeof fastCatalog) => void) | undefined;
    let calls = 0;
    await render({
      sdk: {
        ...codexProject,
        providers: {
          models: async () =>
            ++calls === 1
              ? fastCatalog
              : new Promise<typeof fastCatalog>((resolve) => {
                  finish = resolve;
                }),
        },
      },
    });
    fireEvent.click(await screen.findByRole("button", { name: "New captain" }));
    await waitCreateReady();
    applySelection({ "Service tier": "fast" });
    await waitFor(() => expect(finish).toBeDefined());
    const picker = () =>
      screen
        .getByTestId("bb-provider-model-picker")
        .getAttribute("data-disabled");
    expect(picker()).toBe("true");
    expect(createButton().disabled).toBe(true);
    await act(async () => finish?.(fastCatalog));
    await waitCreateReady();
    await waitFor(() => expect(serviceTier()).toBe("fast"));
    expect(picker()).toBe("false");
  });

  it("records the thread a failed create already started instead of starting another", async () => {
    const { view } = await render({
      rpc: {
        captains_create: () => ({
          outcome: "unrecorded",
          threadId: "thr_new",
          home: "beta",
          reason: "disk full",
        }),
        captains_adopt: () => registry("thr_new")[0],
      },
    });
    const dialog = await openNewCaptain();
    await waitCreateReady();
    fireEvent.click(createButton());
    const retry = await dialog.findByRole("button", { name: "Record captain" });
    expect(view.inspection.navigateCalls).toEqual([]);
    fireEvent.click(retry);
    await waitFor(() =>
      expect(view.inspection.navigateCalls).toEqual([
        { method: "toThread", threadId: "thr_new", options: undefined },
      ]),
    );
    expect(callsOf(view, "captains_create")).toHaveLength(1);
    expect(inputOf(view, "captains_adopt")).toMatchObject({
      threadId: "thr_new",
      home: "beta",
    });
  });

  it("offers Use project logo only for a project with a logo, and creates the captain with it", async () => {
    const { view } = await render({
      rpc: { project_logos: () => ({ proj_a: "data:image/svg+xml;base64,PHN2Zy8+" }), ...recorded },
    });
    const dialog = await openNewCaptain();
    expect(
      dialog.queryByRole("button", { name: "Use project logo" }),
    ).toBeNull();
    fireEvent.click(projectTrigger(dialog));
    fireEvent.click(dialog.getByRole("option", { name: /^Alpha/ }));
    fireEvent.click(
      await dialog.findByRole("button", { name: "Use project logo" }),
    );
    expect(previewAvatar()).toBe("data:image/svg+xml;base64,PHN2Zy8+");
    await waitCreateReady();
    fireEvent.click(createButton());
    await waitFor(() =>
      expect(inputOf(view, "captains_create")).toMatchObject({
        projectId: "proj_a",
        avatar: { style: "logo" },
      }),
    );
  });
});

describe("thread menu", () => {
  it("offers to make a root thread a captain and adopts it with the picked avatar and name", async () => {
    const { view } = await render({
      sdk: { threads: { update: async () => ({}) } },
      rpc: { captains_adopt: () => registry("plain")[0] },
    });
    const dialog = await openMenu(view, "plain", /Make captain/);
    const name = dialog.getByRole("textbox", { name: "Name" });
    expect((name as HTMLInputElement).value).toBe("Loose idea");
    fireEvent.change(name, { target: { value: "Idea captain" } });
    fireEvent.click(dialog.getByRole("button", { name: "New avatar" }));
    const chosen = previewAvatar();
    fireEvent.click(dialog.getByRole("button", { name: "Make captain" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const sent = inputOf(view, "captains_adopt") as {
      threadId: string;
      avatar: Avatar;
    };
    expect(sent.threadId).toBe("plain");
    expect(avatarDataUri(sent.avatar)).toBe(chosen);
    expect(threadWrites(view)).toEqual([
      {
        method: "threads.update",
        args: [{ threadId: "plain", title: "Idea captain" }],
      },
    ]);
  });

  it("renames a captain and changes its model in the same conversation, fixing its provider and keeping its avatar", async () => {
    const { view } = await render({
      sdk: {
        threads: {
          defaultExecutionOptions: async () => execution,
          update: async () => ({}),
        },
      },
    });
    const { name, save } = await openEdit(view);
    const picker = await screen.findByTestId("bb-provider-model-picker");
    expect(picker.getAttribute("data-provider-change-allowed")).toBe("false");
    fireEvent.change(name, { target: { value: "Flagship" } });
    applySelection({ Model: "claude-opus-4-6", "Reasoning level": "max" });
    fireEvent.click(save);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(inputOf(view, "captains_update")).toBeUndefined();
    expect(threadWrites(view)).toEqual([
      {
        method: "threads.update",
        args: [
          {
            threadId: "cap",
            title: "Flagship",
            model: "claude-opus-4-6",
            reasoningLevel: "max",
          },
        ],
      },
    ]);
  });

  it("lets a captain change only its avatar or be removed without touching the thread", async () => {
    const { view } = await render({
      rpc: { captains_update: () => registry("cap")[0] },
    });
    await waitFor(() => expect(anchorOf(view.container, "cap")).not.toBeNull());
    fireEvent.contextMenu(anchorOf(view.container, "cap")!);
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Remove from captains" }),
    );
    await waitFor(() =>
      expect(inputOf(view, "captains_remove")).toEqual({ threadId: "cap" }),
    );

    const { dialog, save } = await openEdit(view);
    fireEvent.click(dialog.getByRole("button", { name: "New avatar" }));
    const chosen = previewAvatar();
    fireEvent.click(save);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const sent = inputOf(view, "captains_update") as {
      threadId: string;
      avatar: Avatar;
    };
    expect(sent.threadId).toBe("cap");
    expect(avatarDataUri(sent.avatar)).toBe(chosen);
    expect(threadWrites(view)).toEqual([]);
  });

  it("shows the captain's own instructions and memory folder on edit, and saves a change, telling the captain", async () => {
    const { view } = await render({
      rpc: {
        captain_instructions: () => "Be brief.",
        captain_home: () => ({
          status: "missing",
          folder: "~/.bb/captains/cap-home",
        }),
        captain_instructions_save: () => ({ told: true }),
      },
    });
    const { dialog } = await openEdit(view);
    const field = dialog.getByRole("textbox", { name: "Instructions" });
    await waitFor(() =>
      expect((field as HTMLTextAreaElement).value).toBe("Be brief."),
    );
    expect(dialog.getByText("~/.bb/captains/cap-home")).toBeTruthy();
    fireEvent.change(field, { target: { value: "Ship daily." } });
    fireEvent.keyDown(field, { key: "Enter", metaKey: true });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(inputOf(view, "captain_instructions_save")).toEqual({
      project: "Alpha",
      instructions: "Ship daily.",
      threadId: "cap",
    });
    expect(inputOf(view, "captains_update")).toBeUndefined();
    expect(threadWrites(view)).toEqual([]);
  });

  it("adds a thread to a captain of its own project, which becomes its parent, and offers none where no captain runs the project", async () => {
    const { view } = await render({
      threads: [
        thread("cap", { title: "Captain Alpha", projectId: "proj_a" }),
        thread("cap2", { title: "Captain Two", projectId: "proj_a" }),
        thread("capB", { title: "Captain Beta", projectId: "proj_b" }),
        thread("loose", { projectId: "proj_a" }),
        thread("solo", { projectId: "proj_me" }),
      ],
      registry: registry("cap", "cap2", "capB"),
      sdk: { threads: { update: async () => ({}) } },
    });
    await waitFor(() => expect(menuItems.has("solo")).toBe(true));
    const addItem = (id: string) =>
      menuItems.get(id)?.find((each) => each.key === "add-to-captain");
    expect(
      addItem("loose")?.action.choices?.items.map((choice) => choice.label),
    ).toEqual(["Captain Alpha", "Captain Two"]);
    expect(addItem("solo")).toBeUndefined();
    await pick("loose", "add-to-captain", "cap2");
    expect(threadWrites(view)).toEqual([
      {
        method: "threads.update",
        args: [{ threadId: "loose", parentThreadId: "cap2" }],
      },
    ]);
  });
});

describe("shelves", () => {
  const HOUR = 3_600_000;
  const openAllShelves = () =>
    stored.set(
      "armada/shelves",
      JSON.stringify({ inactive: true, snoozed: true, settled: true }),
    );

  it("starts Settled closed and Inactive open, and remembers a shelf you close", async () => {
    vi.useFakeTimers({ now: NOW, shouldAdvanceTime: true });
    await render({
      settings: { inactiveAfterHours: 6 },
      threads: [
        thread("quiet", {
          updatedAt: NOW - 8 * HOUR,
          createdAt: NOW - 8 * HOUR,
        }),
        thread("done"),
      ],
      parks: [settledAt("done", NOW)],
    });
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Settled" })).toBeTruthy(),
    );
    expect(screen.queryByRole("list", { name: "Settled" })).toBeNull();
    expect(screen.getByRole("list", { name: "Inactive" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Inactive/ }));
    expect(screen.queryByRole("list", { name: "Inactive" })).toBeNull();
    expect(JSON.parse(stored.get("armada/shelves") ?? "{}")).toMatchObject({
      inactive: false,
    });
    fireEvent.click(screen.getByRole("button", { name: /^Settled/ }));
    expect(screen.getByRole("list", { name: "Settled" })).toBeTruthy();
  });

  it("moves a settled card off the list before the server answers", async () => {
    openAllShelves();
    const { view } = await render({
      threads: [thread("a", { projectId: "proj_b" })],
      rpc: { parks_settle: () => new Promise(() => {}) },
    });
    await waitFor(() => expect(rowOf(view.container, "a")).not.toBeNull());
    fireEvent.click(
      within(rowOf(view.container, "a")!).getByRole("button", {
        name: "Settle",
      }),
    );
    await waitFor(() => expect(listOf(view.container, "a")).toBe("Settled"));
    expect(inputOf(view, "parks_settle")).toEqual({
      threadId: "a",
      at: expect.any(Number),
    });
  });

  it("shows no age on a card at rest, and keeps Settle, its only hover action, reachable by keyboard", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    const { view } = await render({
      threads: [thread("a", { projectId: "proj_b" })],
    });
    await waitFor(() => expect(rowOf(view.container, "a")).not.toBeNull());
    const card = within(rowOf(view.container, "a")!);
    expect(card.queryByText(/^(now|\d+[a-z]+)$/)).toBeNull();
    expect(card.queryByRole("button", { name: /Snooze/ })).toBeNull();
    const settle = card.getByRole("button", { name: "Settle" });
    settle.focus();
    expect(document.activeElement).toBe(settle);
    expect(settle.closest("[hidden], [inert], [aria-hidden=true]")).toBeNull();
  });

  it("offers no park actions on a failed card while something in its tree is still working", async () => {
    const { view } = await render({
      threads: [
        thread("root", { indicator: "unread-error" }),
        thread("child", { parentThreadId: "root", ...busy }),
      ],
      parks: [settledAt("root", NOW)],
    });
    await waitFor(() => expect(rowOf(view.container, "root")).not.toBeNull());
    expect(listOf(view.container, "root")).toBe("Threads");
    expect(
      within(rowOf(view.container, "root")!).queryByRole("button", {
        name: "Settle",
      }),
    ).toBeNull();
    fireEvent.contextMenu(anchorOf(view.container, "root")!);
    await screen.findByRole("menu");
    expect(screen.queryByRole("menuitem", { name: "Settle" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /Snooze/ })).toBeNull();
  });

  it("deletes a park that new attention has outlived, once", async () => {
    const { view } = await render({
      threads: [
        thread("back", { latestAttentionAt: NOW }),
        thread("still"),
      ],
      parks: [settledAt("back", NOW - HOUR), settledAt("still", NOW - HOUR)],
      rpc: { parks_unpark: () => null },
    });
    await waitFor(() => expect(listOf(view.container, "back")).toBe("Threads"));
    await waitFor(() =>
      expect(callsOf(view, "parks_unpark").map((call) => call.input)).toEqual(
        [{ threadId: "back" }],
      ),
    );
  });

  it("shows a snoozed thread with its wake time and wakes it on time", async () => {
    vi.useFakeTimers({ now: NOW, shouldAdvanceTime: true });
    const { view } = await render({
      threads: [thread("later")],
      parks: [snoozedUntil("later", NOW + 2 * HOUR)],
    });
    await waitFor(() =>
      expect(listOf(view.container, "later")).toBe("Snoozed"),
    );
    expect(
      within(rowOf(view.container, "later")!).getByText("2h"),
    ).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(2 * HOUR + 100);
    });
    expect(listOf(view.container, "later")).toBe("Threads");
  });

  it("settles from the thread menu, which offers the snooze presets too, and brings a settled card back with Move to active", async () => {
    openAllShelves();
    const { view } = await render({
      threads: [thread("quiet"), thread("done")],
      parks: [settledAt("done", NOW)],
      rpc: { parks_keep: () => new Promise(() => {}) },
    });
    await waitFor(() => expect(listOf(view.container, "done")).toBe("Settled"));
    fireEvent.contextMenu(anchorOf(view.container, "quiet")!);
    const settle = await screen.findByRole("menuitem", { name: "Settle" });
    expect(screen.getByRole("menuitem", { name: /Snooze/ })).toBeTruthy();
    fireEvent.click(settle);
    await waitFor(() =>
      expect(inputOf(view, "parks_settle")).toEqual({
        threadId: "quiet",
        at: expect.any(Number),
      }),
    );
    fireEvent.click(
      within(rowOf(view.container, "done")!).getByRole("button", {
        name: "Move to active",
      }),
    );
    await waitFor(() => expect(listOf(view.container, "done")).toBe("Threads"));
    expect(inputOf(view, "parks_keep")).toEqual({
      threadId: "done",
      at: expect.any(Number),
    });
  });
});
