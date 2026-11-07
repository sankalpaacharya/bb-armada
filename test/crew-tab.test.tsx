// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";

import { CrewTab } from "../components/crew-tab";
import type { CaptainHome } from "../lib/captain-home";
import { project, thread } from "./fixtures";

afterEach(cleanup);

type ReadyHome = Extract<CaptainHome, { status: "ready" }>;

const ready = (...paths: string[]): ReadyHome => ({
  status: "ready",
  folder: "~/.bb/captains/cops",
  root: "/home/me/.bb/captains/cops",
  files: paths.map((path) => ({
    path,
    sizeBytes: 100,
    modifiedAt: Date.now() - 3_600_000,
  })),
  needsYou: [],
});

function renderCrew(
  home: () => unknown,
  options: {
    workers?: PluginSidebarThread[];
    sdk?: Record<string, unknown>;
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
      } as never,
      sdk: options.sdk as never,
      settings: { inactiveAfterHours: 0 },
    },
  );
  return { view, reads };
}

const openMemory = async () =>
  fireEvent.click(await screen.findByRole("button", { name: "Memory" }));

/** Each row of the Memory section, with its "1h" age dropped. */
const memoryRows = () =>
  within(screen.getByRole("heading", { name: "Memory" }).closest("section")!)
    .queryAllByRole("button")
    .filter((button) => button.textContent !== "Memory")
    .map((button) => button.textContent?.replace(/1h$/, ""));

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
    expect(reads).toEqual([{ project: "cops" }]);
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

const waiting = (...needsYou: string[]): CaptainHome => ({
  ...ready("backlog.md"),
  needsYou,
});

const needsYouSection = () =>
  screen.queryByRole("heading", { name: /^Needs you/ })?.closest("section") ??
  null;

describe("the crew tab's decisions", () => {
  it("lists what the captain is waiting on the user for, above its threads", async () => {
    renderCrew(() =>
      waiting(
        "deploy: today or Monday? — options: today / Monday — recommend Monday",
        "pricing: which tier is default?",
      ),
    );
    const heading = await screen.findByRole("heading", { name: /^Needs you/ });
    expect(heading.textContent).toBe("Needs you2");
    const section = needsYouSection()!;
    expect(
      within(section)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "deploy: today or Monday? — options: today / Monday — recommend Monday",
      "pricing: which tier is default?",
    ]);
    expect(
      section.compareDocumentPosition(screen.getByText(/^No workers yet/)) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("opens the captain's thread to answer, from the heading or a decision", async () => {
    const { view } = renderCrew(() => waiting("deploy: today or Monday?"));
    fireEvent.click(
      await screen.findByRole("button", { name: "deploy: today or Monday?" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Needs you/ }));
    expect(view.inspection.navigateCalls).toEqual([
      { method: "toThread", threadId: "cap", options: undefined },
      { method: "toThread", threadId: "cap", options: undefined },
    ]);
  });

  it("shows nothing when no decision is waiting", async () => {
    renderCrew(() => waiting());
    await openMemory();
    await screen.findByText("~/.bb/captains/cops");
    expect(needsYouSection()).toBeNull();
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
