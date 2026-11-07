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

async function load(options: { seed?: (kv: Kv) => Promise<void> } = {}) {
  const { bb, harness } = createFakePluginHost({
    pluginId: "armada",
    sdk: { threads: { spawn: async () => ({ id: "thr_new" }) as never } },
  });
  await options.seed?.(bb.storage.kv);
  await plugin(bb);
  const list = () =>
    harness.callRpc("captains_list", null) as Promise<CaptainRecord[]>;
  const ids = async () =>
    (await list()).map((record) => record.threadId).sort();
  return { bb, harness, list, ids };
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
    const { harness, list } = await load();
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
    expect(harness.experimental_rpcInvalidations).toEqual([["captains"]]);

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
    const { harness, list } = await load();
    await harness.callRpc("captains_adopt", adopt("thr_x"));
    await harness.callRpc("captains_remove", { threadId: "thr_x" });
    await harness.callRpc("captains_remove", { threadId: "thr_x" });
    expect(await list()).toEqual([]);
    expect(harness.sdk.calls).toEqual([]);
  });

  it("invalidates the captains read after every write", async () => {
    const { harness } = await load();
    await harness.callRpc("captains_adopt", adopt("thr_x"));
    await harness.callRpc("captains_update", {
      threadId: "thr_x",
      avatar: avatar("two"),
    });
    await harness.callRpc("captains_remove", { threadId: "thr_x" });
    expect(harness.experimental_rpcInvalidations).toEqual([
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
    const { harness } = await load();
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
    expect(harness.experimental_rpcInvalidations).toEqual([
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
    const { createFakePluginHost: host } = await import(
      "@get-bb/plugin-sdk/testing"
    );
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
