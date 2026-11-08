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
  inactiveAfterMs: number | null = null,
  supervisors: ReadonlySet<string> = new Set(),
) =>
  buildArmada(
    threads,
    projects,
    {},
    captains,
    parks,
    supervisors,
    NOW,
    inactiveAfterMs,
  );

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
  const badge = (id: string, name = id) => ({
    threadId: id,
    name,
    avatar: { style: "micah", seed: id },
  });

  it("lists a captain's children in Threads as cards carrying their captain", () => {
    const threads = [
      thread("cap", { title: "cops" }),
      thread("w1", { parentThreadId: "cap", createdAt: NOW - 3000 }),
      thread("w2", { parentThreadId: "cap", createdAt: NOW - 2000 }),
      thread("plain", { createdAt: NOW - 1000 }),
    ];
    const model = build(threads, registryOf(["cap"]));
    expect(threadIds(model)).toEqual(["plain", "w2", "w1"]);
    expect(
      model.threads.find((entry) => entry.thread.id === "w1"),
    ).toMatchObject({
      captain: badge("cap", "cops"),
      adoptable: false,
    });
    expect(model.captains.map((captain) => captain.thread.id)).toEqual(["cap"]);
  });

  it("folds a grandchild into its worker's card, which carries the captain", () => {
    const threads = [
      thread("cap"),
      thread("w", { parentThreadId: "cap", updatedAt: NOW - 3000 }),
      thread("grandchild", {
        parentThreadId: "w",
        updatedAt: NOW - 1000,
        ...blocked,
      }),
    ];
    const model = build(threads, registryOf(["cap"]));
    expect(threadIds(model)).toEqual(["w"]);
    expect(model.threads[0]).toMatchObject({
      captain: badge("cap"),
      status: "needs-you",
      activityAt: NOW - 1000,
    });
  });

  it("gives a thread with no captain above it no captain, and lets it become one", () => {
    const threads = [
      thread("root"),
      thread("child", { parentThreadId: "root" }),
    ];
    const [entry] = build(threads, none).threads;
    expect(entry).toMatchObject({ captain: null, adoptable: true });
  });

  it("follows the lifecycle owner when a worker has no parent", () => {
    const threads = [
      thread("cap"),
      thread("w", { lifecycleOwnerThreadId: "cap" }),
    ];
    const [entry] = build(threads, registryOf(["cap"])).threads;
    expect(entry).toMatchObject({ captain: badge("cap") });
  });

  it("still counts the workers in the captain's summary and status", () => {
    const threads = [
      thread("cap"),
      thread("w1", { parentThreadId: "cap", ...busy }),
      thread("w2", { parentThreadId: "cap", ...busy }),
      thread("w3", { parentThreadId: "cap", ...blocked }),
      thread("deep", { parentThreadId: "w3", indicator: "unread-error" }),
      thread("w4", { parentThreadId: "cap" }),
    ];
    const [captain] = build(threads, registryOf(["cap"])).captains;
    expect(captain!.counts).toEqual({ working: 2, needsYou: 1, failed: 1 });
    expect(captain!.status).toBe("needs-you");
  });

  it("counts the captain's own state in its status", () => {
    const threads = [
      thread("cap", busy),
      thread("w", { parentThreadId: "cap" }),
    ];
    const [captain] = build(threads, registryOf(["cap"])).captains;
    expect(captain!.status).toBe("working");
  });

  it("has no status while everything is idle", () => {
    const threads = [thread("cap"), thread("w", { parentThreadId: "cap" })];
    expect(build(threads, registryOf(["cap"])).captains[0]!.status).toBeNull();
  });

  describe("under a supervisor", () => {
    const supervised = [
      thread("cap", { title: "cops", createdAt: NOW - 5000 }),
      thread("sup", { parentThreadId: "cap", ...blocked }),
      thread("w1", { parentThreadId: "sup", createdAt: NOW - 3000, ...busy }),
      thread("w2", { parentThreadId: "sup", createdAt: NOW - 2000 }),
      thread("deep", { parentThreadId: "w2", indicator: "unread-error" }),
    ];
    const everyCard = (model: ReturnType<typeof build>) => [
      ...idsOf(model.threads),
      ...idsOf(model.inactive),
      ...idsOf(model.snoozed),
      ...idsOf(model.settled),
    ];

    it("lists each supervised worker as the captain's own card, and the supervisor nowhere", () => {
      const model = build(
        supervised,
        registryOf(["cap"]),
        [settledAt("sup", NOW - 1000)],
        null,
        new Set(["sup"]),
      );
      expect(threadIds(model)).toEqual(["w2", "w1"]);
      expect(everyCard(model)).toEqual(["w2", "w1"]);
      for (const worker of model.threads)
        expect(worker).toMatchObject({
          captain: badge("cap", "cops"),
          adoptable: false,
        });
      expect(model.threads[0]).toMatchObject({ status: "failed" });
    });

    it("folds the supervisor and its workers into the captain's counts and status", () => {
      const [captain] = build(
        supervised,
        registryOf(["cap"]),
        [],
        null,
        new Set(["sup"]),
      ).captains;
      expect(captain!.counts).toEqual({ working: 1, needsYou: 1, failed: 1 });
      expect(captain!.status).toBe("needs-you");
    });

    it("treats a captain's child titled as its supervisor as the supervisor, without its home naming it", () => {
      const threads = [
        thread("cap", { title: "cops" }),
        thread("sup", { parentThreadId: "cap", title: "cops supervisor" }),
        thread("w", { parentThreadId: "sup", ...busy }),
      ];
      const model = build(threads, registryOf(["cap"]));
      expect(threadIds(model)).toEqual(["w"]);
      expect(model.threads[0]).toMatchObject({ captain: badge("cap", "cops") });
      expect(model.captains[0]!.counts.working).toBe(1);
    });

    it("leaves a thread titled supervisor alone when no captain is its parent", () => {
      const threads = [
        thread("root"),
        thread("sup", { parentThreadId: "root", title: "a supervisor" }),
      ];
      expect(threadIds(build(threads, none))).toEqual(["root"]);
    });

    it("ignores a supervisor whose parent is not a captain, which stays one card", () => {
      const threads = [
        thread("root"),
        thread("sup", { parentThreadId: "root" }),
        thread("w", { parentThreadId: "sup" }),
      ];
      const model = build(threads, none, [], null, new Set(["sup"]));
      expect(threadIds(model)).toEqual(["root"]);
      expect(model.threads[0]).toMatchObject({ captain: null });
    });
  });

  it("shows a card as working while a hidden child of it works, without making the child a card", () => {
    const threads = [
      thread("parent"),
      thread("helper", { parentThreadId: "parent", isHidden: true, ...busy }),
    ];
    const model = build(threads, none);
    expect(threadIds(model)).toEqual(["parent"]);
    expect(model.threads[0]).toMatchObject({ status: "working" });
  });

  it("ignores records whose thread is gone, archived or hidden", () => {
    const threads = [
      thread("archived", { isArchived: true, archivedAt: NOW }),
      thread("hidden", { isHidden: true }),
    ];
    const model = build(
      threads,
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
    expect(threadIds(build(threads, registryOf(["cap"])))).toEqual(["w"]);
  });

  it("orders captains by when they were made one", () => {
    const threads = [thread("late"), thread("early"), thread("middle")];
    const registry = registryOf(
      ["late", "2026-03-01T00:00:00.000Z"],
      ["early", "2026-01-01T00:00:00.000Z"],
      ["middle", "2026-02-01T00:00:00.000Z"],
    );
    expect(build(threads, registry).captains.map((c) => c.thread.id)).toEqual([
      "early",
      "middle",
      "late",
    ]);
  });

  it("gives a captain under another captain its own row, and its workers its badge", () => {
    const threads = [
      thread("outer"),
      thread("inner", { parentThreadId: "outer" }),
      thread("inner-worker", { parentThreadId: "inner", ...busy }),
      thread("outer-worker", { parentThreadId: "outer" }),
    ];
    const model = build(
      threads,
      registryOf(
        ["outer", "2026-01-01T00:00:00.000Z"],
        ["inner", "2026-02-01T00:00:00.000Z"],
      ),
    );
    expect(model.captains.map((c) => c.thread.id)).toEqual(["outer", "inner"]);
    const captainOf = (id: string) =>
      model.threads.find((entry) => entry.thread.id === id)?.captain?.threadId;
    expect(captainOf("inner-worker")).toBe("inner");
    expect(captainOf("outer-worker")).toBe("outer");
    expect(model.captains[0]!.counts.working).toBe(0);
    expect(model.captains[1]!.counts.working).toBe(1);
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
    expect(threadIds(build(threads, none))).toEqual(["a-old", "b-root"]);
  });

  it("puts pinned threads first in their manual order, then the rest by creation, newest first, whatever their activity", () => {
    const threads = [
      thread("recent", { createdAt: NOW - 1000, updatedAt: NOW - 9000 }),
      thread("older", { createdAt: NOW - 9000, updatedAt: NOW }),
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
    const model = build([thread("lost", { projectId: "proj_unknown" })], none);
    expect(threadIds(model)).toEqual(["lost"]);
    expect(model.threads[0]!.projectName).toBeNull();
  });

  it("still lists every thread when parents form a loop", () => {
    const threads = [
      thread("a", { parentThreadId: "b" }),
      thread("b", { parentThreadId: "a" }),
    ];
    expect(threadIds(build(threads, none)).sort()).toEqual(["a", "b"]);
  });

  it("names each thread's project", () => {
    const model = build([thread("a", { projectId: "proj_b" })], none);
    expect(model.threads[0]!.projectName).toBe("Beta");
  });
});

