import { describe, expect, it } from "vitest";

import { buildArmada } from "../lib/model";
import {
  countByProject,
  parseScope,
  resolveScope,
  scopeThreads,
  toggleScope,
} from "../lib/scope";
import { project, thread } from "./fixtures";

const projects = [project("proj_a", "Alpha"), project("proj_b", "Beta")];
const { threads } = buildArmada(
  [
    thread("a1", { projectId: "proj_a" }),
    thread("b1", { projectId: "proj_b" }),
    thread("a2", { projectId: "proj_a" }),
  ],
  projects,
  {},
  [],
  [],
  new Set(),
  0,
  null,
);
const ids = (entries: ReturnType<typeof scopeThreads>) =>
  entries.map((entry) => entry.thread.id).sort();

describe("thread scope", () => {
  it("keeps every thread when no project is chosen, and the chosen projects' threads otherwise", () => {
    expect(ids(scopeThreads(threads, []))).toEqual(["a1", "a2", "b1"]);
    expect(ids(scopeThreads(threads, ["proj_a"]))).toEqual(["a1", "a2"]);
    expect(ids(scopeThreads(threads, ["proj_a", "proj_b"]))).toEqual([
      "a1",
      "a2",
      "b1",
    ]);
    expect(ids(scopeThreads(threads, ["proj_gone"]))).toEqual([]);
  });

  it("adds a project to the scope, and takes it out again", () => {
    expect(toggleScope([], "proj_a")).toEqual(["proj_a"]);
    expect(toggleScope(["proj_a"], "proj_b")).toEqual(["proj_a", "proj_b"]);
    expect(toggleScope(["proj_a", "proj_b"], "proj_a")).toEqual(["proj_b"]);
  });

  it("counts each project's threads and leaves out projects with none", () => {
    const counts = countByProject(threads);
    expect(counts.get("proj_a")).toBe(2);
    expect(counts.get("proj_b")).toBe(1);
    expect(counts.has("proj_gone")).toBe(false);
  });

  it("drops chosen projects that are gone, falling back to all projects when none remain", () => {
    expect(resolveScope(["proj_b"], projects)).toEqual(["proj_b"]);
    expect(resolveScope(["proj_gone", "proj_b"], projects)).toEqual([
      "proj_b",
    ]);
    expect(resolveScope(["proj_gone"], projects)).toEqual([]);
    expect(resolveScope([], projects)).toEqual([]);
  });

  it("reads a list of projects from storage, and the single project or all projects stored before", () => {
    expect(parseScope('["proj_a","proj_b"]')).toEqual(["proj_a", "proj_b"]);
    expect(parseScope('"proj_a"')).toEqual(["proj_a"]);
    expect(parseScope("null")).toEqual([]);
    expect(parseScope("3")).toBeUndefined();
    expect(parseScope('["proj_a",3]')).toBeUndefined();
  });
});
