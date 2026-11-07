import { describe, expect, it } from "vitest";

import { captainIdOf, crewOf } from "../lib/crew";
import { buildArmada } from "../lib/model";
import { NOW, project, settledAt, thread } from "./fixtures";

const record = (id: string) => ({
  threadId: id,
  avatar: { style: "micah" as const, seed: id },
  createdAt: "2026-01-01T00:00:00.000Z",
});

const threads = [
  thread("cap", { title: "cops" }),
  thread("busy", { parentThreadId: "cap", status: "active" }),
  thread("done", { parentThreadId: "cap" }),
  thread("old", { parentThreadId: "cap", updatedAt: NOW - 30 * 3_600_000, createdAt: NOW - 30 * 3_600_000 }),
  thread("sub", { parentThreadId: "busy" }),
  thread("sup", { parentThreadId: "cap" }),
  thread("run", { parentThreadId: "sup", status: "active", createdAt: NOW }),
  thread("solo"),
  thread("other", { title: "personal", projectId: "proj_b" }),
  thread("theirs", { parentThreadId: "other", projectId: "proj_b" }),
  thread("loose", { projectId: "proj_c" }),
];

const model = buildArmada(
  threads,
  [project("proj_a", "Alpha"), project("proj_b", "Beta"), project("proj_c", "Gamma")],
  {},
  [record("cap"), record("other")],
  [settledAt("done", NOW - 1000)],
  new Set(["sup"]),
  NOW,
  6 * 3_600_000,
);

describe("a thread's captain", () => {
  it("is the thread itself, its parent, or a captain further up", () => {
    expect(captainIdOf(model, threads, "cap")).toBe("cap");
    expect(captainIdOf(model, threads, "busy")).toBe("cap");
    expect(captainIdOf(model, threads, "sub")).toBe("cap");
    expect(captainIdOf(model, threads, "theirs")).toBe("other");
  });

  it("is the supervisor's captain, for the supervisor and the threads it runs", () => {
    expect(captainIdOf(model, threads, "sup")).toBe("cap");
    expect(captainIdOf(model, threads, "run")).toBe("cap");
  });

  it("falls back to the captain of the thread's project when no captain launched it", () => {
    expect(captainIdOf(model, threads, "solo")).toBe("cap");
  });

  it("is missing for a thread in a project with no captain, or one that is gone", () => {
    expect(captainIdOf(model, threads, "loose")).toBeNull();
    expect(captainIdOf(model, threads, "nope")).toBeNull();
  });
});

describe("a captain's crew", () => {
  it("splits its own workers, its supervisor's included, into active, inactive and settled, leaving out other captains' threads", () => {
    const crew = crewOf(model, "cap")!;
    expect(crew.captain.thread.id).toBe("cap");
    expect(crew.active.map((entry) => entry.thread.id)).toEqual([
      "run",
      "busy",
    ]);
    expect(crew.inactive.map((entry) => entry.thread.id)).toEqual(["old"]);
    expect(crew.parked.map((entry) => entry.thread.id)).toEqual(["done"]);
  });

  it("is null for a thread that is not a captain", () => {
    expect(crewOf(model, "solo")).toBeNull();
  });
});
