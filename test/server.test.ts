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
  const made = new Set<string>();
  const exists = (folder: string) =>
    made.has(folder) ||
    Object.keys(homesNow()).some((key) =>
      path.join(HOMES, key).startsWith(`${folder}/`),
    );
  return {
    listPaths: async ({
      path: folder,
      excludeNames = [],
      includeDirectories = false,
    }: {
      path: string;
      excludeNames?: string[];
      includeDirectories?: boolean;
    }) => {
      const under = (paths: string[], kind: string) =>
        paths
          .map((full) => path.relative(folder, full))
          .filter(
            (relative) =>
              relative !== "" &&
              !relative.startsWith("..") &&
              !relative.split("/").some((name) => excludeNames.includes(name)),
          )
          .map((relative) => ({
            kind,
            name: path.basename(relative),
            path: relative,
          }));
      return {
        paths: [
          ...under(
            Object.keys(homesNow()).map((key) => path.join(HOMES, key)),
            "file",
          ),
          ...(includeDirectories ? under([...made], "directory") : []),
        ],
        truncated: false,
      };
    },
    read: async ({ path: file }: { path: string }) => {
      const content = homesNow()[keyOf(file)];
      if (content === undefined) throw new Error(`ENOENT: ${file}`);
      return {
        path: file,
        content,
        contentEncoding: "utf8",
        sizeBytes: content.length,
        modifiedAtMs: 1_000,
        sha256: `sha:${content}`,
      };
    },
    mkdir: async ({ path: folder }: { path: string }) => {
      made.add(folder);
      return { path: folder };
    },
    /** Lands only in a folder that exists and over the version it read, as bb's host files do. */
    write: async ({
      path: file,
      content,
      expectedSha256,
    }: {
      path: string;
      content: string;
      expectedSha256?: string | null;
    }) => {
      if (!exists(path.dirname(file)))
        throw new Error(`HTTP 404: Path does not exist: ${file}`);
      const current = homesNow()[keyOf(file)];
      const sha = current === undefined ? null : `sha:${current}`;
      if (expectedSha256 !== undefined && expectedSha256 !== sha)
        throw new Error(`${file} changed on disk`);
      homesNow()[keyOf(file)] = content;
      return {
        path: file,
        sizeBytes: content.length,
        sha256: `sha:${content}`,
      };
    },
  };
}

