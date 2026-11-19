import { describe, expect, it } from "vitest";

import {
  captainIdOf,
  freshHome,
  homeFolder,
  homeOf,
  memoryTree,
  supervisorIdOf,
  type HomeFile,
  type MemoryNode,
} from "../lib/captain-home";

describe("a captain's home", () => {
  it("is its own folder when it has one, and a file-safe slug of its project's name otherwise", () => {
    expect(homeOf({ home: "video-editing" }, "Personal")).toBe("video-editing");
    expect(homeOf(null, "My App (v2)")).toBe("my-app-v2");
    expect(homeOf(null, "!!!")).toBe("project");
    expect(homeFolder("video-editing")).toBe("~/.bb/captains/video-editing");
  });

  it("is new for a new captain, named after it and numbered past every home taken", () => {
    expect(freshHome("Video editing", new Set(["personal"]))).toBe(
      "video-editing",
    );
    expect(
      freshHome("Forms", new Set(["forms", "forms-2", "forms-3"])),
    ).toBe("forms-4");
  });
});

describe("a backlog", () => {
  it("names its captain on its Captain line, never its Crew captain line", () => {
    expect(captainIdOf("Captain: thr_cap\nCrew captain: thr_crew\n")).toBe(
      "thr_cap",
    );
    expect(captainIdOf("# Backlog\nCrew captain: thr_crew\n")).toBeNull();
  });

  it.each([
    ["# Backlog: cops\n\nSupervisor: thr_ab12_C\n\n## Now\n", "thr_ab12_C"],
    ["# Backlog\n\nCrew captain: thr_crew1\n", "thr_crew1"],
    ["- Supervisor: thr_a1 (started)", "thr_a1"],
    ["**Supervisor:** `thr_b2`", "thr_b2"],
    ["Supervisor: (none yet; started on first task)", null],
    ["See Supervisor: thr_x in chat", null],
  ])(
    "names its supervisor on a plain, bulleted or bold Supervisor or Crew captain line at a line start: %j",
    (backlog, id) => {
      expect(supervisorIdOf(backlog)).toBe(id);
    },
  );
});

describe("a home's memory tree", () => {
  const file = (path: string): HomeFile => ({
    path,
    sizeBytes: 1,
    modifiedAt: null,
  });
  const shape = (nodes: readonly MemoryNode[]): unknown[] =>
    nodes.map((node) =>
      node.kind === "file" ? node.name : { [node.name]: shape(node.children) },
    );

  it("puts startup memory first, then other files, then one folder per task", () => {
    const tree = memoryTree(
      [
        "tasks/b-task/report.md",
        "notes.md",
        "tasks/a-task/steers.md",
        "backlog.md",
        "tasks/a-task/brief.md",
        "supervisor.md",
        "learnings.md",
        "captain.md",
        "archive.md",
      ].map(file),
    );
    expect(shape(tree)).toEqual([
      "captain.md",
      "learnings.md",
      "backlog.md",
      "supervisor.md",
      "archive.md",
      "notes.md",
      {
        tasks: [
          { "a-task": ["brief.md", "steers.md"] },
          { "b-task": ["report.md"] },
        ],
      },
    ]);
  });
});
