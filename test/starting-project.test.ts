import { describe, expect, it } from "vitest";

import { startingProject } from "@/components/captain-dialog";
import { project } from "./fixtures";

const projects = [
  project("proj_a", "Alpha"),
  project("proj_b", "Beta"),
  project("proj_c", "Gamma"),
];

describe("a new captain's starting project", () => {
  it("is the open project while it has no captain", () => {
    expect(startingProject(projects, "proj_b", new Set())).toBe("proj_b");
  });

  it("moves to the first project without a captain when the open one has one", () => {
    expect(startingProject(projects, "proj_a", new Set(["proj_a"]))).toBe(
      "proj_b",
    );
    expect(
      startingProject(projects, "proj_a", new Set(["proj_a", "proj_b"])),
    ).toBe("proj_c");
  });

  it("stays on the open project when every project already has a captain", () => {
    expect(
      startingProject(
        projects,
        "proj_b",
        new Set(["proj_a", "proj_b", "proj_c"]),
      ),
    ).toBe("proj_b");
  });
});