async function load(
  options: {
    seed?: (kv: Kv) => Promise<void>;
    homes?: Record<string, string>;
    files?: (files: HomeFiles) => Partial<HomeFiles>;
    threads?: unknown[];
    pullRequests?: Record<string, unknown>;
    settings?: Record<string, number | boolean>;
  } = {},
) {
  let homes = options.homes ?? {};
  let threads = options.threads ?? [];
  let spawned = 0;
  const { bb, harness } = createFakePluginHost({
    pluginId: "armada",
    settings: options.settings,
    sdk: {
      threads: {
        spawn: async () =>
          ({ id: spawned++ === 0 ? "thr_new" : `thr_new${spawned}` }) as never,
        list: async (args) => {
          const offset = args?.offset ?? 0;
          return threads.slice(offset, offset + (args?.limit ?? 100)) as never;
        },
        get: async () => {
          throw new Error("thread_not_found");
        },
        send: async () => ({}) as never,
      },
      projects: { list: async () => [] },
      files: (() => {
        const files = homeFiles(() => homes);
        return { ...files, ...options.files?.(files) };
      })(),
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
      (await harness.callRpc("parks_evaluate", null)) as { changed: string[] }
    ).changed.sort();
  const startup = await evaluate();
  const started = {
    calls: harness.sdk.calls.length,
    invalidations: harness.experimental_rpcInvalidations.length,
  };
  const list = () =>
    harness.callRpc("captains_list", null) as Promise<CaptainRecord[]>;
  const ids = async () =>
    (await list()).map((record) => record.threadId).sort();
  const parks = async () =>
    ((await harness.callRpc("parks_list", null)) as ParkRecord[]).sort((a, b) =>
      a.threadId.localeCompare(b.threadId),
    );
  /** What happened after the start-up pass. */
  const since = {
    calls: () => harness.sdk.calls.slice(started.calls),
    invalidations: () =>
      harness.experimental_rpcInvalidations.slice(started.invalidations),
  };
  return {
    bb,
    harness,
    list,
    ids,
    parks,
    since,
    startup,
    evaluate,
    setThreads: (next: unknown[]) => {
      threads = next;
    },
    setHomes: (next: Record<string, string>) => {
      homes = next;
    },
  };
}

type HomeFiles = ReturnType<typeof homeFiles>;
type Kv = ReturnType<typeof createFakePluginHost>["bb"]["storage"]["kv"];

const avatar = (seed: string) => ({ style: "micah", seed });
const adopt = (
  threadId: string,
  seed = "one",
  createdAt = "2026-01-01T00:00:00.000Z",
) => ({ threadId, avatar: avatar(seed), createdAt, name: "Fleet" });
const create = {
  projectId: "p",
  projectName: "P",
  name: "P",
  avatar: avatar("new"),
  execution: {
    providerId: "codex",
    model: "gpt-5.5",
    reasoningLevel: "high",
    serviceTier: "fast",
  },
};

describe("captain order", () => {
  const seed = async (kv: Kv) => {
    for (const [index, threadId] of ["a", "b", "c"].entries()) {
      await kv.set(`captain:${threadId}`, {
        threadId,
        avatar: avatar(threadId),
        createdAt: `2026-01-0${index + 1}T00:00:00.000Z`,
      });
    }
  };
  const orderOf = async (list: () => Promise<CaptainRecord[]>) =>
    (await list()).map((record) => record.threadId);

  it("saves a move across reloads, keeps it after avatar edits, and appends new captains", async () => {
    const { harness, list } = await load({ seed });
    await harness.callRpc("captains_reorder", {
      threadId: "c",
      beforeThreadId: "a",
    });
    await harness.callRpc("captains_update", {
      threadId: "c",
      avatar: avatar("new"),
    });
    await harness.callRpc("captains_create", create);
    expect(await orderOf(list)).toEqual(["c", "a", "b", "thr_new"]);
    const reloaded = await harness.lifecycle.reload(plugin);
    expect(
      await orderOf(
        () =>
          reloaded.harness.behavior.callRpc("captains_list", null) as Promise<
            CaptainRecord[]
          >,
      ),
    ).toEqual(["c", "a", "b", "thr_new"]);
  });

  it("moves a captain to the end and never brings a removed captain back", async () => {
    const { harness, list } = await load({ seed });
    await harness.callRpc("captains_reorder", {
      threadId: "a",
      beforeThreadId: null,
    });
    expect(await orderOf(list)).toEqual(["b", "c", "a"]);
    await harness.callRpc("captains_remove", { threadId: "c" });
    await harness.callRpc("captains_reorder", {
      threadId: "a",
      beforeThreadId: "b",
    });
    expect(await orderOf(list)).toEqual(["a", "b"]);
  });

  it("applies concurrent relative moves to the latest saved order", async () => {
    const { harness, list } = await load({ seed });
    await Promise.all([
      harness.callRpc("captains_reorder", {
        threadId: "b",
        beforeThreadId: "a",
      }),
      harness.callRpc("captains_reorder", {
        threadId: "c",
        beforeThreadId: "b",
      }),
    ]);
    expect(await orderOf(list)).toEqual(["c", "b", "a"]);
  });
});

describe("captain records", () => {
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
      expect.objectContaining({
        threadId: "thr_new",
        avatar: avatar("new"),
        home: "fleet",
      }),
    ]);
    expect(since.invalidations()).toEqual([["captains"]]);

    const [spawn] = harness.sdk.callsTo("threads.spawn");
    expect(spawn![0]).toMatchObject({
      projectId: "proj_a",
      environment: { type: "project-default" },
      title: "Fleet",
      ...create.execution,
    });
    const [part] = (
      spawn![0] as {
        input: { text: string; mentions: { resource: { name: string } }[] }[];
      }
    ).input;
    expect(part.text.startsWith("/armada ")).toBe(true);
    expect(part.text).toContain("~/.bb/captains/fleet/");
    expect(part.mentions.map((mention) => mention.resource.name)).toEqual([
      "armada",
    ]);
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
      home: "p",
      reason: "disk full",
    });
    expect(harness.sdk.callsTo("threads.spawn")).toHaveLength(1);
    vi.restoreAllMocks();
    expect(await list()).toEqual([]);
  });

  it("adopts a thread again or changes its avatar to a custom logo, keeping its date across reloads", async () => {
    const { harness, list } = await load();
    await harness.callRpc("captains_adopt", adopt("thr_x"));
    await harness.callRpc(
      "captains_adopt",
      adopt("thr_x", "two", "2026-05-01T00:00:00.000Z"),
    );
    const logo = {
      style: "logo",
      seed: "face",
      image: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
    };
    await harness.callRpc("captains_update", {
      threadId: "thr_x",
      avatar: logo,
    });
    const expected = [
      {
        threadId: "thr_x",
        avatar: logo,
        createdAt: "2026-01-01T00:00:00.000Z",
        home: "fleet",
      },
    ];
    expect(await list()).toEqual(expected);
    const reloaded = await harness.lifecycle.reload(plugin);
    expect(
      await reloaded.harness.behavior.callRpc("captains_list", null),
    ).toEqual(expected);
  });

  it("clears a park the thread had when it is adopted or removed, so it does not drop onto a shelf later", async () => {
    const { harness, parks } = await load();
    await harness.callRpc("parks_settle", { threadId: "thr_x", at: 5 });
    await harness.callRpc("captains_adopt", adopt("thr_x"));
    expect(await parks()).toEqual([]);
    await harness.callRpc("parks_settle", { threadId: "thr_x", at: 6 });
    await harness.callRpc("captains_remove", { threadId: "thr_x" });
    expect(await parks()).toEqual([]);
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

  it("keeps every concurrent adoption, each in a home of its own", async () => {
    const { harness, ids, list } = await load();
    await Promise.all(
      ["a", "b", "c", "d"].map((threadId) =>
        harness.callRpc("captains_adopt", adopt(threadId)),
      ),
    );
    expect(await ids()).toEqual(["a", "b", "c", "d"]);
    expect((await list()).map((record) => record.home).sort()).toEqual([
      "fleet",
      "fleet-2",
      "fleet-3",
      "fleet-4",
    ]);
  });

  it("lists captains stored before avatars or with a retired style, a long thread id included, and skips one it cannot read", async () => {
    const long = "t".repeat(70);
    const older = {
      adventurer: { avatar: { style: "adventurer", seed: "kept" } },
      anime: { avatar: { style: "anime", character: 3, background: 5 } },
      [long]: { logo: "flag", color: "rose" },
    };
    const { harness, ids } = await load({
      seed: async (kv) => {
        for (const [threadId, stored] of Object.entries(older)) {
          await kv.set(`captain:${threadId}`, {
            threadId,
            createdAt: "2026-01-01T00:00:00.000Z",
            ...stored,
          });
        }
        await kv.set("captain:bad", { threadId: "bad" });
      },
    });
    expect(await ids()).toEqual(["adventurer", "anime", long]);
    expect(harness.logEntries).toContainEqual({
      level: "warn",
      message: expect.stringContaining("captain:bad"),
    });
  });
});

