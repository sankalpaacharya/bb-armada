import { describe, expect, it } from "vitest";

import { startingProject } from "@/components/captain-dialog";
import { project } from "./fixtures";

const projects = [
  project("proj_a", "Alpha"),
  project("proj_b", "Beta"),
  project("proj_c", "Gamma"),
];

describe("a new captain's starting project", () => {
  it("is the open project, even when it already has a captain", () => {
    expect(startingProject(projects, "proj_b")).toBe("proj_b");
  });

  it("is the first project when none is open", () => {
    expect(startingProject(projects, null)).toBe("proj_a");
    expect(startingProject(projects, "gone")).toBe("proj_a");
  });
});
