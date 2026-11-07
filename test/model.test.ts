import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { describe, expect, it } from "vitest";

import type { CaptainRegistry } from "../lib/captains";
import { buildArmada } from "../lib/model";
import { NOW, project, thread } from "./fixtures";

const projects = [project("proj_a", "Alpha"), project("proj_b", "Beta")];

function registryOf(
  ...ids: [id: string, createdAt?: string][]
): CaptainRegistry {
  return {
    version: 1,
    captains: Object.fromEntries(
      ids.map(([id, createdAt = "2026-01-01T00:00:00.000Z"]) => [
        id,
        { threadId: id, logo: "compass", color: "indigo", createdAt },
      ]),
    ),
  };
}

const none = registryOf();
const idsOf = (list: readonly PluginSidebarThread[]) =>
  list.map((item) => item.id);
const threadIds = (model: ReturnType<typeof buildArmada>) =>
  model.threads.map((entry) => entry.thread.id);
const busy: Partial<PluginSidebarThread> = { status: "active" };
const blocked: Partial<PluginSidebarThread> = { hasPendingInteraction: true };

describe("captains and their workers", () => {
  it("nests every descendant under the captain, newest activity first", () => {
    const threads = [
      thread("cap"),
      thread("w1", { parentThreadId: "cap", updatedAt: NOW - 3000 }),
      thread("w2", { parentThreadId: "cap", updatedAt: NOW - 1000 }),
      thread("grandchild", { parentThreadId: "w1", updatedAt: NOW - 2000 }),
    ];
    const [captain] = buildArmada(
      threads,
      projects,
      registryOf(["cap"]),
    ).captains;
    expect(idsOf(captain!.workers)).toEqual(["w2", "grandchild", "w1"]);
  });

  it("follows the lifecycle owner when a worker has no parent", () => {
    const threads = [
      thread("cap"),
      thread("w", { lifecycleOwnerThreadId: "cap" }),
    ];
    const [captain] = buildArmada(
      threads,
      projects,
      registryOf(["cap"]),
    ).captains;
    expect(idsOf(captain!.workers)).toEqual(["w"]);
  });

  it("keeps captains and their workers out of the thread list", () => {
    const threads = [
      thread("cap"),
      thread("w", { parentThreadId: "cap" }),
      thread("deep", { parentThreadId: "w" }),
      thread("plain"),
    ];
    const model = buildArmada(threads, projects, registryOf(["cap"]));
    expect(threadIds(model)).toEqual(["plain"]);
  });

  it("lifts the captain's status to its most urgent worker", () => {
    const threads = [
      thread("cap"),
      thread("w1", { parentThreadId: "cap", ...busy }),
      thread("w2", { parentThreadId: "cap", ...busy }),
      thread("w3", { parentThreadId: "cap", ...blocked }),
      thread("w4", { parentThreadId: "cap" }),
    ];
    const [captain] = buildArmada(
      threads,
      projects,
      registryOf(["cap"]),
    ).captains;
    expect(captain!.status).toBe("needs-you");
  });

  it("counts the captain's own state in its status", () => {
    const threads = [
      thread("cap", busy),
      thread("w", { parentThreadId: "cap" }),
    ];
    const [captain] = buildArmada(
      threads,
      projects,
      registryOf(["cap"]),
    ).captains;
    expect(captain!.status).toBe("working");
  });

  it("has no status while everything is idle", () => {
    const threads = [thread("cap"), thread("w", { parentThreadId: "cap" })];
    expect(
      buildArmada(threads, projects, registryOf(["cap"])).captains[0]!.status,
    ).toBeNull();
  });

  it("ignores records whose thread is gone, archived or hidden", () => {
    const threads = [
      thread("archived", { isArchived: true, archivedAt: NOW }),
      thread("hidden", { isHidden: true }),
    ];
    const model = buildArmada(
      threads,
      projects,
      registryOf(["missing"], ["archived"], ["hidden"]),
    );
    expect(model.captains).toEqual([]);
    expect(model.threads).toEqual([]);
  });

  it("skips archived and hidden workers", () => {
    const threads = [
      thread("cap"),
      thread("gone", {
        parentThreadId: "cap",
        isArchived: true,
        archivedAt: NOW,
      }),
      thread("secret", { parentThreadId: "cap", isHidden: true }),
      thread("w", { parentThreadId: "cap" }),
    ];
    const [captain] = buildArmada(
      threads,
      projects,
      registryOf(["cap"]),
    ).captains;
    expect(idsOf(captain!.workers)).toEqual(["w"]);
  });

  it("orders captains by when they were made one", () => {
    const threads = [thread("late"), thread("early"), thread("middle")];
    const registry = registryOf(
      ["late", "2026-03-01T00:00:00.000Z"],
      ["early", "2026-01-01T00:00:00.000Z"],
      ["middle", "2026-02-01T00:00:00.000Z"],
    );
    expect(
      buildArmada(threads, projects, registry).captains.map((c) => c.thread.id),
    ).toEqual(["early", "middle", "late"]);
  });

  it("gives a captain under another captain its own entry and keeps its subtree to itself", () => {
    const threads = [
      thread("outer"),
      thread("inner", { parentThreadId: "outer" }),
      thread("inner-worker", { parentThreadId: "inner" }),
      thread("outer-worker", { parentThreadId: "outer" }),
    ];
    const model = buildArmada(
      threads,
      projects,
      registryOf(
        ["outer", "2026-01-01T00:00:00.000Z"],
        ["inner", "2026-02-01T00:00:00.000Z"],
      ),
    );
    const [outer, inner] = model.captains;
    expect(idsOf(outer!.workers)).toEqual(["outer-worker"]);
    expect(idsOf(inner!.workers)).toEqual(["inner-worker"]);
    expect(model.threads).toEqual([]);
  });
});