describe("parks", () => {
  it("settles, snoozes and unparks a thread, invalidating the parks read each time", async () => {
    const { harness, parks, since } = await load();
    await harness.callRpc("parks_settle", { threadId: "t", at: 1000 });
    expect(await parks()).toEqual([
      { threadId: "t", kind: "settled", at: 1000, by: "user" },
    ]);
    await harness.callRpc("parks_snooze", {
      threadId: "t",
      at: 2000,
      until: 62_000,
    });
    expect(await parks()).toEqual([
      { threadId: "t", kind: "snoozed", at: 2000, until: 62_000 },
    ]);
    await harness.callRpc("parks_unpark", { threadId: "t" });
    expect(await parks()).toEqual([]);
    expect(since.invalidations()).toEqual([["parks"], ["parks"], ["parks"]]);
  });

  it("refuses a snooze that would end before it starts", async () => {
    const { harness, parks } = await load();
    await expect(
      harness.callRpc("parks_snooze", { threadId: "t", at: 2000, until: 2000 }),
    ).rejects.toThrow();
    expect(await parks()).toEqual([]);
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
    },
  };

  it("moves each record to its own key as an avatar record and deletes the old key", async () => {
    const { bb, list } = await load({
      seed: (kv) => kv.set(LEGACY_CAPTAINS_KEY, legacy),
    });
    const migrated = {
      threadId: "good",
      avatar: avatar("good"),
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    expect(await list()).toEqual([migrated]);
    expect(await bb.storage.kv.get("captain:good")).toEqual(migrated);
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
    const { bb, list } = await load({
      seed: async (kv) => {
        await kv.set(LEGACY_CAPTAINS_KEY, legacy);
        vi.spyOn(kv, "set").mockRejectedValue(new Error("busy"));
      },
    });
    expect(await list()).toEqual([]);
    expect(await bb.storage.kv.get(LEGACY_CAPTAINS_KEY)).toEqual(legacy);
  });
});

describe("auto-settle", () => {
  const DAY = 86_400_000;
  const HOUR = 3_600_000;
  const started = Date.now();
  const quietFor = (ms: number) => started - ms;

  const listed = (id: string, overrides: Record<string, unknown> = {}) => ({
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

  it("settles quiet cards once at start, as auto, and invalidates the parks read", async () => {
    const { startup, parks, harness } = await load({
      threads: [listed("old"), listed("recent", { updatedAt: quietFor(HOUR) })],
    });
    expect(startup).toEqual(["old"]);
    expect(await parks()).toEqual([
      { threadId: "old", kind: "settled", at: expect.any(Number), by: "auto" },
    ]);
    expect(harness.experimental_rpcInvalidations).toContainEqual(["parks"]);
  });

  it("unsettles an auto-settled card on new activity", async () => {
    const { evaluate, parks, setThreads } = await load({
      threads: [listed("old")],
    });
    setThreads([listed("old", { latestAttentionAt: quietFor(1000) })]);
    expect(await evaluate()).toEqual(["old"]);
    expect(await parks()).toEqual([]);
  });

  it("settles each quiet card of a tree, never a supervisor, a pinned card, or a hidden or archived thread", async () => {
    const { startup } = await load({
      threads: [
        listed("root"),
        listed("child", { parentThreadId: "root", status: "active" }),
        listed("cap"),
        listed("worker", { parentThreadId: "cap" }),
        listed("thr_sup", { parentThreadId: "cap" }),
        listed("quiet", { parentThreadId: "thr_sup" }),
        listed("busy", { parentThreadId: "thr_sup", status: "active" }),
        listed("pinned", { pinnedAt: 1 }),
        listed("hidden", { visibility: "hidden" }),
        listed("archived", { archivedAt: 1 }),
      ],
      homes: { "cops/backlog.md": "Supervisor: thr_sup\n" },
      seed: (kv) =>
        kv.set("captain:cap", {
          threadId: "cap",
          avatar: avatar("cap"),
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
    });
    expect(startup).toEqual(["quiet", "worker"]);
  });

  it("reads each card's pull request from GitHub PR Status: merged settles, open holds", async () => {
    const after = new Date(started - HOUR / 2).toISOString();
    const { startup, harness } = await load({
      threads: [
        listed("merged", { environmentId: "env_m", updatedAt: quietFor(HOUR) }),
        listed("open", { environmentId: "env_o" }),
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
      },
    });
    expect(startup).toEqual(["merged"]);
    const [call] = harness.sdk.callsTo("plugins.callRpc");
    expect(call![0]).toMatchObject({
      pluginId: "bb--github-pr-status",
      method: "pullRequests",
      input: { keys: ["env_m", "env_o"] },
    });
  });

  it("runs again when the settings change and on its schedule", async () => {
    const { harness, parks, setThreads } = await load({
      threads: [listed("old")],
      settings: { autoSettleAfterDays: 0 },
    });
    expect(await parks()).toEqual([]);
    await harness.setSettings({ autoSettleAfterDays: 3 });
    await vi.waitFor(async () =>
      expect((await parks()).map((park) => park.threadId)).toEqual(["old"]),
    );
    setThreads([listed("old"), listed("older")]);
    await harness.runSchedule("auto-settle");
    expect((await parks()).map((park) => park.threadId)).toEqual([
      "old",
      "older",
    ]);
  });

  it("refreshes the homes reads on the schedule only when a supervisor changed", async () => {
    const { harness, setHomes } = await load({
      homes: { "cops/backlog.md": "Supervisor: (none yet)\n" },
    });
    const homesRefreshes = () =>
      harness.experimental_rpcInvalidations.filter((tags) =>
        tags?.includes("homes"),
      ).length;
    await harness.runSchedule("auto-settle");
    expect(homesRefreshes()).toBe(1);
    setHomes({ "cops/backlog.md": "Supervisor: thr_new\n" });
    await harness.runSchedule("auto-settle");
    expect(homesRefreshes()).toBe(2);
    expect(await harness.callRpc("captain_supervisors", null)).toEqual([
      "thr_new",
    ]);
  });

  it("stores Move to active as kept, and a later settle replaces it", async () => {
    const { harness, parks, evaluate } = await load({
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
  it("lists the markdown in the project's home of a captain without its own, with each file's size and age", async () => {
    const homes = {
      "cops/captain.md": "# Captain\n",
      "cops/tasks/fix-login/brief.md": "Fix the login.\n",
      "cops/notes.txt": "not memory",
    };
    const { harness } = await load({ homes });
    expect(
      await harness.callRpc("captain_home", {
        threadId: "thr_cops",
        project: "cops",
      }),
    ).toEqual({
      status: "ready",
      folder: "~/.bb/captains/cops",
      root: path.join(HOMES, "cops"),
      files: [
        { path: "captain.md", sizeBytes: 10, modifiedAt: 1_000 },
        {
          path: "tasks/fix-login/brief.md",
          sizeBytes: 15,
          modifiedAt: 1_000,
        },
      ],
    });
  });

  it("calls a home with no folder missing, not an error", async () => {
    const { harness } = await load();
    expect(
      await harness.callRpc("captain_home", {
        threadId: "thr_none",
        project: "Nowhere",
      }),
    ).toEqual({ status: "missing", folder: "~/.bb/captains/nowhere" });
  });

  it("numbers a new captain's home past a folder on disk, a project's home included, another captain's, or tasks, which the memory reader skips", async () => {
    const homes = { "personal/backlog.md": "", "forms/captain.md": "" };
    const { harness } = await load({ homes });
    const make = async (name: string) => {
      const created = (await harness.callRpc("captains_create", {
        ...create,
        name,
      })) as Created;
      if (created.outcome !== "recorded") throw new Error(created.reason);
      return created.record.home;
    };
    expect(await make("Personal")).toBe("personal-2");
    expect(await make("Personal")).toBe("personal-3");
    expect(await make("Forms")).toBe("forms-2");
    expect(await make("Tasks")).toBe("tasks-2");
  });

  it("gives a thread made a captain a fresh home and tells it where, but a removed captain made one again the home it owns", async () => {
    const homes = {
      "fleet/backlog.md": "",
      "personal/backlog.md": "Captain: thr_old\nCrew captain: thr_crew\n",
    };
    const { harness, list } = await load({ homes });
    await harness.callRpc("captains_adopt", adopt("thr_x"));
    await harness.callRpc("captains_adopt", adopt("thr_old"));
    expect(await list()).toEqual([
      expect.objectContaining({ threadId: "thr_old", home: "personal" }),
      expect.objectContaining({ threadId: "thr_x", home: "fleet-2" }),
    ]);
    expect(harness.sdk.callsTo("files.mkdir")).toHaveLength(1);
    expect(harness.sdk.callsTo("threads.send")).toEqual([
      [
        expect.objectContaining({
          threadId: "thr_x",
          input: [
            expect.objectContaining({
              text: expect.stringContaining("~/.bb/captains/fleet-2/"),
            }),
          ],
        }),
      ],
    ]);
  });

  it("records the home a failed create gave its thread, without making or announcing another", async () => {
    const { harness, list } = await load();
    await harness.callRpc("captains_adopt", {
      ...adopt("thr_x"),
      home: "video-editing",
    });
    expect(await list()).toEqual([
      expect.objectContaining({ threadId: "thr_x", home: "video-editing" }),
    ]);
    expect(harness.sdk.callsTo("files.mkdir")).toEqual([]);
    expect(harness.sdk.callsTo("threads.send")).toEqual([]);
  });

  it("keeps a captain from before on its project's home", async () => {
    const { harness } = await load({
      homes: { "personal/backlog.md": "# Backlog\n" },
      seed: (kv) =>
        kv.set("captain:thr_old", {
          threadId: "thr_old",
          avatar: avatar("old"),
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
    });
    expect(
      await harness.callRpc("captain_home", {
        threadId: "thr_old",
        project: "Personal",
      }),
    ).toMatchObject({
      status: "ready",
      folder: "~/.bb/captains/personal",
      files: [expect.objectContaining({ path: "backlog.md" })],
    });
  });
});

describe("captain instructions", () => {
  const captainMd = "# Captain\n\n## Preferences\n- Small PRs.\n";
  const cops = { threadId: "thr_cap", project: "cops" };

  it("writes a new captain's instructions to its own home before starting its thread, and points the thread at them", async () => {
    const homes: Record<string, string> = {};
    const { harness, since } = await load({ homes });
    await harness.callRpc("captains_create", {
      ...create,
      projectName: "My App",
      name: "Reviewer",
      instructions: "  Act as a senior engineer.\nKeep replies short.  ",
    });
    expect(homes["reviewer/captain.md"]).toContain(
      "> Act as a senior engineer.\n> Keep replies short.\n",
    );
    const order = since
      .calls()
      .map((call) => call.path)
      .filter((callPath) =>
        ["files.write", "threads.spawn"].includes(callPath),
      );
    expect(order).toEqual(["files.write", "threads.spawn"]);
    const [spawn] = harness.sdk.callsTo("threads.spawn");
    const [part] = (spawn![0] as { input: { text: string }[] }).input;
    expect(part.text).toContain("## Instructions from the user");
    expect(part.text).not.toContain("senior engineer");
    expect(
      await harness.callRpc("captain_instructions", {
        threadId: "thr_new",
        project: "My App",
      }),
    ).toBe("Act as a senior engineer.\nKeep replies short.");
  });

  it("does not write over a captain.md the captain changed since it was read", async () => {
    const homes = { "cops/captain.md": captainMd };
    const { harness } = await load({
      homes,
      files: ({ read }) => ({
        read: async (args) => {
          const file = await read(args);
          homes["cops/captain.md"] = `${captainMd}- A new line.\n`;
          return file;
        },
      }),
    });
    await expect(
      harness.callRpc("captain_instructions_save", {
        ...cops,
        instructions: "Be brief.",
      }),
    ).rejects.toThrow("changed on disk");
    expect(homes["cops/captain.md"]).toBe(`${captainMd}- A new line.\n`);
  });

  it("saves the instructions beside what the captain wrote and tells it to re-read them", async () => {
    const homes = { "cops/captain.md": captainMd };
    const { harness, since } = await load({ homes });
    expect(
      await harness.callRpc("captain_instructions_save", {
        ...cops,
        instructions: "Be brief.",
      }),
    ).toEqual({ told: true });
    expect(homes["cops/captain.md"]).toBe(
      `${captainMd}\n## Instructions from the user\n\n> Be brief.\n`,
    );
    expect(since.invalidations()).toContainEqual(["homes"]);
    const [send] = harness.sdk.callsTo("threads.send");
    expect(send![0]).toMatchObject({
      threadId: "thr_cap",
      mode: "queue-if-active",
      input: [{ text: expect.stringContaining("captain.md") }],
    });
  });
});