describe("shelves", () => {
  it("moves a settled root to the settled shelf and a snoozed one to snoozed, soonest wake first", () => {
    const threads = [thread("a"), thread("b"), thread("c"), thread("d")];
    const model = build(threads, none, [
      settledAt("a", NOW - HOUR),
      settledAt("b", NOW - 2 * HOUR),
      snoozedUntil("c", NOW + 3 * HOUR),
      snoozedUntil("d", NOW + HOUR),
    ]);
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

  it("keeps a root active when one child failed and another is still working", () => {
    const threads = [
      thread("root"),
      thread("failed", { parentThreadId: "root", indicator: "unread-error" }),
      thread("running", { parentThreadId: "root", runtimeStatus: "active" }),
    ];
    const model = build(threads, none, [settledAt("root", NOW - HOUR)]);
    expect(threadIds(model)).toEqual(["root"]);
    expect(model.threads[0]).toMatchObject({
      status: "failed",
      parkable: false,
    });
    expect(model.settled).toEqual([]);
  });

  it("keeps a captain's worker active when it failed but its own child is still working", () => {
    const threads = [
      thread("cap"),
      thread("w", { parentThreadId: "cap", indicator: "unread-error" }),
      thread("grandchild", { parentThreadId: "w", runtimeStatus: "active" }),
    ];
    const model = build(threads, registryOf(["cap"]), [
      settledAt("w", NOW - HOUR),
    ]);
    expect(threadIds(model)).toEqual(["w"]);
    expect(model.threads[0]!.parkable).toBe(false);
    expect(model.settled).toEqual([]);
  });

  it("keeps a thread active when a send failed while its turn is still running", () => {
    const threads = [
      thread("t", { queuedWork: "failed", runtimeStatus: "active" }),
    ];
    const model = build(threads, none, [snoozedUntil("t", NOW + HOUR)]);
    expect(threadIds(model)).toEqual(["t"]);
    expect(model.threads[0]).toMatchObject({
      status: "failed",
      parkable: false,
    });
    expect(model.snoozed).toEqual([]);
  });

  it("lets a failed or finished tree be parked", () => {
    const threads = [
      thread("root", { indicator: "unread-error" }),
      thread("child", { parentThreadId: "root", indicator: "unread-success" }),
    ];
    const model = build(threads, none);
    expect(model.threads[0]!.parkable).toBe(true);
    expect(
      build(threads, none, [settledAt("root", NOW - HOUR)]).settled,
    ).toHaveLength(1);
  });

  it("brings a settled root back when its subtree gets new attention", () => {
    const threads = [
      thread("root"),
      thread("child", { parentThreadId: "root", latestAttentionAt: NOW }),
    ];
    const model = build(threads, none, [settledAt("root", NOW - HOUR)]);
    expect(threadIds(model)).toEqual(["root"]);
  });

  it("parks a worker onto the same shelves as any card", () => {
    const threads = [
      thread("cap"),
      thread("w1", { parentThreadId: "cap" }),
      thread("w2", { parentThreadId: "cap" }),
    ];
    const model = build(threads, registryOf(["cap"]), [
      settledAt("w1", NOW - HOUR),
    ]);
    expect(threadIds(model)).toEqual(["w2"]);
    expect(idsOf(model.settled)).toEqual(["w1"]);
    expect(model.settled[0]!.captain?.threadId).toBe("cap");
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

describe("the Inactive shelf", () => {
  const SIX_HOURS = 6 * HOUR;
  const old = { createdAt: NOW - 9 * HOUR, updatedAt: NOW - 8 * HOUR };

  it("shelves quiet cards newest first, and leaves pinned, live and recent ones active", () => {
    const threads = [
      thread("older", { ...old, updatedAt: NOW - 9 * HOUR }),
      thread("old", old),
      thread("pinned", { ...old, isPinned: true, pinnedAt: 1 }),
      thread("busy", { ...old, ...busy }),
      thread("recent"),
    ];
    const model = build(threads, none, [], SIX_HOURS);
    expect(idsOf(model.inactive)).toEqual(["old", "older"]);
    expect(threadIds(model).sort()).toEqual(["busy", "pinned", "recent"]);
  });

  it("ages a card by the newest activity anywhere in its tree", () => {
    const threads = [
      thread("root", old),
      thread("child", { parentThreadId: "root" }),
    ];
    expect(idsOf(build(threads, none, [], SIX_HOURS).inactive)).toEqual([]);
  });

  it("never shelves a captain, and ages its workers as their own cards", () => {
    const threads = [
      thread("cap", old),
      thread("worker", { ...old, parentThreadId: "cap" }),
    ];
    const model = build(threads, registryOf(["cap"]), [], SIX_HOURS);
    expect(idsOf(model.inactive)).toEqual(["worker"]);
    expect(model.captains.map((captain) => captain.thread.id)).toEqual(["cap"]);
  });

  it("returns an auto-settled card to the list on new activity and marks the park to delete", () => {
    const parks = [settledAt("back", NOW - 2 * HOUR, "auto")];
    const model = build([thread("back")], none, parks, SIX_HOURS);
    expect(threadIds(model)).toEqual(["back"]);
    expect(model.expiredParks).toEqual(["back"]);
  });
});
