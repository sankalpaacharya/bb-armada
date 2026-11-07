import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { describe, expect, it } from "vitest";

import type { CaptainRecord } from "../lib/captains";
import type { ParkRecord } from "../lib/lifecycle";
import { buildArmada, type ThreadEntry } from "../lib/model";
import { NOW, project, settledAt, snoozedUntil, thread } from "./fixtures";

const projects = [project("proj_a", "Alpha"), project("proj_b", "Beta")];
const HOUR = 3_600_000;

const build = (
  threads: readonly PluginSidebarThread[],
  captains: readonly CaptainRecord[],
  parks: readonly ParkRecord[] = [],
) => buildArmada(threads, projects, captains, parks, NOW);

function registryOf(
  ...ids: [id: string, createdAt?: string][]
): CaptainRecord[] {
  return ids.map(([id, createdAt = "2026-01-01T00:00:00.000Z"]) => ({
    threadId: id,
    avatar: { style: "micah", seed: id },
    createdAt,
  }));
}

const none = registryOf();
const idsOf = (list: readonly ThreadEntry[]) =>
  list.map((entry) => entry.thread.id);
const threadIds = (model: ReturnType<typeof build>) =>
  model.threads.map((entry) => entry.thread.id);
const busy: Partial<PluginSidebarThread> = { status: "active" };
const blocked: Partial<PluginSidebarThread> = { hasPendingInteraction: true };

