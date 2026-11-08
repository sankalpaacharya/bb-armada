// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";

import { StepsTab } from "../components/steps-tab";
import { buildThreadSteps, type ThreadSteps } from "../lib/steps";
import { thread } from "./fixtures";
import { at, command, prompt, reply, thought, work } from "./timeline-rows";

afterEach(cleanup);

const rows = [
  prompt("t1", 0, "first, look around"),
  command("t1", 1, 3, "ls"),
  reply("t1", 4),
  prompt("t2", 100, "make the tab"),
  work("t2", 101, 102, "file-read", { path: "/repo/lib/forest.ts" }),
  command("t2", 103, 143, "cd /repo && npm run check"),
  thought("t2", 145, 153, "Checking what the failing test expects."),
  work("t2", 154, 155, "file-change", {
    change: { path: "/repo/lib/forest.ts", kind: "update" },
  }),
  reply("t2", 160),
];

const ready = (): ThreadSteps =>
  buildThreadSteps(rows, {
    threadId: "thr",
    running: false,
    now: at(1000),
    hasOlder: false,
  });

function renderSteps(steps: () => unknown) {
  const reads: unknown[] = [];
  const view = renderSlot(
    { component: StepsTab },
    { threadId: "thr", environment: null, params: null },
    {
      sidebarThreads: {
        status: "ready",
        threads: [thread("thr", { host: { id: "host_mac", name: "MacBook" } })],
        projects: [],
        sections: [],
      },
      rpc: {
        thread_steps: (input: unknown) => {
          reads.push(input);
          return steps();
        },
      } as never,
    },
  );
  return { view, reads };
}

/** The newest turn's rows, as "verb target" in the order shown. */
const shownSteps = () =>
  Array.from(document.querySelectorAll("[data-step] > button")).map((button) =>
    Array.from(button.children)
      .slice(1, 3)
      .map((part) => part.textContent)
      .join(" "),
  );

describe("the steps tab", () => {
  it("opens the newest turn on its ribbon and a legend of where its time went, biggest first", async () => {
    const { reads } = renderSteps(ready);
    expect(await screen.findByRole("slider")).toBeTruthy();
    const legend = screen.getByRole("group", { name: "Show one kind" });
    expect(
      within(legend)
        .getAllByRole("button")
        .map((chip) => chip.textContent),
    ).toEqual(["Running40s", "Thinking18s", "Reading1s", "Editing1s"]);
    expect(reads).toContainEqual({ threadId: "thr", turns: 10 });
    expect(shownSteps()).toEqual([
      "Read forest.ts",
      "Ran npm run check",
      "Thought Checking what the failing test expects.",
      "Edited forest.ts",
    ]);
    expect(
      screen.getByRole("button", { name: /first, look around/ }).getAttribute(
        "aria-expanded",
      ),
    ).toBe("false");
  });

  it("shows only one kind while its chip is pressed", async () => {
    renderSteps(ready);
    const reading = await screen.findByRole("button", { name: /^Reading/ });
    fireEvent.click(reading);
    expect(reading.getAttribute("aria-pressed")).toBe("true");
    expect(shownSteps()).toEqual(["Read forest.ts"]);
    fireEvent.click(reading);
    expect(shownSteps()).toHaveLength(4);
  });

  it("puts the slowest step first when asked", async () => {
    renderSteps(ready);
    fireEvent.click(await screen.findByRole("button", { name: "Slowest" }));
    expect(shownSteps()[0]).toBe("Ran npm run check");
    expect(shownSteps()[1]).toBe(
      "Thought Checking what the failing test expects.",
    );
  });

  it("opens a step to its full command, and a read file in bb's preview", async () => {
    const { view } = renderSteps(ready);
    fireEvent.click((await screen.findByText("npm run check")).closest("button")!);
    expect(await screen.findByText("cd /repo && npm run check")).toBeTruthy();
    fireEvent.click(screen.getByText("Read").closest("button")!);
    fireEvent.click(await screen.findByRole("button", { name: "Open file" }));
    expect(view.inspection.navigateCalls).toContainEqual({
      method: "experimental_openFilePreview",
      options: {
        target: { kind: "host", hostId: "host_mac", path: "/repo/lib/forest.ts" },
        location: null,
      },
    });
  });

  it("walks the ribbon step by step from the keyboard, and Enter opens the step under it", async () => {
    renderSteps(ready);
    const ribbon = await screen.findByRole("slider");
    fireEvent.keyDown(ribbon, { key: "ArrowRight" });
    fireEvent.keyDown(ribbon, { key: "ArrowRight" });
    expect(ribbon.getAttribute("aria-valuetext")).toBe("0:01 · Reading forest.ts");
    fireEvent.keyDown(ribbon, { key: "ArrowRight" });
    fireEvent.keyDown(ribbon, { key: "ArrowRight" });
    expect(ribbon.getAttribute("aria-valuetext")).toBe(
      "0:03 · Running npm run check",
    );
    fireEvent.keyDown(ribbon, { key: "Enter" });
    expect(await screen.findByText("cd /repo && npm run check")).toBeTruthy();
  });

  it("asks for ten more turns when older ones are shown", async () => {
    const { reads } = renderSteps(() => ({ ...ready(), hasOlder: true }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Show older turns" }),
    );
    await screen.findByRole("slider");
    expect(reads).toContainEqual({ threadId: "thr", turns: 20 });
  });

  it("says when there are no steps yet", async () => {
    renderSteps(() => ({ ...ready(), turns: [] }));
    expect(
      await screen.findByText("No steps yet. They show here as the agent works."),
    ).toBeTruthy();
  });

  it("says what failed, and reads again on Retry", async () => {
    let fail = true;
    const { reads } = renderSteps(() => {
      if (fail) throw new Error("thread not found");
      return ready();
    });
    expect(await screen.findByText(/thread not found/)).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("slider")).toBeTruthy();
    expect(reads.length).toBeGreaterThan(1);
  });
});
