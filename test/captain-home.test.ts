import { describe, expect, it } from "vitest";

import {
  captainIdOf,
  captainSlug,
  freshHome,
  homeFolder,
  homeOf,
  memoryTree,
  supervisorIdOf,
  type HomeFile,
  type MemoryNode,
} from "../lib/captain-home";

describe("a captain's home", () => {
  it("is its own folder when it has one, and its project's otherwise", () => {
    expect(homeOf({ home: "video-editing" }, "Personal")).toBe(
      "video-editing",
    );
    expect(homeOf({}, "Personal")).toBe("personal");
    expect(homeOf(null, "My App (v2)")).toBe("my-app-v2");
    expect(homeFolder("video-editing")).toBe("~/.bb/captains/video-editing");
  });

  it("is new for a new captain, named after it and numbered past every home taken", () => {
    expect(freshHome("Video editing", new Set(["personal"]))).toBe(
      "video-editing",
    );
    expect(freshHome("Personal", new Set(["personal", "cops"]))).toBe(
      "personal-2",
    );
    expect(
      freshHome("Forms", new Set(["forms", "forms-2", "forms-3"])),
    ).toBe("forms-4");
  });

  it("comes from a file-safe slug of the name", () => {
    expect(captainSlug("My App (v2)")).toBe("my-app-v2");
    expect(captainSlug("  Ünïcode  ")).toBe("n-code");
    expect(captainSlug("!!!")).toBe("project");
  });
});

describe("a backlog's captain", () => {
  it("is the thread on its Captain line, never its Crew captain line", () => {
    expect(captainIdOf("Captain: thr_cap\nCrew captain: thr_crew\n")).toBe(
      "thr_cap",
    );
    expect(captainIdOf("# Backlog\nCrew captain: thr_crew\n")).toBeNull();
  });
});

describe("a backlog's supervisor", () => {
  it("is the thread on its Supervisor line", () => {
    expect(
      supervisorIdOf("# Backlog: cops\n\nSupervisor: thr_ab12_C\n\n## Now\n"),
    ).toBe("thr_ab12_C");
  });

  it("is the thread on a Crew captain line", () => {
    expect(supervisorIdOf("# Backlog\n\nCrew captain: thr_crew1\n")).toBe(
      "thr_crew1",
    );
  });

  it("is found on a bulleted or bold Supervisor line too", () => {
    expect(supervisorIdOf("- Supervisor: thr_a1 (started)")).toBe("thr_a1");
    expect(supervisorIdOf("**Supervisor:** `thr_b2`")).toBe("thr_b2");
    expect(supervisorIdOf("supervisor: thr_c3")).toBe("thr_c3");
  });

  it("is missing before one starts, or when the line is not at a line start", () => {
    expect(
      supervisorIdOf("Supervisor: (none yet; started on first task)"),
    ).toBeNull();
    expect(supervisorIdOf("See Supervisor: thr_x in chat")).toBeNull();
    expect(supervisorIdOf("")).toBeNull();
  });
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
        "archive.md",
        "notes.md",
        "tasks/a-task/steers.md",
        "backlog.md",
        "tasks/a-task/brief.md",
        "supervisor.md",
        "learnings.md",
        "captain.md",
        "extra.md",
      ].map(file),
    );
    expect(shape(tree)).toEqual([
      "captain.md",
      "learnings.md",
      "backlog.md",
      "supervisor.md",
      "archive.md",
      "extra.md",
      "notes.md",
      {
        tasks: [
          { "a-task": ["brief.md", "steers.md"] },
          { "b-task": ["report.md"] },
        ],
      },
    ]);
  });

  it("leaves out files a home does not have", () => {
    expect(shape(memoryTree([file("backlog.md")]))).toEqual(["backlog.md"]);
  });
});