describe("captains and their workers", () => {
  it("lists the captain's children as workers, each folding its own subtree, newest activity first", () => {
    const threads = [
      thread("cap"),
      thread("w1", { parentThreadId: "cap", updatedAt: NOW - 3000 }),
      thread("w2", { parentThreadId: "cap", updatedAt: NOW - 2000 }),
      thread("grandchild", {
        parentThreadId: "w1",
        updatedAt: NOW - 1000,
        ...blocked,
      }),
    ];
    const [captain] = build(threads, registryOf(["cap"]),
    ).captains;
    expect(idsOf(captain!.workers)).toEqual(["w1", "w2"]);
    expect(captain!.workers[0]).toMatchObject({
      status: "needs-you",
      activityAt: NOW - 1000,
      adoptable: false,
    });
    expect(captain!.status).toBe("needs-you");
    expect(captain!.activityAt).toBe(NOW - 1000);
  });

  it("follows the lifecycle owner when a worker has no parent", () => {
    const threads = [
      thread("cap"),
      thread("w", { lifecycleOwnerThreadId: "cap" }),
    ];
    const [captain] = build(threads, registryOf(["cap"]),
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
    const model = build(threads, registryOf(["cap"]));
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
    const [captain] = build(threads, registryOf(["cap"]),
    ).captains;
    expect(captain!.status).toBe("needs-you");
  });

  it("counts the captain's own state in its status", () => {
    const threads = [
      thread("cap", busy),
      thread("w", { parentThreadId: "cap" }),
    ];
    const [captain] = build(threads, registryOf(["cap"]),
    ).captains;
    expect(captain!.status).toBe("working");
  });

  it("has no status while everything is idle", () => {
    const threads = [thread("cap"), thread("w", { parentThreadId: "cap" })];
    expect(
      build(threads, registryOf(["cap"])).captains[0]!.status,
    ).toBeNull();
  });

  it("ignores records whose thread is gone, archived or hidden", () => {
    const threads = [
      thread("archived", { isArchived: true, archivedAt: NOW }),
      thread("hidden", { isHidden: true }),
    ];
    const model = build(threads, registryOf(["missing"], ["archived"], ["hidden"]),
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
    const [captain] = build(threads, registryOf(["cap"]),
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
      build(threads, registry).captains.map((c) => c.thread.id),
    ).toEqual(["early", "middle", "late"]);
  });

  it("gives a captain under another captain its own entry and keeps its subtree to itself", () => {
    const threads = [
      thread("outer"),
      thread("inner", { parentThreadId: "outer" }),
      thread("inner-worker", { parentThreadId: "inner" }),
      thread("outer-worker", { parentThreadId: "outer" }),
    ];
    const model = build(threads, registryOf(
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
    expect(threadIds(build(threads, none))).toEqual(["root"]);
  });

  it("lifts a root's status to the most urgent thread in its subtree", () => {
    const threads = [
      thread("root"),
      thread("child", { parentThreadId: "root", ...busy }),
      thread("deep", { parentThreadId: "child", ...blocked }),
    ];
    const [entry] = build(threads, none).threads;
    expect(entry!.status).toBe("needs-you");
  });

  it("treats a thread whose parent is not visible as a root that can become a captain", () => {
    const threads = [thread("orphan", { parentThreadId: "archived-parent" })];
    const [entry] = build(threads, none).threads;
    expect(entry).toMatchObject({ adoptable: true });
    expect(entry!.thread.id).toBe("orphan");
  });

  it("folds the newest attention of the subtree into the root", () => {
    const threads = [
      thread("root", { latestAttentionAt: NOW - 5000 }),
      thread("child", { parentThreadId: "root", latestAttentionAt: NOW }),
    ];
    const [entry] = build(threads, none).threads;
    expect(entry!.latestAttentionAt).toBe(NOW);
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
    expect(threadIds(build(threads, none))).toEqual([
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
    expect(threadIds(build(threads, none))).toEqual([
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
    expect(threadIds(build(threads, none))).toEqual(["shown"]);
  });

  it("still lists a thread whose project is not in the project list", () => {
    const model = build([thread("lost", { projectId: "proj_unknown" })],
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
    expect(threadIds(build(threads, none)).sort()).toEqual([
      "a",
      "b",
    ]);
  });

  it("names each thread's project", () => {
    const model = build([thread("a", { projectId: "proj_b" })],
      none,
    );
    expect(model.threads[0]!.projectName).toBe("Beta");
  });
});

describe("shelves", () => {
  it("moves a settled root to the settled shelf and a snoozed one to snoozed, soonest wake first", () => {
    const threads = [
      thread("a"),
      thread("b"),
      thread("c"),
      thread("d"),
    ];
    const model = build(
      threads,
      none,
      [
        settledAt("a", NOW - HOUR),
        settledAt("b", NOW - 2 * HOUR),
        snoozedUntil("c", NOW + 3 * HOUR),
        snoozedUntil("d", NOW + HOUR),
      ],
    );
    expect(threadIds(model)).toEqual([]);
    expect(idsOf(model.settled)).toEqual(["a", "b"]);
    expect(idsOf(model.snoozed)).toEqual(["d", "c"]);
    expect(model.settled[0]!.shelf).toBe("settled");
  });

  it("keeps a working root active whatever is stored, and wakes an elapsed snooze", () => {
    const threads = [thread("busy", busy), thread("woke")];
    const model = build(threads, none, [
      settledAt("busy", NOW - HOUR),
      snoozedUntil("woke", NOW - 1),
    ]);
    expect(threadIds(model).sort()).toEqual(["busy", "woke"]);
    expect(model.snoozed).toEqual([]);
  });

  it("brings a settled root back when its subtree gets new attention", () => {
    const threads = [
      thread("root"),
      thread("child", { parentThreadId: "root", latestAttentionAt: NOW }),
    ];
    const model = build(threads, none, [settledAt("root", NOW - HOUR)]);
    expect(threadIds(model)).toEqual(["root"]);
  });

  it("takes a parked worker off its captain and onto the shelf", () => {
    const threads = [
      thread("cap"),
      thread("w1", { parentThreadId: "cap" }),
      thread("w2", { parentThreadId: "cap" }),
    ];
    const model = build(threads, registryOf(["cap"]), [
      settledAt("w1", NOW - HOUR),
    ]);
    expect(idsOf(model.captains[0]!.workers)).toEqual(["w2"]);
    expect(idsOf(model.settled)).toEqual(["w1"]);
  });

  it("never parks a captain", () => {
    const threads = [thread("cap")];
    const model = build(threads, registryOf(["cap"]), [
      settledAt("cap", NOW - HOUR),
    ]);
    expect(model.captains.map((captain) => captain.thread.id)).toEqual(["cap"]);
    expect(model.settled).toEqual([]);
  });

  it("ignores a park for a thread that is gone", () => {
    const model = build([thread("here")], none, [settledAt("gone", NOW)]);
    expect(threadIds(model)).toEqual(["here"]);
    expect(model.settled).toEqual([]);
  });
});
