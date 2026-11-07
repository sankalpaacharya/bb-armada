import os from "node:os";
import path from "node:path";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

import plugin from "../server";
import {
  LEGACY_CAPTAINS_BACKUP_KEY,
  LEGACY_CAPTAINS_KEY,
  type CaptainRecord,
} from "../lib/captains";
import type { ParkRecord } from "../lib/lifecycle";
import type { Created } from "../lib/rpc";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const HOMES = path.join(os.homedir(), ".bb", "captains");

/** bb's host files over captain homes, keyed by their path under `~/.bb/captains`. */
function homeFiles(homesNow: () => Record<string, string>) {
  const keyOf = (file: string) => path.relative(HOMES, file);
  return {
    listPaths: async ({
      path: folder,
      excludeNames = [],
    }: {
      path: string;
      excludeNames?: string[];
    }) => ({
      paths: Object.keys(homesNow())
        .map((key) => path.relative(folder, path.join(HOMES, key)))
        .filter(
          (relative) =>
            !relative.startsWith("..") &&
            !relative.split("/").some((name) => excludeNames.includes(name)),
        )
        .map((relative) => ({
          kind: "file",
          name: path.basename(relative),
          path: relative,
        })),
      truncated: false,
    }),
    read: async ({ path: file }: { path: string }) => {
      const content = homesNow()[keyOf(file)];
      if (content === undefined) throw new Error(`ENOENT: ${file}`);
      return {
        path: file,
        content,
        contentEncoding: "utf8",
        sizeBytes: content.length,
        modifiedAtMs: 1_000,
        sha256: "sha",
      };
    },
  };
}

async function load(
  options: {
    seed?: (kv: Kv) => Promise<void>;
    homes?: Record<string, string>;
  } = {},
) {
  const { bb, harness } = createFakePluginHost({
    pluginId: "armada",
    sdk: {
      threads: {
        spawn: async () => ({ id: "thr_new" }) as never,
        list: async () => [],
      },
      files: homeFiles(() => options.homes ?? {}),
    },
  });
  await options.seed?.(bb.storage.kv);
  await plugin(bb);
  await harness.callRpc("parks_evaluate", null);
  const started = {
    calls: harness.sdk.calls.length,
    invalidations: harness.experimental_rpcInvalidations.length,
  };
  const list = () =>
    harness.callRpc("captains_list", null) as Promise<CaptainRecord[]>;
  const ids = async () =>
    (await list()).map((record) => record.threadId).sort();
  /** What happened after the start-up pass. */
  const since = {
    calls: (callPath?: string) =>
      harness.sdk.calls
        .slice(started.calls)
        .filter((call) => callPath === undefined || call.path === callPath),
    invalidations: () =>
      harness.experimental_rpcInvalidations.slice(started.invalidations),
  };
  return { bb, harness, list, ids, since };
}

type Kv = ReturnType<typeof createFakePluginHost>["bb"]["storage"]["kv"];

const avatar = (seed: string) => ({ style: "micah", seed });
const adopt = (
  threadId: string,
  seed = "one",
  createdAt = "2026-01-01T00:00:00.000Z",
) => ({ threadId, avatar: avatar(seed), createdAt });
const create = {
  projectId: "p",
  projectName: "P",
  name: "P",
  avatar: avatar("new"),
};