describe("the thread list", () => {
  it("shows only root threads and folds children into them", () => {
    const threads = [
      thread("root"),
      thread("child", { parentThreadId: "root" }),
      thread("grandchild", { parentThreadId: "child" }),
    ];
    expect(threadIds(buildArmada(threads, projects, none))).toEqual(["root"]);
  });

  it("lifts a root's status to the most urgent thread in its subtree", () => {
    const threads = [
      thread("root"),
      thread("child", { parentThreadId: "root", ...busy }),
      thread("deep", { parentThreadId: "child", ...blocked }),
    ];
    const [entry] = buildArmada(threads, projects, none).threads;
    expect(entry!.status).toBe("needs-you");
  });

  it("treats a thread whose parent is not visible as a root", () => {
    const threads = [thread("orphan", { parentThreadId: "archived-parent" })];
    expect(threadIds(buildArmada(threads, projects, none))).toEqual(["orphan"]);
  });

  it("orders threads across projects by latest activity, counting folded children", () => {
    const threads = [
      thread("a-old", { projectId: "proj_a", updatedAt: NOW - 5000 }),
      thread("b-root", { projectId: "proj_b", updatedAt: NOW - 4000 }),
      thread("a-child", {
        projectId: "proj_a",
        parentThreadId: "a-old",
        updatedAt: NOW - 1000,
      }),
    ];
    expect(threadIds(buildArmada(threads, projects, none))).toEqual([
      "a-old",
      "b-root",
    ]);
  });

  it("puts pinned threads first in their manual order, then the rest newest first", () => {
    const threads = [
      thread("recent", { updatedAt: NOW - 1000 }),
      thread("older", { updatedAt: NOW - 9000 }),
      thread("pin-b", {
        isPinned: true,
        pinnedAt: NOW,
        pinSortKey: "b",
        updatedAt: NOW - 20000,
      }),
      thread("pin-a", {
        isPinned: true,
        pinnedAt: NOW,
        pinSortKey: "a",
        updatedAt: NOW - 30000,
      }),
    ];
    expect(threadIds(buildArmada(threads, projects, none))).toEqual([
      "pin-a",
      "pin-b",
      "recent",
      "older",
    ]);
  });

  it("skips hidden and archived threads", () => {
    const threads = [
      thread("shown"),
      thread("hidden", { isHidden: true }),
      thread("archived", { isArchived: true, archivedAt: NOW }),
    ];
    expect(threadIds(buildArmada(threads, projects, none))).toEqual(["shown"]);
  });

  it("still lists a thread whose project is not in the project list", () => {
    const model = buildArmada(
      [thread("lost", { projectId: "proj_unknown" })],
      projects,
      none,
    );
    expect(threadIds(model)).toEqual(["lost"]);
    expect(model.threads[0]!.projectName).toBeNull();
  });

  it("still lists every thread when parents form a loop", () => {
    const threads = [
      thread("a", { parentThreadId: "b" }),
      thread("b", { parentThreadId: "a" }),
    ];
    expect(threadIds(buildArmada(threads, projects, none)).sort()).toEqual([
      "a",
      "b",
    ]);
  });

  it("names each thread's project", () => {
    const model = buildArmada(
      [thread("a", { projectId: "proj_b" })],
      projects,
      none,
    );
    expect(model.threads[0]!.projectName).toBe("Beta");
  });
});
