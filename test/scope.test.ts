import { describe, expect, it } from "vitest";

import { buildArmada } from "../lib/model";
import { countByProject, parseScope, resolveScope } from "../lib/scope";
import { project, thread } from "./fixtures";

const projects = [project("proj_a", "Alpha"), project("proj_b", "Beta")];

describe("thread scope", () => {
  it("counts each project's threads and leaves out projects with none", () => {
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
    expect(countByProject(threads)).toEqual(
      new Map([
        ["proj_a", 2],
        ["proj_b", 1],
      ]),
    );
  });

  it("drops chosen projects that are gone, falling back to all projects when none remain", () => {
    expect(resolveScope(["proj_gone", "proj_b"], projects)).toEqual([
      "proj_b",
    ]);
    expect(resolveScope(["proj_gone"], projects)).toEqual([]);
  });

  it("reads a list of projects from storage, and the single project or all projects stored before", () => {
    expect(parseScope('["proj_a","proj_b"]')).toEqual(["proj_a", "proj_b"]);
    expect(parseScope('"proj_a"')).toEqual(["proj_a"]);
    expect(parseScope("null")).toEqual([]);
    expect(parseScope("3")).toBeUndefined();
  });
});
