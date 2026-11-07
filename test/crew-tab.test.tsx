// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";

import { CrewTab } from "../components/crew-tab";
import type { CaptainHome } from "../lib/captain-home";
import { project, thread } from "./fixtures";

afterEach(cleanup);

const ready = (...paths: string[]): CaptainHome => ({
  status: "ready",
  folder: "~/.bb/captains/cops",
  files: paths.map((path) => ({
    path,
    sizeBytes: 100,
    modifiedAt: Date.now() - 3_600_000,
  })),
});

function renderCrew(home: () => unknown) {
  const reads: unknown[] = [];
  const view = renderSlot(
    { component: CrewTab },
    { threadId: "cap", environment: null, params: null },
    {
      sidebarThreads: {
        status: "ready",
        threads: [thread("cap", { title: "cops" })],
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
        captain_home_file: ({ path }: { path: string }) => ({
          content: `# Contents of ${path}`,
          truncated: false,
        }),
      } as never,
      settings: { inactiveAfterHours: 0 },
    },
  );
  return { view, reads };
}

/** Each row of the Memory section, with its "1h" age dropped. */
const memoryRows = () =>
  within(screen.getByRole("heading", { name: "Memory" }).closest("section")!)
    .getAllByRole("button")
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

  it("opens a file in place and closes it again", async () => {
    renderCrew(() => ready("backlog.md"));
    const row = await screen.findByRole("button", { name: /backlog\.md/ });
    fireEvent.click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    await screen.findByText("# Contents of backlog.md", { exact: false });
    fireEvent.click(row);
    await waitFor(() =>
      expect(screen.queryByText(/Contents of backlog\.md/)).toBeNull(),
    );
  });

  it("says when the captain has no memory folder yet", async () => {
    renderCrew(() => ({
      status: "missing",
      folder: "~/.bb/captains/cops",
    }));
    await screen.findByText("No memory folder yet at ~/.bb/captains/cops.");
  });
});
