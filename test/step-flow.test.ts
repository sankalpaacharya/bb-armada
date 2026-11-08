import { describe, expect, it } from "vitest";

import {
  commandFolder,
  flowOf,
  groupTitle,
  stepPlace,
  tildePath,
} from "@/lib/step-flow";
import type { Step } from "@/lib/steps";

const step = (id: string, over: Partial<Step> = {}): Step => ({
  id,
  kind: "read",
  verb: "Read",
  target: `${id}.ts`,
  detail: null,
  path: null,
  startedAt: 0,
  endedAt: 100,
  status: "done",
  children: [],
  ...over,
});

const thought = (id: string, ms: number): Step =>
  step(id, { kind: "think", verb: "Thought", target: "", endedAt: ms });

const shape = (items: ReturnType<typeof flowOf>) =>
  items.map((item) =>
    item.type === "group"
      ? `group:${item.steps.map((s) => s.id).join(",")}`
      : `${item.type}:${item.step.id}`,
  );

describe("the step flow", () => {
  it("folds three or more of the same action in a row into one card", () => {
    const items = flowOf(
      [step("a"), step("b"), step("c"), step("r", { kind: "run", verb: "Ran" })],
      0,
    );
    expect(shape(items)).toEqual(["group:a,b,c", "step:r"]);
    const [group] = items;
    expect(group?.type === "group" ? groupTitle(group.steps) : null).toBe(
      "Read 3 files",
    );
  });

  it("keeps two in a row as their own cards", () => {
    expect(shape(flowOf([step("a"), step("b")], 0))).toEqual(["step:a", "step:b"]);
  });

  it("drops short thoughts, so they do not split a run, and notes long ones between cards", () => {
    const items = flowOf(
      [step("a"), thought("t1", 500), step("b"), step("c"), thought("t2", 22_000), step("d")],
      0,
    );
    expect(shape(items)).toEqual(["group:a,b,c", "thought:t2", "step:d"]);
  });

  it("never folds the running step away", () => {
    const items = flowOf(
      [step("a"), step("b"), step("c"), step("d", { status: "running", endedAt: null })],
      0,
    );
    expect(shape(items)).toEqual(["group:a,b,c", "step:d"]);
  });

  it("says where a step happened", () => {
    expect(tildePath("/Users/sam/work/app")).toBe("~/work/app");
    expect(commandFolder("cd ~/work/app && npm test")).toBe("~/work/app");
    expect(commandFolder("npm test")).toBeNull();
    expect(stepPlace(step("a", { path: "/Users/sam/work/app/lib/a.ts" }))).toBe(
      "Read in ~/work/app/lib",
    );
    expect(
      stepPlace(step("r", { kind: "run", verb: "Ran", detail: "cd /home/sam/app && make" })),
    ).toBe("Ran in ~/app");
    expect(
      stepPlace(step("s", { kind: "agent", verb: "Subagent", children: [step("x"), step("y")] })),
    ).toBe("Subagent, 2 steps");
  });
});
