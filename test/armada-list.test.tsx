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
import type { CaptainRegistry } from "../lib/captains";
import { NOW, project, thread } from "./fixtures";

const stored = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => void stored.set(key, value),
});

beforeEach(() => stored.clear());
afterEach(cleanup);

const projects = [
  project("proj_a", "Alpha"),
  project("proj_b", "Beta"),
  project("proj_me", "Personal", true),
];

const registry = (...ids: string[]): CaptainRegistry => ({
  version: 1,
  captains: Object.fromEntries(
    ids.map((id) => [
      id,
      {
        threadId: id,
        logo: "rocket",
        color: "emerald",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]),
  ),
});

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
    registry?: CaptainRegistry;
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

const rowOf = (container: HTMLElement, id: string) =>
  container.querySelector<HTMLElement>(`[data-armada-row="${id}"]`);
const anchorOf = (container: HTMLElement, id: string) =>
  container.querySelector<HTMLAnchorElement>(
    `a[data-sidebar-thread-id="${id}"]`,
  );

describe("Armada thread list", () => {
  it("nests every worker under its captain and leaves the captain tree out of the project groups", async () => {
    const { view } = await render();
    await waitFor(() => expect(rowOf(view.container, "cap")).not.toBeNull());

    const workers = within(
      screen.getByRole("list", { name: "Workers of Captain Alpha" }),
    );
    for (const title of [
      "Build parser",
      "Write docs",
      "Approve deploy",
      "Nested helper",
    ]) {
      expect(workers.getByText(title)).toBeTruthy();
    }
    const groups = Array.from(view.container.querySelectorAll("section"));
    expect(groups).toHaveLength(1);
    expect(within(groups[0]!).getByText("Beta")).toBeTruthy();
    expect(within(groups[0]!).getByText("Loose idea")).toBeTruthy();
    expect(
      view.container.querySelectorAll('section [data-sidebar-thread-id="cap"]'),
    ).toHaveLength(0);
  });

  it("draws the captain as a rounded square in its chosen colour and summarises its workers", async () => {
    const { view } = await render();
    await waitFor(() => expect(rowOf(view.container, "cap")).not.toBeNull());
    const tile = rowOf(view.container, "cap")!.querySelector<HTMLElement>(
      '[aria-hidden="true"].rounded-lg',
    );
    expect(tile).not.toBeNull();
    expect(tile!.className).toContain("bg-emerald-600");
    expect(tile!.className).not.toContain("rounded-full");
    expect(
      within(rowOf(view.container, "cap")!).getByText(
        "2 working · 1 needs you",
      ),
    ).toBeTruthy();
  });

  it("shows the project when the captain is idle", async () => {
    const { view } = await render({
      threads: [thread("cap", { title: "Captain Alpha", projectId: "proj_a" })],
    });
    await waitFor(() => expect(rowOf(view.container, "cap")).not.toBeNull());
    expect(
      within(rowOf(view.container, "cap")!).getByText("Alpha"),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /workers/i })).toBeNull();
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

  it("collapses a project group and remembers it", async () => {
    const { view } = await render();
    const header = await screen.findByRole("button", { name: /Beta/ });
    fireEvent.click(header);
    expect(anchorOf(view.container, "plain")).toBeNull();
    expect(JSON.parse(stored.get("armada/collapsed-groups")!)).toEqual({
      proj_b: true,
    });
  });

  it("invites the first captain when there are none", async () => {
    await render({
      registry: registry(),
      threads: [thread("plain", { title: "Loose idea" })],
    });
    expect(await screen.findByText("No captains yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "New captain" })).toBeTruthy();
  });

  it("shows a captain as soon as the server announces it", async () => {
    const { view } = await render({ registry: registry() });
    await waitFor(() =>
      expect(view.inspection.rpcCalls.length).toBeGreaterThan(0),
    );
    expect(rowOf(view.container, "cap")?.dataset.kind).toBe("thread");
    await view.emitRealtime("captains", registry("cap"));
    await waitFor(() =>
      expect(rowOf(view.container, "cap")?.dataset.kind).toBe("captain"),
    );
  });

  it("reloads the registry when the realtime connection comes back", async () => {
    let answer = registry();
    const { view } = await render({ rpc: { captains_list: () => answer } });
    await waitFor(() => expect(view.inspection.rpcCalls).toHaveLength(1));
    answer = registry("cap");
    await view.setRealtimeConnectionState("reconnecting");
    await view.setRealtimeConnectionState("connected");
    await waitFor(() =>
      expect(rowOf(view.container, "cap")?.dataset.kind).toBe("captain"),
    );
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
      dialog.getByRole("radio", { name: "Beta" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(dialog.getByText("🧭 Captain · Beta")).toBeTruthy();
    fireEvent.click(dialog.getByRole("radio", { name: "Alpha" }));
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
      .getAllByRole("radio")
      .filter((radio) =>
        ["Alpha", "Beta", "Personal"].includes(radio.textContent ?? ""),
      )
      .map((radio) => radio.textContent);
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
    expect(dialog.queryByRole("radiogroup", { name: "Project" })).toBeNull();
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
