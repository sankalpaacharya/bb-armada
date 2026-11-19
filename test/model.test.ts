import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { describe, expect, it } from "vitest";

import type { CaptainRecord } from "../lib/captains";
import type { ParkRecord } from "../lib/lifecycle";
import { buildArmada, type ThreadEntry } from "../lib/model";
import { NOW, project, settledAt, snoozedUntil, thread } from "./fixtures";

const projects = [project("proj_a", "Alpha"), project("proj_b", "Beta")];
const HOUR = 3_600_000;
const SIX_HOURS = 6 * HOUR;

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

const registryOf = (...ids: string[]): CaptainRecord[] =>
  ids.map((id) => ({
    threadId: id,
    avatar: { style: "micah", seed: id },
    createdAt: "2026-01-01T00:00:00.000Z",
  }));

const none = registryOf();
const idsOf = (list: readonly ThreadEntry[]) =>
  list.map((entry) => entry.thread.id);
const threadIds = (model: ReturnType<typeof build>) => idsOf(model.threads);
const captainIds = (model: ReturnType<typeof build>) =>
  model.captains.map((captain) => captain.thread.id);
const busy: Partial<PluginSidebarThread> = { status: "active" };
const blocked: Partial<PluginSidebarThread> = { hasPendingInteraction: true };
const old = { createdAt: NOW - 9 * HOUR, updatedAt: NOW - 8 * HOUR };

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
    const model = build(threads, registryOf("cap"));
    expect(threadIds(model)).toEqual(["plain", "w2", "w1"]);
    expect(model.threads[2]).toMatchObject({
      captain: badge("cap", "cops"),
      adoptable: false,
    });
    expect(captainIds(model)).toEqual(["cap"]);
  });

  it("folds a grandchild into its worker's card, which takes the most urgent status in its tree", () => {
    const threads = [
      thread("cap"),
      thread("w", { parentThreadId: "cap", updatedAt: NOW - 3000, ...busy }),
      thread("grandchild", {
        parentThreadId: "w",
        updatedAt: NOW - 1000,
        ...blocked,
      }),
    ];
    const model = build(threads, registryOf("cap"));
    expect(threadIds(model)).toEqual(["w"]);
    expect(model.threads[0]).toMatchObject({
      captain: badge("cap"),
      status: "needs-you",
      activityAt: NOW - 1000,
    });
  });

  it("gives a thread with no captain above it no captain, and lets it become one, even when its parent is not visible", () => {
    const threads = [
      thread("root", { createdAt: NOW - 2000 }),
      thread("child", { parentThreadId: "root" }),
      thread("orphan", { parentThreadId: "gone", createdAt: NOW - 1000 }),
    ];
    const model = build(threads, none);
    expect(threadIds(model)).toEqual(["orphan", "root"]);
    for (const entry of model.threads)
      expect(entry).toMatchObject({ captain: null, adoptable: true });
  });

  it("follows the lifecycle owner when a worker has no parent", () => {
    const threads = [
      thread("cap"),
      thread("w", { lifecycleOwnerThreadId: "cap" }),
    ];
    const [entry] = build(threads, registryOf("cap")).threads;
    expect(entry).toMatchObject({ captain: badge("cap") });
  });

  it("counts the captain's own state in its status, and has none while everything is idle", () => {
    const status = (captain: Partial<PluginSidebarThread>) =>
      build(
        [thread("cap", captain), thread("w", { parentThreadId: "cap" })],
        registryOf("cap"),
      ).captains[0]!.status;
    expect(status(busy)).toBe("working");
    expect(status({})).toBeNull();
  });

  describe("under a supervisor", () => {
    it("lists each supervised worker as the captain's own card, the supervisor nowhere, and folds both into the captain's counts", () => {
      const threads = [
        thread("cap", { title: "cops", createdAt: NOW - 5000 }),
        thread("sup", { parentThreadId: "cap", ...blocked }),
        thread("w1", { parentThreadId: "sup", createdAt: NOW - 3000, ...busy }),
        thread("w2", { parentThreadId: "sup", createdAt: NOW - 2000 }),
        thread("deep", { parentThreadId: "w2", indicator: "unread-error" }),
      ];
      const model = build(
        threads,
        registryOf("cap"),
        [settledAt("sup", NOW - 1000)],
        null,
        new Set(["sup"]),
      );
      expect(threadIds(model)).toEqual(["w2", "w1"]);
      expect(idsOf(model.settled)).toEqual([]);
      for (const worker of model.threads)
        expect(worker).toMatchObject({
          captain: badge("cap", "cops"),
          adoptable: false,
        });
      expect(model.threads[0]).toMatchObject({ status: "failed" });
      expect(model.captains[0]).toMatchObject({
        counts: { working: 1, needsYou: 1, failed: 1 },
        status: "needs-you",
      });
    });

    it.each(["cops supervisor", "cops crew captain"])(
      "treats a captain's child titled as its supervisor as the supervisor, without its home naming it: %s",
      (title) => {
        const threads = [
          thread("cap", { title: "cops" }),
          thread("sup", { parentThreadId: "cap", title }),
          thread("w", { parentThreadId: "sup", ...busy }),
        ];
        const model = build(threads, registryOf("cap"));
        expect(threadIds(model)).toEqual(["w"]);
        expect(model.threads[0]).toMatchObject({
          captain: badge("cap", "cops"),
        });
        expect(model.captains[0]!.counts.working).toBe(1);
      },
    );

    it("leaves a thread titled supervisor alone when no captain is its parent", () => {
      const threads = [
        thread("root"),
        thread("sup", { parentThreadId: "root", title: "a supervisor" }),
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

  it("leaves out archived and hidden threads, and captains whose thread is gone, archived or hidden", () => {
    const threads = [
      thread("archived", { isArchived: true, archivedAt: NOW }),
      thread("hidden", { isHidden: true }),
      thread("cap"),
      thread("gone", {
        parentThreadId: "cap",
        isArchived: true,
        archivedAt: NOW,
      }),
      thread("secret", { parentThreadId: "cap", isHidden: true }),
      thread("w", { parentThreadId: "cap" }),
      thread("shown"),
    ];
    const model = build(
      threads,
      registryOf("cap", "missing", "archived", "hidden"),
    );
    expect(captainIds(model)).toEqual(["cap"]);
    expect(threadIds(model).sort()).toEqual(["shown", "w"]);
  });
});

it("puts pinned threads first in their manual order, then the rest by creation, newest first, whatever their activity", () => {
  const pinned = { isPinned: true, pinnedAt: NOW };
  const threads = [
    thread("recent", { createdAt: NOW - 1000, updatedAt: NOW - 9000 }),
    thread("older", { createdAt: NOW - 9000, updatedAt: NOW }),
    thread("pin-b", { ...pinned, pinSortKey: "b", updatedAt: NOW - 20000 }),
    thread("pin-a", { ...pinned, pinSortKey: "a", updatedAt: NOW - 30000 }),
  ];
  expect(threadIds(build(threads, none))).toEqual([
    "pin-a",
    "pin-b",
    "recent",
    "older",
  ]);
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
  });

  it("keeps a captain's worker active when it failed but its own child is still working", () => {
    const threads = [
      thread("cap"),
      thread("w", { parentThreadId: "cap", indicator: "unread-error" }),
      thread("grandchild", { parentThreadId: "w", runtimeStatus: "active" }),
    ];
    const model = build(threads, registryOf("cap"), [
      settledAt("w", NOW - HOUR),
    ]);
    expect(threadIds(model)).toEqual(["w"]);
    expect(model.threads[0]!.parkable).toBe(false);
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
  });

  it("lets a failed or finished tree be parked", () => {
    const threads = [
      thread("root", { indicator: "unread-error" }),
      thread("child", { parentThreadId: "root", indicator: "unread-success" }),
    ];
    expect(build(threads, none).threads[0]!.parkable).toBe(true);
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

  it("never parks or shelves a captain, and parks and ages its workers as their own cards", () => {
    const threads = [
      thread("cap", old),
      thread("quiet", { ...old, parentThreadId: "cap" }),
      thread("filed", { parentThreadId: "cap" }),
    ];
    const model = build(
      threads,
      registryOf("cap"),
      [settledAt("cap", NOW - HOUR), settledAt("filed", NOW - HOUR)],
      SIX_HOURS,
    );
    expect(captainIds(model)).toEqual(["cap"]);
    expect(idsOf(model.settled)).toEqual(["filed"]);
    expect(model.settled[0]!.captain?.threadId).toBe("cap");
    expect(idsOf(model.inactive)).toEqual(["quiet"]);
  });
});

describe("the Inactive shelf", () => {
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
    expect(build(threads, none, [], SIX_HOURS).inactive).toEqual([]);
  });

  it("returns an auto-settled card to the list on new activity and marks the park to delete", () => {
    const parks = [settledAt("back", NOW - 2 * HOUR, "auto")];
    const model = build([thread("back")], none, parks, SIX_HOURS);
    expect(threadIds(model)).toEqual(["back"]);
    expect(model.expiredParks).toEqual(["back"]);
  });
});
