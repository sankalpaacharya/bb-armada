import { describe, expect, it } from "vitest";

import { buildArmada } from "../lib/model";
import {
  countByProject,
  layoutThreads,
  parseScope,
  resolveScope,
  scopeThreads,
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
  [],
  [],
  0,
  null,
);
const ids = (entries: ReturnType<typeof scopeThreads>) =>
  entries.map((entry) => entry.thread.id).sort();

describe("thread scope", () => {
  it("keeps every thread for all projects and one project's threads otherwise", () => {
    expect(ids(scopeThreads(threads, null))).toEqual(["a1", "a2", "b1"]);
    expect(ids(scopeThreads(threads, "proj_a"))).toEqual(["a1", "a2"]);
    expect(ids(scopeThreads(threads, "proj_gone"))).toEqual([]);
  });

  it("counts each project's threads and leaves out projects with none", () => {
    const counts = countByProject(threads);
    expect(counts.get("proj_a")).toBe(2);
    expect(counts.get("proj_b")).toBe(1);
    expect(counts.has("proj_gone")).toBe(false);
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

describe("thread layout", () => {
  const HOUR = 3_600_000;
  const build = (list: Parameters<typeof buildArmada>[0]) =>
    buildArmada(list, projects, [], [], 0, null).threads;
  const entries = build([
    thread("a_old", { projectId: "proj_a", createdAt: 1 * HOUR }),
    thread("b_new", { projectId: "proj_b", createdAt: 5 * HOUR }),
    thread("a_mid", { projectId: "proj_a", createdAt: 3 * HOUR }),
    thread("a_pin", {
      projectId: "proj_a",
      createdAt: 0,
      isPinned: true,
      pinSortKey: "a",
    }),
  ]);
  const grouped = (layout: ReturnType<typeof layoutThreads>) => {
    if (layout.kind !== "grouped") throw new Error("expected groups");
    return layout.groups;
  };

  it("puts each project under one header, newest project first, and keeps the list's order inside", () => {
    const groups = grouped(layoutThreads(entries, null, {}));
    expect(groups.map((group) => group.name)).toEqual(["Beta", "Alpha"]);
    expect(
      groups.map((group) => group.entries.map((entry) => entry.thread.id)),
    ).toEqual([["b_new"], ["a_pin", "a_mid", "a_old"]]);
  });

  it("marks the groups that were collapsed", () => {
    const groups = grouped(layoutThreads(entries, null, { proj_a: true }));
    expect(groups.map((group) => [group.projectId, group.collapsed])).toEqual([
      ["proj_b", false],
      ["proj_a", true],
    ]);
  });

  it("carries the most urgent live status of the group's threads", () => {
    const groups = grouped(
      layoutThreads(
        build([
          thread("busy", { projectId: "proj_a", status: "active" }),
          thread("asks", { projectId: "proj_a", hasPendingInteraction: true }),
          thread("done", { projectId: "proj_b", indicator: "unread-success" }),
        ]),
        null,
        {},
      ),
    );
    const statusOf = (id: string) =>
      groups.find((group) => group.projectId === id)?.status;
    expect(statusOf("proj_a")).toBe("needs-you");
    expect(statusOf("proj_b")).toBeNull();
  });

  it("lists one project's threads without headers", () => {
    const scoped = scopeThreads(entries, "proj_a");
    expect(layoutThreads(scoped, "proj_a", { proj_a: true })).toEqual({
      kind: "flat",
      entries: scoped,
    });
  });
});
