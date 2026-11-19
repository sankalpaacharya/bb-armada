import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAutoCompact, decideAutoCompact } from "../lib/auto-compact";
import plugin from "../server";
import { parseAutoCompact, withAutoCompactProject } from "../lib/settings";

const thresholds = { coordinatorK: 200, workerK: 300 };
const off = { coordinatorK: 0, workerK: 0 };

describe("decideAutoCompact", () => {
  it.each([
    ["coordinator", 199_999, false, thresholds, "skip"],
    ["worker", 299_999, true, thresholds, "skip"],
    ["coordinator", 200_000, false, thresholds, "checkpoint"],
    ["coordinator", 900_000, true, off, "skip"],
  ] as const)(
    "a %s at %d tokens, with a checkpoint pending %s and thresholds %j, does %s",
    (role, usedTokens, checkpointPending, thresholds, action) => {
      expect(
        decideAutoCompact({ role, usedTokens, checkpointPending, thresholds }),
      ).toBe(action);
    },
  );
});

describe("auto-compact settings", () => {
  it.each([
    [
      "proj_a, proj_b\nproj_c\n",
      "proj_d",
      true,
      "proj_a\nproj_b\nproj_c\nproj_d",
    ],
    ["proj_a,proj_b", "proj_a", false, "proj_b"],
  ])(
    "turns the list %j, with %s set to %s, into %j",
    (stored, id, on, next) => {
      expect(
        withAutoCompactProject({ autoCompactProjects: stored }, id, on),
      ).toBe(next);
    },
  );
});

describe("the idle handler", () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir !== undefined) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  async function setup({
    usedTokens = 400_000 as number | null,
    ancestors = { thr_worker: ["thr_captain"] } as Record<string, string[]>,
  } = {}) {
    dir = await mkdtemp(path.join(os.tmpdir(), "auto-compact-"));
    const logFile = path.join(dir, "log", ".armada-compactions.jsonl");
    const used = { current: usedTokens };
    const sdk = {
      send: vi.fn(async (_args: unknown) => ({}) as never),
      compact: vi.fn(async () => ({ ok: true as const })),
      context: vi.fn(
        async () =>
          ({
            usage: used.current === null ? null : { usedTokens: used.current },
          }) as never,
      ),
      experimental_listAncestors: vi.fn(async ({ threadIds }) => ({
        threads: [
          {
            threadId: threadIds[0],
            ancestorIds: ancestors[threadIds[0]] ?? [],
          },
        ],
      })),
    };
    const { bb } = createFakePluginHost({
      pluginId: "armada",
      sdk: { threads: sdk },
    });
    const onIdle = createAutoCompact(bb, {
      readSettings: async () => ({
        projects: new Set(["proj_on"]),
        ...thresholds,
      }),
      isCaptain: async (id) => id === "thr_captain",
      readSupervisors: async () => new Set(["thr_crew"]),
      logFile,
    });
    const idle = (overrides: Partial<ReturnType<typeof makeThreadResponse>>) =>
      onIdle(
        makeThreadResponse({
          id: "thr_worker",
          providerId: "claude-code",
          projectId: "proj_on",
          ...overrides,
        }),
      );
    const sent = () =>
      sdk.send.mock.calls.map(
        ([args]) =>
          args as { threadId: string; mode: string; input: { text: string }[] },
      );
    return { sdk, idle, used, sent };
  }

  it("checkpoints a worker, then compacts it at its next idle", async () => {
    const { sdk, idle, sent } = await setup({
      ancestors: { thr_worker: ["thr_crew", "thr_captain"] },
    });
    await idle({});
    expect(sdk.compact).not.toHaveBeenCalled();
    const [checkpoint] = sent();
    expect(checkpoint).toMatchObject({
      threadId: "thr_worker",
      mode: "queue-if-active",
    });
    expect(checkpoint!.input[0]!.text).toMatch(
      /^\[armada\] Context checkpoint\. Your context is past 300K tokens\. .*state\.md/,
    );

    await idle({});
    expect(sdk.compact).toHaveBeenCalledWith({ threadId: "thr_worker" });
    expect(sent()).toHaveLength(1);
  });

  it("skips the idle right after a compaction, whose usage can still be the old size", async () => {
    const { sdk, idle, sent } = await setup({
      ancestors: { thr_worker: ["thr_crew"] },
    });
    await idle({});
    await idle({});
    await idle({});
    expect(sent()).toHaveLength(1);
    expect(sdk.compact).toHaveBeenCalledTimes(1);

    await idle({});
    expect(sent()).toHaveLength(2);
  });

  it("asks a captain to stow, and a crew captain too", async () => {
    for (const id of ["thr_captain", "thr_crew"]) {
      const { idle, sent } = await setup();
      await idle({ id });
      expect(sent()[0]!.input[0]!.text).toMatch(
        /past 200K tokens\. .*Run stow now/,
      );
    }
  });

  it.each([
    ["a project that is not switched on", { projectId: "proj_off" }, {}],
  ])("leaves %s alone", async (_name, overrides, options) => {
    const { sdk, idle } = await setup(options);
    await idle(overrides);
    expect(sdk.send).not.toHaveBeenCalled();
    expect(sdk.compact).not.toHaveBeenCalled();
  });
});
