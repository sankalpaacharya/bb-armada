import { describe, expect, it } from "vitest";

import { isRunning, workerTime } from "../lib/run-start";
import type { Status } from "../lib/status";
import { NOW, thread } from "./fixtures";

const MINUTE = 60_000;

const entry = (status: Status | null, overrides = {}) => ({
  status,
  thread: thread("w", overrides),
});

describe("isRunning", () => {
  const background = {
    activity: {
      workflows: 0,
      backgroundAgents: 0,
      backgroundCommands: 1,
      planMode: 0,
      goals: 0,
    },
  };

  it.each([
    [true, "its own runtime is busy", entry("working", { status: "active" })],
    [true, "it is provisioning", entry("working", { runtimeStatus: "provisioning" })],
    [false, "only work it left behind runs", entry("working", background)],
    [false, "it waits on you", entry("needs-you", { status: "active" })],
    [false, "it has no status", entry(null)],
  ])("is %s when %s", (running, _, worker) => {
    expect(isRunning(worker)).toBe(running);
  });
});

describe("workerTime", () => {
  const worker = (
    createdAgo: number,
    activeAgo: number,
    status: Status | null = null,
  ) => ({
    status,
    lastActivityAt: NOW - activeAgo,
    thread: { createdAt: NOW - createdAgo, updatedAt: NOW - activeAgo },
  });
  const CLOCK = "\\d{1,2}:\\d{2}";

  it("shows how long a run has gone, with its start and creation in the tooltip", () => {
    const time = workerTime(
      worker(3 * 60 * MINUTE, MINUTE, "working"),
      { at: NOW - 12 * MINUTE, source: "turn" },
      NOW,
    );
    expect(time.text).toBe("12m");
    expect(time.title).toMatch(
      new RegExp(
        `^Running for 12m · started ${CLOCK}.* · created ${CLOCK}.* \\(3h ago\\)$`,
      ),
    );
  });

  it("counts background work from the worker's last change", () => {
    const time = workerTime(
      worker(40 * MINUTE, 7 * MINUTE, "working"),
      null,
      NOW,
    );
    expect(time.text).toBe("7m");
    expect(time.title).toMatch(
      /^Working in the background for 7m · since .+, by its last status change · created .+ \(40m ago\)$/,
    );
  });

  it.each([
    [38 * MINUTE, 4 * MINUTE, "38m ago", "4m"],
    [20_000, 20_000, "just now", "<1m"],
  ])("shows an idle worker's age, with its idle time in the tooltip", (createdAgo, activeAgo, text, idle) => {
    const time = workerTime(worker(createdAgo, activeAgo, "done"), null, NOW);
    expect(time.text).toBe(text);
    expect(time.title).toMatch(
      new RegExp(`^Created ${CLOCK}.* \\(${text}\\) · idle for ${idle} · last active ${CLOCK}`),
    );
  });
});
