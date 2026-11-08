import { describe, expect, it } from "vitest";

import {
  expireNeedsYou,
  homeFolder,
  memoryTree,
  supervisorIdOf,
  waitingOnUser,
  type HomeFile,
  type MemoryNode,
} from "../lib/captain-home";

describe("a captain's home", () => {
  it("is named by its project's slug", () => {
    expect(homeFolder("Personal")).toBe("~/.bb/captains/personal");
    expect(homeFolder("cops")).toBe("~/.bb/captains/cops");
    expect(homeFolder("My App (v2)")).toBe("~/.bb/captains/my-app-v2");
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

describe("a backlog's decisions waiting on the user", () => {
  const backlog = (waiting: string, heading = "Waiting on the user") =>
    [
      "# Backlog: cops",
      "",
      "Supervisor: thr_sup1",
      "",
      "## Now",
      "- fix-login: in flight",
      "",
      `## ${heading}`,
      waiting,
      "",
      "## In flight",
      "- ship-docs: thr_w1",
    ].join("\n");

  it("lists each top-level bullet's text, without the dash", () => {
    expect(
      waitingOnUser(
        backlog(
          [
            "- fix-login: keep the old route? — options: keep / drop — recommend drop — gates fix-login (since 2026-11-01)",
            "  - context: the mobile app still calls it",
            "* pricing: which tier is default?",
          ].join("\n"),
        ),
      ),
    ).toEqual([
      "fix-login: keep the old route? — options: keep / drop — recommend drop — gates fix-login (since 2026-11-01)",
      "pricing: which tier is default?",
    ]);
  });

  it("reads the older Waiting on captain heading", () => {
    expect(
      waitingOnUser(backlog("- deploy: today or Monday?", "Waiting on captain")),
    ).toEqual(["deploy: today or Monday?"]);
  });

  it("is empty for a placeholder, an empty section, or no section", () => {
    expect(waitingOnUser(backlog("- (none)"))).toEqual([]);
    expect(waitingOnUser(backlog("- (none yet)\n-"))).toEqual([]);
    expect(waitingOnUser(backlog(""))).toEqual([]);
    expect(waitingOnUser("# Backlog\n\n## Now\n- a: b\n")).toEqual([]);
    expect(waitingOnUser("")).toEqual([]);
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

describe("how long a decision shows", () => {
  const FOUR_HOURS = 4 * 60 * 60 * 1000;

  it("starts a new decision's clock the first time it is read", () => {
    expect(expireNeedsYou(["a"], {}, 1_000)).toEqual({
      fresh: ["a"],
      seen: { a: 1_000 },
    });
  });

  it("hides a decision after four hours, and keeps its clock", () => {
    const seen = { old: 0, young: 3 * 60 * 60 * 1000 };
    expect(expireNeedsYou(["old", "young"], seen, FOUR_HOURS)).toEqual({
      fresh: ["young"],
      seen,
    });
  });

  it("forgets a decision that left the backlog", () => {
    expect(expireNeedsYou(["b"], { a: 0, b: 5 }, 10).seen).toEqual({ b: 5 });
  });
});
