import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";

import plugin from "../server";
import { REGISTRY_CHANNEL, REGISTRY_KEY } from "../lib/captains";

async function load() {
  const { bb, harness } = createFakePluginHost({
    pluginId: "armada",
    sdk: { threads: { spawn: async () => ({ id: "thr_new" }) as never } },
  });
  await plugin(bb);
  const list = () =>
    harness.callRpc("captains_list", null) as Promise<{
      captains: Record<
        string,
        { logo: string; color: string; createdAt: string }
      >;
    }>;
  return { bb, harness, list };
}

describe("captain registry", () => {
  it("starts empty", async () => {
    const { list } = await load();
    expect(await list()).toEqual({ version: 1, captains: {} });
  });

  it("spawns a captain thread in the project and records it", async () => {
    const { harness, list } = await load();
    const record = (await harness.callRpc("captains_create", {
      projectId: "proj_a",
      projectName: "Alpha",
      logo: "rocket",
      color: "sky",
    })) as { threadId: string };
    expect(record.threadId).toBe("thr_new");
    expect((await list()).captains["thr_new"]).toMatchObject({
      logo: "rocket",
      color: "sky",
    });

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
    const { bb, harness, list } = await load();
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
    expect((await list()).captains).toEqual({});
    expect(await bb.storage.kv.get(REGISTRY_KEY)).toBeUndefined();
  });

  it("adopts an existing thread and keeps its original date when adopted again", async () => {
    const { harness, list } = await load();
    await harness.callRpc("captains_adopt", {
      threadId: "thr_x",
      logo: "flag",
      color: "rose",
    });
    const first = (await list()).captains["thr_x"]!;
    await harness.callRpc("captains_adopt", {
      threadId: "thr_x",
      logo: "crown",
      color: "violet",
    });
    expect((await list()).captains["thr_x"]).toEqual({
      ...first,
      threadId: "thr_x",
      logo: "crown",
      color: "violet",
    });
  });

  it("updates only the fields given and refuses a thread that is not a captain", async () => {
    const { harness, list } = await load();
    await harness.callRpc("captains_adopt", {
      threadId: "thr_x",
      logo: "flag",
      color: "rose",
    });
    await harness.callRpc("captains_update", {
      threadId: "thr_x",
      color: "emerald",
    });
    expect((await list()).captains["thr_x"]).toMatchObject({
      logo: "flag",
      color: "emerald",
    });
    await expect(
      harness.callRpc("captains_update", { threadId: "nope", logo: "sun" }),
    ).rejects.toThrow("not a captain");
  });

  it("removes only the record", async () => {
    const { harness, list } = await load();
    await harness.callRpc("captains_adopt", {
      threadId: "thr_x",
      logo: "flag",
      color: "rose",
    });
    await harness.callRpc("captains_remove", { threadId: "thr_x" });
    await harness.callRpc("captains_remove", { threadId: "thr_x" });
    expect((await list()).captains).toEqual({});
    expect(harness.sdk.calls).toEqual([]);
  });

  it("publishes the registry after each write so open sidebars follow", async () => {
    const { harness } = await load();
    await harness.callRpc("captains_adopt", {
      threadId: "thr_x",
      logo: "flag",
      color: "rose",
    });
    await harness.callRpc("captains_remove", { threadId: "thr_x" });
    const signals = harness.realtimeSignals.filter(
      (signal) => signal.channel === REGISTRY_CHANNEL,
    );
    expect(
      signals.map((signal) =>
        Object.keys((signal.payload as { captains: object }).captains),
      ),
    ).toEqual([["thr_x"], []]);
  });

  it("keeps concurrent writes from overwriting each other", async () => {
    const { harness, list } = await load();
    await Promise.all(
      ["a", "b", "c", "d"].map((threadId) =>
        harness.callRpc("captains_adopt", {
          threadId,
          logo: "flag",
          color: "rose",
        }),
      ),
    );
    expect(Object.keys((await list()).captains).sort()).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("rejects a logo that is not in the registry", async () => {
    const { harness } = await load();
    await expect(
      harness.callRpc("captains_adopt", {
        threadId: "thr_x",
        logo: "not-a-logo",
        color: "rose",
      }),
    ).rejects.toThrow();
  });

  it("keeps a captain whose logo was retired and drops records that cannot be read", async () => {
    const { bb, list } = await load();
    await bb.storage.kv.set(REGISTRY_KEY, {
      version: 1,
      captains: {
        good: {
          threadId: "good",
          logo: "flag",
          color: "rose",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        bad: {
          threadId: "bad",
          logo: "retired-logo",
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
    });
    const { captains } = await list();
    expect(Object.keys(captains).sort()).toEqual(["bad", "good"]);
    expect(captains["bad"]).toMatchObject({ logo: "compass", color: "rose" });
  });
});
