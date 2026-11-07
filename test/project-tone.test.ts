import { describe, expect, it } from "vitest";

import { projectMarks } from "@/lib/project-tone";
import { project } from "./fixtures";

describe("project marks", () => {
  it("gives each project its initial and a colour no other of the first eight shares", () => {
    const marks = projectMarks([
      project("p_cops", "cops"),
      project("p_content", "content"),
      project("p_personal", "Personal"),
    ]);
    expect(marks.get("p_cops")?.initial).toBe("C");
    expect(marks.get("p_personal")?.initial).toBe("P");
    const tones = ["p_cops", "p_content", "p_personal"].map(
      (id) => marks.get(id)?.tone,
    );
    expect(new Set(tones).size).toBe(3);
  });

  it("does not recolour existing projects when a project sorting after them is added", () => {
    const before = projectMarks([
      project("p_a", "alpha"),
      project("p_b", "beta"),
    ]);
    const after = projectMarks([
      project("p_a", "alpha"),
      project("p_b", "beta"),
      project("p_z", "zeta"),
    ]);
    expect(after.get("p_a")?.tone).toBe(before.get("p_a")?.tone);
    expect(after.get("p_b")?.tone).toBe(before.get("p_b")?.tone);
  });
});
