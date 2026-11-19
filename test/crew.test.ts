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

const armada = (
  all: typeof threads,
  projects: ReturnType<typeof project>[],
  captains: string[],
  parks: ReturnType<typeof settledAt>[] = [],
  supervisors: string[] = [],
) =>
  buildArmada(all, projects, {}, captains.map(record), parks, new Set(supervisors), NOW, 6 * 3_600_000);

const model = armada(
  threads,
  [project("proj_a", "Alpha"), project("proj_b", "Beta"), project("proj_c", "Gamma")],
  ["cap", "other"],
  [settledAt("done", NOW - 1000)],
  ["sup"],
);

describe("a thread's captain", () => {
  it.each<[string, string | null, string]>([
    ["cap", "cap", "the captain itself"],
    ["busy", "cap", "its worker"],
    ["sub", "cap", "a worker's child"],
    ["theirs", "other", "another captain's worker"],
    ["sup", "cap", "its supervisor"],
    ["run", "cap", "a thread its supervisor runs"],
    ["solo", "cap", "a thread no captain launched, by its project"],
    ["loose", null, "a thread in a project with no captain"],
    ["nope", null, "a thread that is gone"],
  ])("of %s is %s, for %s", (id, captain) => {
    expect(captainIdOf(model, threads, id)).toBe(captain);
  });

  it("is missing for a thread no captain launched when its project has several, so the Crew tab asks which", () => {
    const shared = [...threads, thread("cap2", { title: "Video editing", createdAt: NOW })];
    const several = armada(shared, [project("proj_a", "Alpha")], ["cap", "cap2"]);
    expect(captainIdOf(several, shared, "solo")).toBeNull();
    expect(captainIdOf(several, shared, "busy")).toBe("cap");
    expect(captainIdOf(several, shared, "cap2")).toBe("cap2");
  });
});

describe("a captain's crew", () => {
  it("splits its own workers, its supervisor's included, into active, inactive and settled, leaving out other captains' threads", () => {
    const crew = crewOf(model, "cap")!;
    expect(crew.captain.thread.id).toBe("cap");
    expect(crew.active.map((entry) => entry.thread.id)).toEqual(["run", "busy"]);
    expect(crew.inactive.map((entry) => entry.thread.id)).toEqual(["old"]);
    expect(crew.parked.map((entry) => entry.thread.id)).toEqual(["done"]);
  });
});
