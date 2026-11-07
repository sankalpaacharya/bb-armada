import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it, vi } from "vitest";

import plugin from "../server";
import { LEGACY_CAPTAINS_KEY, type CaptainRecord } from "../lib/captains";
import type { ParkRecord } from "../lib/lifecycle";

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

const adopt = (threadId: string, logo = "flag", color = "rose") => ({
  threadId,
  logo,
  color,
});

describe("captain records", () => {
  it("starts empty", async () => {
    const { list } = await load();
    expect(await list()).toEqual([]);
  });

  it("spawns a captain thread in the project, records it and invalidates the captains read", async () => {
    const { harness, list } = await load();
    const record = (await harness.callRpc("captains_create", {
      projectId: "proj_a",
      projectName: "Alpha",
      logo: "rocket",
      color: "sky",
    })) as CaptainRecord;
    expect(record.threadId).toBe("thr_new");
    expect(await list()).toEqual([
      expect.objectContaining({ threadId: "thr_new", logo: "rocket" }),
    ]);
    expect(harness.experimental_rpcInvalidations).toEqual([["captains"]]);

    const [spawn] = harness.sdk.callsTo("threads.spawn");
    expect(spawn![0]).toMatchObject({
      projectId: "proj_a",
      environment: { type: "project-default" },
      title: "🧭 Captain · Alpha",
    });
    expect((spawn![0] as { prompt: string }).prompt).toContain(
      "~/.bb/captains/alpha.md",
    );
  });

  it("does not record a captain when the thread cannot be spawned", async () => {
    const { harness, list } = await load();
    harness.sdk.stub("threads.spawn", async () => {
      throw new Error("no host");
    });
    await expect(
      harness.callRpc("captains_create", {
        projectId: "p",
        projectName: "P",
        logo: "rocket",
        color: "sky",
      }),
    ).rejects.toThrow("no host");
    expect(await list()).toEqual([]);
  });

  it("still records the spawned thread when the first write fails", async () => {
    const { bb, harness, ids } = await load();
    const set = bb.storage.kv.set.bind(bb.storage.kv);
    vi.spyOn(bb.storage.kv, "set")
      .mockRejectedValueOnce(new Error("busy"))
      .mockImplementation(set);
    await harness.callRpc("captains_create", {
      projectId: "p",
      projectName: "P",
      logo: "rocket",
      color: "sky",
    });
    expect(await ids()).toEqual(["thr_new"]);
  });

  it("names the spawned thread when it cannot be recorded at all", async () => {
    const { bb, harness, list } = await load();
    vi.spyOn(bb.storage.kv, "set").mockRejectedValue(new Error("disk full"));
    await expect(
      harness.callRpc("captains_create", {
        projectId: "p",
        projectName: "P",
        logo: "rocket",
        color: "sky",
      }),
    ).rejects.toThrow(/thr_new.*disk full.*Make captain/);
    expect(await list()).toEqual([]);
  });

  it("adopts an existing thread and keeps its original date when adopted again", async () => {
    const { harness, list } = await load();
    await harness.callRpc("captains_adopt", adopt("thr_x"));
    const [first] = await list();
    await harness.callRpc("captains_adopt", adopt("thr_x", "crown", "violet"));
    expect(await list()).toEqual([
      { ...first, threadId: "thr_x", logo: "crown", color: "violet" },
    ]);
  });

  it("updates only the fields given and refuses a thread that is not a captain", async () => {
    const { harness, list } = await load();
    await harness.callRpc("captains_adopt", adopt("thr_x"));
    await harness.callRpc("captains_update", {
      threadId: "thr_x",
      color: "emerald",
    });
    expect(await list()).toEqual([
      expect.objectContaining({ logo: "flag", color: "emerald" }),
    ]);
    await expect(
      harness.callRpc("captains_update", { threadId: "nope", logo: "sun" }),
    ).rejects.toThrow("not a captain");
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
    await harness.callRpc("captains_update", { threadId: "thr_x", logo: "sun" });
    await harness.callRpc("captains_remove", { threadId: "thr_x" });
    expect(harness.experimental_rpcInvalidations).toEqual([
      ["captains"],
      ["captains"],
      ["captains"],
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

  it("rejects a logo that is not in the registry", async () => {
    const { harness } = await load();
    await expect(
      harness.callRpc("captains_adopt", adopt("thr_x", "not-a-logo")),
    ).rejects.toThrow();
  });

  it("keeps a captain whose logo was retired and skips a record it cannot read, with a log line", async () => {
    const { harness, list } = await load({
      seed: async (kv) => {
        await kv.set("captain:good", {
          threadId: "good",
          logo: "retired-logo",
          color: "rose",
          createdAt: "2026-01-01T00:00:00.000Z",
        });
        await kv.set("captain:bad", { threadId: "bad" });
      },
    });
    expect(await list()).toEqual([
      expect.objectContaining({ threadId: "good", logo: "compass" }),
    ]);
    expect(harness.logEntries).toContainEqual({
      level: "warn",
      message: expect.stringContaining("captain:bad"),
    });
  });
});

describe("parks", () => {
  const list = (harness: Awaited<ReturnType<typeof load>>["harness"]) =>
    harness.callRpc("parks_list", null) as Promise<ParkRecord[]>;

  it("settles, snoozes and unparks a thread, invalidating the parks read each time", async () => {
    const { harness } = await load();
    const settled = (await harness.callRpc("parks_settle", {
      threadId: "t",
    })) as ParkRecord;
    expect(settled).toMatchObject({ threadId: "t", kind: "settled" });
    expect(await list(harness)).toEqual([settled]);

    const until = Date.now() + 60_000;
    const snoozed = (await harness.callRpc("parks_snooze", {
      threadId: "t",
      until,
    })) as ParkRecord;
    expect(snoozed).toMatchObject({ threadId: "t", kind: "snoozed", until });
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

  it("refuses a snooze that would end in the past", async () => {
    const { harness } = await load();
    await expect(
      harness.callRpc("parks_snooze", { threadId: "t", until: Date.now() - 1 }),
    ).rejects.toThrow(/future/);
    expect(await list(harness)).toEqual([]);
  });

  it("skips a park it cannot read, with a log line", async () => {
    const { harness } = await load({
      seed: async (kv) => {
        await kv.set("park:good", { threadId: "good", kind: "settled", at: 5 });
        await kv.set("park:bad", { threadId: "bad", kind: "snoozed" });
      },
    });
    expect(await list(harness)).toEqual([
      { threadId: "good", kind: "settled", at: 5 },
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

  it("moves each record to its own key and deletes the old key", async () => {
    const { bb, list } = await load({
      seed: (kv) => kv.set(LEGACY_CAPTAINS_KEY, legacy),
    });
    expect(await list()).toEqual([legacy.captains.good]);
    expect(await bb.storage.kv.get(LEGACY_CAPTAINS_KEY)).toBeUndefined();
  });

  it("converges when a previous run stopped before deleting the old key", async () => {
    const { bb, list } = await load({
      seed: async (kv) => {
        await kv.set("captain:good", legacy.captains.good);
        await kv.set(LEGACY_CAPTAINS_KEY, legacy);
      },
    });
    expect(await list()).toEqual([legacy.captains.good]);
    expect(await bb.storage.kv.get(LEGACY_CAPTAINS_KEY)).toBeUndefined();
  });

  it("drops an unreadable registry rather than failing to load", async () => {
    const { bb, list } = await load({
      seed: (kv) => kv.set(LEGACY_CAPTAINS_KEY, "garbage"),
    });
    expect(await list()).toEqual([]);
    expect(await bb.storage.kv.get(LEGACY_CAPTAINS_KEY)).toBeUndefined();
  });
});