describe("captain records", () => {
  it("starts empty", async () => {
    const { list } = await load();
    expect(await list()).toEqual([]);
  });

  it("spawns a captain thread titled with its name in the project, records it and invalidates the captains read", async () => {
    const { harness, list, since } = await load();
    const created = (await harness.callRpc("captains_create", {
      ...create,
      projectId: "proj_a",
      projectName: "Alpha",
      name: "  Fleet ",
    })) as Created;
    expect(created).toMatchObject({
      outcome: "recorded",
      record: { threadId: "thr_new" },
    });
    expect(await list()).toEqual([
      expect.objectContaining({ threadId: "thr_new", avatar: avatar("new") }),
    ]);
    expect(since.invalidations()).toEqual([["captains"]]);

    const [spawn] = harness.sdk.callsTo("threads.spawn");
    expect(spawn![0]).toMatchObject({
      projectId: "proj_a",
      environment: { type: "project-default" },
      title: "Fleet",
    });
    expect((spawn![0] as { prompt: string }).prompt).toContain(
      "~/.bb/captains/alpha.md",
    );
  });

  it("refuses a blank name without spawning a thread", async () => {
    const { harness, list } = await load();
    await expect(
      harness.callRpc("captains_create", { ...create, name: "   " }),
    ).rejects.toThrow();
    expect(harness.sdk.callsTo("threads.spawn")).toEqual([]);
    expect(await list()).toEqual([]);
  });

  it("does not record a captain when the thread cannot be spawned", async () => {
    const { harness, list } = await load();
    harness.sdk.stub("threads.spawn", async () => {
      throw new Error("no host");
    });
    await expect(harness.callRpc("captains_create", create)).rejects.toThrow(
      "no host",
    );
    expect(await list()).toEqual([]);
  });

  it("still records the spawned thread when the first writes fail, waiting longer before each retry", async () => {
    const { bb, harness, ids } = await load();
    vi.useFakeTimers();
    const set = bb.storage.kv.set.bind(bb.storage.kv);
    const attempts: number[] = [];
    vi.spyOn(bb.storage.kv, "set").mockImplementation(async (key, value) => {
      attempts.push(Date.now());
      if (attempts.length < 3) throw new Error("busy");
      return set(key, value);
    });
    const created = harness.callRpc("captains_create", create);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await created).toMatchObject({ outcome: "recorded" });
    expect(attempts.map((at) => at - attempts[0]!)).toEqual([0, 100, 500]);
    expect(await ids()).toEqual(["thr_new"]);
  });

  it("names the spawned thread it could not record, without spawning another", async () => {
    const { bb, harness, list } = await load();
    vi.useFakeTimers();
    vi.spyOn(bb.storage.kv, "set").mockRejectedValue(new Error("disk full"));
    const created = harness.callRpc("captains_create", create);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await created).toEqual({
      outcome: "unrecorded",
      threadId: "thr_new",
      reason: "disk full",
    });
    expect(harness.sdk.callsTo("threads.spawn")).toHaveLength(1);
    expect(harness.logEntries).toContainEqual({
      level: "error",
      message: expect.stringContaining("thr_new"),
    });
    vi.restoreAllMocks();
    expect(await list()).toEqual([]);
  });

  it("adopts an existing thread and keeps its original date when adopted again", async () => {
    const { harness, list } = await load();
    await harness.callRpc("captains_adopt", adopt("thr_x"));
    await harness.callRpc(
      "captains_adopt",
      adopt("thr_x", "two", "2026-05-01T00:00:00.000Z"),
    );
    expect(await list()).toEqual([
      {
        threadId: "thr_x",
        avatar: avatar("two"),
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("changes the avatar and keeps the date, and refuses a thread that is not a captain", async () => {
    const { harness, list } = await load();
    await harness.callRpc("captains_adopt", adopt("thr_x"));
    const [first] = await list();
    await harness.callRpc("captains_update", {
      threadId: "thr_x",
      avatar: avatar("two"),
    });
    expect(await list()).toEqual([{ ...first, avatar: avatar("two") }]);
    await expect(
      harness.callRpc("captains_update", {
        threadId: "nope",
        avatar: avatar("x"),
      }),
    ).rejects.toThrow("not a captain");
  });

  it("clears a park the thread had when it is adopted or removed, so it does not drop onto a shelf later", async () => {
    const { harness } = await load();
    const parks = () =>
      harness.callRpc("parks_list", null) as Promise<ParkRecord[]>;
    await harness.callRpc("parks_settle", { threadId: "thr_x", at: 5 });
    await harness.callRpc("captains_adopt", adopt("thr_x"));
    expect(await parks()).toEqual([]);
    await harness.callRpc("parks_settle", { threadId: "thr_x", at: 6 });
    await harness.callRpc("captains_remove", { threadId: "thr_x" });
    expect(await parks()).toEqual([]);
    expect(harness.experimental_rpcInvalidations).toContainEqual([
      "captains",
      "parks",
    ]);
  });

  it("keeps a removed captain removed when an update was reading it at the same time", async () => {
    const { bb, harness, list } = await load();
    await harness.callRpc("captains_adopt", adopt("thr_x"));
    const get = bb.storage.kv.get.bind(bb.storage.kv);
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    vi.spyOn(bb.storage.kv, "get").mockImplementationOnce(async (key) => {
      await held;
      return get(key);
    });
    const updating = harness.callRpc("captains_update", {
      threadId: "thr_x",
      avatar: avatar("two"),
    });
    const removing = harness.callRpc("captains_remove", { threadId: "thr_x" });
    release();
    await Promise.all([updating, removing]);
    expect(await list()).toEqual([]);
  });

  it("refuses unknown fields instead of dropping them", async () => {
    const { harness } = await load();
    await expect(
      harness.callRpc("captains_remove", { threadId: "thr_x", logo: "flag" }),
    ).rejects.toThrow();
  });

  it("removes only the record, and removing twice is harmless", async () => {
    const { harness, list, since } = await load();
    await harness.callRpc("captains_adopt", adopt("thr_x"));
    await harness.callRpc("captains_remove", { threadId: "thr_x" });
    await harness.callRpc("captains_remove", { threadId: "thr_x" });
    expect(await list()).toEqual([]);
    expect(since.calls()).toEqual([]);
  });

  it("invalidates the captains read after every write", async () => {
    const { harness, since } = await load();
    await harness.callRpc("captains_adopt", adopt("thr_x"));
    await harness.callRpc("captains_update", {
      threadId: "thr_x",
      avatar: avatar("two"),
    });
    await harness.callRpc("captains_remove", { threadId: "thr_x" });
    expect(since.invalidations()).toEqual([
      ["captains", "parks"],
      ["captains"],
      ["captains", "parks"],
    ]);
  });

  it("keeps every concurrent adoption", async () => {
    const { harness, ids } = await load();
    await Promise.all(
      ["a", "b", "c", "d"].map((threadId) =>
        harness.callRpc("captains_adopt", adopt(threadId)),
      ),
    );
    expect(await ids()).toEqual(["a", "b", "c", "d"]);
  });

  it("rejects an avatar style it does not draw, the retired adventurer included", async () => {
    const { harness } = await load();
    for (const style of ["pixel-art", "adventurer"]) {
      await expect(
        harness.callRpc("captains_adopt", {
          threadId: "thr_x",
          avatar: { style, seed: "x" },
        }),
      ).rejects.toThrow();
    }
  });

  it("reads a stored adventurer avatar as micah with the same seed", async () => {
    const { list } = await load({
      seed: (kv) =>
        kv.set("captain:old", {
          threadId: "old",
          avatar: { style: "adventurer", seed: "thr_xi84gbn3wi" },
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
    });
    expect(await list()).toEqual([
      {
        threadId: "old",
        avatar: avatar("thr_xi84gbn3wi"),
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("reads a stored anime portrait as micah seeded by its thread", async () => {
    const { list } = await load({
      seed: (kv) =>
        kv.set("captain:pal", {
          threadId: "pal",
          avatar: { style: "anime", character: 3, background: 5 },
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
    });
    expect(await list()).toEqual([
      {
        threadId: "pal",
        avatar: avatar("pal"),
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("gives a logo-and-colour record an avatar seeded by its thread, and skips a record it cannot read, with a log line", async () => {
    const { harness, list } = await load({
      seed: async (kv) => {
        await kv.set("captain:good", {
          threadId: "good",
          logo: "flag",
          color: "rose",
          createdAt: "2026-01-01T00:00:00.000Z",
        });
        await kv.set("captain:bad", { threadId: "bad" });
      },
    });
    expect(await list()).toEqual([
      {
        threadId: "good",
        avatar: avatar("good"),
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(harness.logEntries).toContainEqual({
      level: "warn",
      message: expect.stringContaining("captain:bad"),
    });
  });
});

describe("long thread ids", () => {
  it("lists a record from before avatars whose thread id is longer than a seed", async () => {
    const long = "t".repeat(70);
    const { ids } = await load({
      seed: async (kv) => {
        await kv.set(`captain:${long}`, {
          threadId: long,
          logo: "flag",
          color: "rose",
          createdAt: "2026-01-01T00:00:00.000Z",
        });
        await kv.set("captain:ok", {
          threadId: "ok",
          avatar: avatar("ok"),
          createdAt: "2026-01-01T00:00:00.000Z",
        });
      },
    });
    expect(await ids()).toEqual(["ok", long]);
  });
});

describe("parks", () => {
  const list = (harness: Awaited<ReturnType<typeof load>>["harness"]) =>
    harness.callRpc("parks_list", null) as Promise<ParkRecord[]>;

  it("settles, snoozes and unparks a thread, invalidating the parks read each time", async () => {
    const { harness, since } = await load();
    const settled = (await harness.callRpc("parks_settle", {
      threadId: "t",
      at: 1000,
    })) as ParkRecord;
    expect(settled).toEqual({
      threadId: "t",
      kind: "settled",
      at: 1000,
      by: "user",
    });
    expect(await list(harness)).toEqual([settled]);

    const snoozed = (await harness.callRpc("parks_snooze", {
      threadId: "t",
      at: 2000,
      until: 62_000,
    })) as ParkRecord;
    expect(snoozed).toEqual({
      threadId: "t",
      kind: "snoozed",
      at: 2000,
      until: 62_000,
    });
    expect(await list(harness)).toEqual([snoozed]);

    await harness.callRpc("parks_unpark", { threadId: "t" });
    await harness.callRpc("parks_unpark", { threadId: "t" });
    expect(await list(harness)).toEqual([]);
    expect(since.invalidations()).toEqual([
      ["parks"],
      ["parks"],
      ["parks"],
      ["parks"],
    ]);
  });

  it("refuses a snooze that would end before it starts", async () => {
    const { harness } = await load();
    await expect(
      harness.callRpc("parks_snooze", { threadId: "t", at: 2000, until: 2000 }),
    ).rejects.toThrow(/after it starts/);
    expect(await list(harness)).toEqual([]);
  });

  it("reads a settle stored before auto-settle as the user's, and skips a park it cannot read, with a log line", async () => {
    const { harness } = await load({
      seed: async (kv) => {
        await kv.set("park:good", { threadId: "good", kind: "settled", at: 5 });
        await kv.set("park:bad", { threadId: "bad", kind: "snoozed" });
      },
    });
    expect(await list(harness)).toEqual([
      { threadId: "good", kind: "settled", at: 5, by: "user" },
    ]);
    expect(harness.logEntries).toContainEqual({
      level: "warn",
      message: expect.stringContaining("park:bad"),
    });
  });
});

describe("migration from the single captains key", () => {
  const legacy = {
    version: 1,
    captains: {
      good: {
        threadId: "good",
        logo: "flag",
        color: "rose",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      mismatched: {
        threadId: "other",
        logo: "flag",
        color: "rose",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    },
  };

  const migrated = {
    threadId: "good",
    avatar: avatar("good"),
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("moves each record to its own key as an avatar record and deletes the old key", async () => {
    const { bb, list } = await load({
      seed: (kv) => kv.set(LEGACY_CAPTAINS_KEY, legacy),
    });
    expect(await list()).toEqual([migrated]);
    expect(await bb.storage.kv.get("captain:good")).toEqual(migrated);
    expect(await bb.storage.kv.get(LEGACY_CAPTAINS_KEY)).toBeUndefined();
  });

  it("converges when a previous run stopped before deleting the old key", async () => {
    const { bb, list } = await load({
      seed: async (kv) => {
        await kv.set("captain:good", migrated);
        await kv.set(LEGACY_CAPTAINS_KEY, legacy);
      },
    });
    expect(await list()).toEqual([migrated]);
    expect(await bb.storage.kv.get(LEGACY_CAPTAINS_KEY)).toBeUndefined();
  });

  it("keeps the raw old value aside, so a registry it cannot read is not lost", async () => {
    const { bb, list } = await load({
      seed: (kv) => kv.set(LEGACY_CAPTAINS_KEY, "garbage"),
    });
    expect(await list()).toEqual([]);
    expect(await bb.storage.kv.get(LEGACY_CAPTAINS_KEY)).toBeUndefined();
    expect(await bb.storage.kv.get(LEGACY_CAPTAINS_BACKUP_KEY)).toBe("garbage");
  });

  it("still serves the list when the move fails, and keeps the old key to retry", async () => {
    const { createFakePluginHost: host } =
      await import("@get-bb/plugin-sdk/testing");
    const { bb, harness } = host({ pluginId: "armada" });
    await bb.storage.kv.set(LEGACY_CAPTAINS_KEY, legacy);
    vi.spyOn(bb.storage.kv, "set").mockRejectedValue(new Error("busy"));
    await plugin(bb);
    expect(await harness.callRpc("captains_list", null)).toEqual([]);
    expect(await bb.storage.kv.get(LEGACY_CAPTAINS_KEY)).toEqual(legacy);
    expect(harness.logEntries).toContainEqual({
      level: "error",
      message: expect.stringContaining("busy"),
    });
  });
});

describe("auto-settle", () => {
  const DAY = 86_400_000;
  const HOUR = 3_600_000;
  const started = Date.now();
  const quietFor = (ms: number) => started - ms;

  type Listed = {
    id: string;
    parentThreadId: string | null;
    lifecycleOwnerThreadId: string | null;
    environmentId: string | null;
    visibility: "visible" | "hidden";
    archivedAt: number | null;
    deletedAt: number | null;
    pinnedAt: number | null;
    createdAt: number;
    updatedAt: number;
    latestAttentionAt: number;
    hasPendingInteraction: boolean;
    queuedWork: "none" | "waiting" | "failed";
    status: string;
    activity: Record<
      | "activeBackgroundAgentCount"
      | "activeBackgroundCommandCount"
      | "activeGoalCount"
      | "activePlanModeCount"
      | "activeWorkflowCount",
      number
    >;
  };

  const listed = (id: string, overrides: Partial<Listed> = {}): Listed => ({
    id,
    parentThreadId: null,
    lifecycleOwnerThreadId: null,
    environmentId: null,
    visibility: "visible",
    archivedAt: null,
    deletedAt: null,
    pinnedAt: null,
    createdAt: quietFor(5 * DAY),
    updatedAt: quietFor(4 * DAY),
    latestAttentionAt: 0,
    hasPendingInteraction: false,
    queuedWork: "none",
    status: "idle",
    activity: {
      activeBackgroundAgentCount: 0,
      activeBackgroundCommandCount: 0,
      activeGoalCount: 0,
      activePlanModeCount: 0,
      activeWorkflowCount: 0,
    },
    ...overrides,
  });

  type Row =
    | {
        outcome: "available";
        pullRequest: { state: string; updatedAt: string };
      }
    | { outcome: "absent" }
    | { outcome: "unavailable"; message: string };

  async function loadAuto(
    options: {
      threads?: Listed[];
      pullRequests?: Record<string, Row>;
      settings?: Record<string, number | boolean>;
      seed?: (kv: Kv) => Promise<void>;
      homes?: Record<string, string>;
    } = {},
  ) {
    let threads = options.threads ?? [];
    let homes = options.homes ?? {};
    const { bb, harness } = createFakePluginHost({
      pluginId: "armada",
      settings: options.settings,
      sdk: {
        threads: {
          list: async (args) => {
            const offset = args?.offset ?? 0;
            return threads.slice(offset, offset + (args?.limit ?? 100));
          },
        },
        files: homeFiles(() => homes),
        plugins: {
          callRpc: async ({ input }) => {
            const { keys } = input as { keys: string[] };
            return Object.fromEntries(
              keys.map((key) => [
                key,
                options.pullRequests?.[key] ?? { outcome: "absent" },
              ]),
            );
          },
        },
      },
    });
    await options.seed?.(bb.storage.kv);
    await plugin(bb);
    const evaluate = async () =>
      (
        (await harness.callRpc("parks_evaluate", null)) as {
          changed: string[];
        }
      ).changed.sort();
    const startup = await evaluate();
    const parks = async () =>
      ((await harness.callRpc("parks_list", null)) as ParkRecord[]).sort(
        (a, b) => a.threadId.localeCompare(b.threadId),
      );
    return {
      bb,
      harness,
      startup,
      evaluate,
      parks,
      setThreads: (next: Listed[]) => {
        threads = next;
      },
      setHomes: (next: Record<string, string>) => {
        homes = next;
      },
    };
  }

  it("settles quiet cards once at start, as auto, and invalidates the parks read", async () => {
    const { startup, parks, harness } = await loadAuto({
      threads: [listed("old"), listed("recent", { updatedAt: quietFor(HOUR) })],
    });
    expect(startup).toEqual(["old"]);
    expect(await parks()).toEqual([
      { threadId: "old", kind: "settled", at: expect.any(Number), by: "auto" },
    ]);
    expect(harness.experimental_rpcInvalidations).toContainEqual(["parks"]);
  });

  it("writes nothing on a second run when nothing changed", async () => {
    const { evaluate, bb } = await loadAuto({ threads: [listed("old")] });
    const set = vi.spyOn(bb.storage.kv, "set");
    const remove = vi.spyOn(bb.storage.kv, "delete");
    expect(await evaluate()).toEqual([]);
    expect(set).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("unsettles an auto-settled card on new activity", async () => {
    const { evaluate, parks, setThreads } = await loadAuto({
      threads: [listed("old")],
    });
    setThreads([listed("old", { latestAttentionAt: quietFor(1000) })]);
    expect(await evaluate()).toEqual(["old"]);
    expect(await parks()).toEqual([]);
  });

  it("never settles a kept card or touches a user's settle, and leaves a snooze alone", async () => {
    const { startup, parks } = await loadAuto({
      threads: [
        listed("kept"),
        listed("user", { updatedAt: quietFor(HOUR) }),
        listed("snoozed"),
      ],
      seed: async (kv) => {
        await kv.set("park:kept", { threadId: "kept", kind: "kept", at: 1 });
        await kv.set("park:user", { threadId: "user", kind: "settled", at: 1 });
        await kv.set("park:snoozed", {
          threadId: "snoozed",
          kind: "snoozed",
          at: 1,
          until: started + DAY,
        });
      },
    });
    expect(startup).toEqual([]);
    expect((await parks()).map((park) => park.kind)).toEqual([
      "kept",
      "snoozed",
      "settled",
    ]);
  });

  it("folds a card's tree: a working child holds its root, and a captain's worker is its own card", async () => {
    const { startup } = await loadAuto({
      threads: [
        listed("root"),
        listed("child", { parentThreadId: "root", status: "active" }),
        listed("cap"),
        listed("worker", { parentThreadId: "cap" }),
      ],
      seed: async (kv) => {
        await kv.set("captain:cap", {
          threadId: "cap",
          avatar: { style: "micah", seed: "cap" },
          createdAt: "2026-01-01T00:00:00.000Z",
        });
      },
    });
    expect(startup).toEqual(["worker"]);
  });

  const withCaptain = async (kv: Kv) => {
    await kv.set("captain:cap", {
      threadId: "cap",
      avatar: { style: "micah", seed: "cap" },
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  };

  it("folds a supervisor into its captain, so each worker it runs is a card and it never is", async () => {
    const { startup } = await loadAuto({
      threads: [
        listed("cap"),
        listed("thr_sup", { parentThreadId: "cap" }),
        listed("quiet", { parentThreadId: "thr_sup" }),
        listed("busy", { parentThreadId: "thr_sup", status: "active" }),
      ],
      homes: { "cops/backlog.md": "Supervisor: thr_sup\n" },
      seed: withCaptain,
    });
    expect(startup).toEqual(["quiet"]);
  });

  it("settles nothing when the homes cannot be read, rather than fold workers into their supervisor", async () => {
    const { harness, evaluate, parks } = await loadAuto({
      threads: [listed("old")],
    });
    harness.sdk.stub("files.listPaths", async () => {
      throw new Error("host offline");
    });
    await harness.callRpc("parks_unpark", { threadId: "old" });
    await expect(evaluate()).rejects.toThrow("host offline");
    expect(await parks()).toEqual([]);
  });

  it("refreshes the homes reads at start, then on the schedule only when a supervisor changed", async () => {
    const { harness, setHomes } = await loadAuto({
      homes: { "cops/backlog.md": "Supervisor: (none yet)\n" },
    });
    const homesRefreshes = () =>
      harness.experimental_rpcInvalidations.filter((tags) =>
        tags?.includes("homes"),
      ).length;
    expect(homesRefreshes()).toBe(1);
    await harness.runSchedule("auto-settle");
    expect(homesRefreshes()).toBe(1);
    setHomes({ "cops/backlog.md": "Supervisor: thr_new\n" });
    await harness.runSchedule("auto-settle");
    expect(homesRefreshes()).toBe(2);
    expect(await harness.callRpc("captain_supervisors", null)).toEqual([
      "thr_new",
    ]);
  });

  it("holds pinned, waiting and queued cards, and skips hidden and archived threads", async () => {
    const { startup } = await loadAuto({
      threads: [
        listed("pinned", { pinnedAt: 1 }),
        listed("waiting", { hasPendingInteraction: true }),
        listed("queued", { queuedWork: "waiting" }),
        listed("planning", {
          activity: { ...listed("x").activity, activePlanModeCount: 1 },
        }),
        listed("hidden", { visibility: "hidden" }),
        listed("archived", { archivedAt: 1 }),
      ],
    });
    expect(startup).toEqual([]);
  });

  it("reads each card's pull request from GitHub PR Status: merged settles, open holds, unreadable leaves it", async () => {
    const after = new Date(started - HOUR / 2).toISOString();
    const { startup, harness } = await loadAuto({
      threads: [
        listed("merged", { environmentId: "env_m", updatedAt: quietFor(HOUR) }),
        listed("open", { environmentId: "env_o" }),
        listed("down", { environmentId: "env_d" }),
        listed("gone", { environmentId: "env_g" }),
      ],
      pullRequests: {
        env_m: {
          outcome: "available",
          pullRequest: { state: "merged", updatedAt: after },
        },
        env_o: {
          outcome: "available",
          pullRequest: { state: "open", updatedAt: after },
        },
        env_d: { outcome: "unavailable", message: "offline" },
      },
    });
    expect(startup).toEqual(["gone", "merged"]);
    const [call] = harness.sdk.callsTo("plugins.callRpc");
    expect(call![0]).toMatchObject({
      pluginId: "bb--github-pr-status",
      method: "pullRequests",
      input: { keys: ["env_m", "env_o", "env_d", "env_g"] },
    });
  });

  it("changes nothing for cards with an environment when GitHub PR Status cannot be called", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "armada",
      sdk: {
        threads: {
          list: async () => [
            listed("env", { environmentId: "env_1" }),
            listed("bare"),
          ],
        },
        plugins: {
          callRpc: async () => {
            throw new Error("plugin not loaded");
          },
        },
        files: homeFiles(() => ({})),
      },
    });
    await plugin(bb);
    expect(await harness.callRpc("parks_evaluate", null)).toEqual({
      changed: ["bare"],
    });
  });

  it("follows the settings: 0 days turns age off, and a change runs again", async () => {
    const { startup, harness, parks } = await loadAuto({
      threads: [listed("old")],
      settings: { autoSettleAfterDays: 0 },
    });
    expect(startup).toEqual([]);
    await harness.setSettings({ autoSettleAfterDays: 3 });
    await vi.waitFor(async () =>
      expect((await parks()).map((park) => park.threadId)).toEqual(["old"]),
    );
  });

  it("runs on its five-minute schedule", async () => {
    const { harness, parks, setThreads } = await loadAuto();
    setThreads([listed("old")]);
    await harness.runSchedule("auto-settle");
    expect((await parks()).map((park) => park.threadId)).toEqual(["old"]);
  });

  it("stores Move to active as kept, and a later settle replaces it", async () => {
    const { harness, parks, evaluate } = await loadAuto({
      threads: [listed("old")],
    });
    expect(
      await harness.callRpc("parks_keep", { threadId: "old", at: 2000 }),
    ).toEqual({ threadId: "old", kind: "kept", at: 2000 });
    expect(await evaluate()).toEqual([]);
    await harness.callRpc("parks_settle", { threadId: "old", at: 3000 });
    expect(await parks()).toEqual([
      { threadId: "old", kind: "settled", at: 3000, by: "user" },
    ]);
  });
});

describe("captain homes", () => {
  const homes = {
    "cops/captain.md": "# Captain\n",
    "cops/backlog.md": "# Backlog: cops\n\nSupervisor: thr_sup1\n",
    "cops/tasks/fix-login/brief.md": "Fix the login.\n",
    "cops/notes.txt": "not memory",
    "personal/backlog.md": "Supervisor: (none yet; started on first task)\n",
    "my-app/backlog.md": "# Backlog\nSupervisor: thr_sup2 (since Monday)\n",
    "my-app/tasks/old/backlog.md": "Supervisor: thr_stale\n",
  };

  it("lists the markdown in a project's home by its name, with each file's size and age", async () => {
    const { harness } = await load({ homes });
    expect(await harness.callRpc("captain_home", { project: "cops" })).toEqual({
      status: "ready",
      folder: "~/.bb/captains/cops",
      root: path.join(HOMES, "cops"),
      files: [
        { path: "captain.md", sizeBytes: 10, modifiedAt: 1_000 },
        { path: "backlog.md", sizeBytes: 38, modifiedAt: 1_000 },
        {
          path: "tasks/fix-login/brief.md",
          sizeBytes: 15,
          modifiedAt: 1_000,
        },
      ],
    });
    expect(
      await harness.callRpc("captain_home", { project: "My App" }),
    ).toMatchObject({ status: "ready", folder: "~/.bb/captains/my-app" });
  });

  it("calls a home with no folder missing, not an error", async () => {
    const { harness } = await load({ homes });
    expect(
      await harness.callRpc("captain_home", { project: "Nowhere" }),
    ).toEqual({ status: "missing", folder: "~/.bb/captains/nowhere" });
  });

  it("names each home's supervisor from its backlog, skipping homes without one", async () => {
    const { harness } = await load({ homes });
    expect(await harness.callRpc("captain_supervisors", null)).toEqual([
      "thr_sup1",
      "thr_sup2",
    ]);
  });
});
