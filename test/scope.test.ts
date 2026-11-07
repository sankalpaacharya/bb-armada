import { describe, expect, it } from "vitest";

import { buildArmada } from "../lib/model";
import { parseScope, resolveScope, scopeThreads } from "../lib/scope";
import { project, thread } from "./fixtures";

const projects = [project("proj_a", "Alpha"), project("proj_b", "Beta")];
const { threads } = buildArmada(
  [
    thread("a1", { projectId: "proj_a" }),
    thread("b1", { projectId: "proj_b" }),
    thread("a2", { projectId: "proj_a" }),
  ],
  projects,
  { version: 1, captains: {} },
);
const ids = (entries: ReturnType<typeof scopeThreads>) =>
  entries.map((entry) => entry.thread.id).sort();

describe("thread scope", () => {
  it("keeps every thread for all projects and one project's threads otherwise", () => {
    expect(ids(scopeThreads(threads, null))).toEqual(["a1", "a2", "b1"]);
    expect(ids(scopeThreads(threads, "proj_a"))).toEqual(["a1", "a2"]);
    expect(ids(scopeThreads(threads, "proj_gone"))).toEqual([]);
  });

  it("falls back to all projects when the stored project is gone", () => {
    expect(resolveScope("proj_b", projects)).toBe("proj_b");
    expect(resolveScope("proj_gone", projects)).toBeNull();
    expect(resolveScope(null, projects)).toBeNull();
  });

  it("reads only a project id or all projects from storage", () => {
    expect(parseScope('"proj_a"')).toBe("proj_a");
    expect(parseScope("null")).toBeNull();
    expect(parseScope("3")).toBeUndefined();
  });
});
