import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createAutoCompact,
  decideAutoCompact,
  type CompactInput,
} from "../lib/auto-compact";
import plugin from "../server";
import { parseAutoCompact, withAutoCompactProject } from "../lib/settings";

const thresholds = { coordinatorK: 200, workerK: 300 };
const decide = (input: Partial<CompactInput>) =>
  decideAutoCompact({
    role: "coordinator",
    usedTokens: 0,
    thresholds,
    checkpointPending: false,
    ...input,
  });

describe("decideAutoCompact", () => {
  it.each([
    ["coordinator", 199_999],
    ["worker", 299_999],
  ] as const)("a %s under its threshold is skipped", (role, under) => {
    expect(decide({ role, usedTokens: under })).toBe("skip");
    expect(decide({ role, usedTokens: under, checkpointPending: true })).toBe(
      "skip",
    );
  });

  it.each([
    ["coordinator", 200_000],
    ["worker", 300_000],
  ] as const)(
    "a %s at its threshold checkpoints, then compacts",
    (role, at) => {
      expect(decide({ role, usedTokens: at })).toBe("checkpoint");
      expect(decide({ role, usedTokens: at, checkpointPending: true })).toBe(
        "compact",
      );
    },
  );

  it("uses the threshold of the role", () => {
    expect(decide({ role: "coordinator", usedTokens: 250_000 })).toBe(
      "checkpoint",
    );
    expect(decide({ role: "worker", usedTokens: 250_000 })).toBe("skip");
  });

  it("never acts on a role whose threshold is 0", () => {
    const off = { coordinatorK: 0, workerK: 0 };
    for (const role of ["coordinator", "worker"] as const)
      for (const checkpointPending of [false, true])
        expect(
          decide({
            role,
            usedTokens: 900_000,
            thresholds: off,
            checkpointPending,
          }),
        ).toBe("skip");
  });
});

describe("auto-compact settings", () => {
  it("defaults to GymSide at 200K and 300K", () => {
    expect(parseAutoCompact(undefined)).toEqual({
      projects: new Set(["proj_try5hy6jg4"]),
      coordinatorK: 200,
      workerK: 300,
    });
  });

  it("reads ids split by lines and commas, and keeps an empty list empty", () => {
    expect(
      parseAutoCompact({ autoCompactProjects: "proj_a, proj_b\nproj_c\n" })
        .projects,
    ).toEqual(new Set(["proj_a", "proj_b", "proj_c"]));
    expect(parseAutoCompact({ autoCompactProjects: "" }).projects.size).toBe(0);
  });

  it("adds and removes one project without duplicating or dropping others", () => {
    const values = { autoCompactProjects: "proj_a,proj_b" };
    expect(withAutoCompactProject(values, "proj_c", true)).toBe(
      "proj_a\nproj_b\nproj_c",
    );
    expect(withAutoCompactProject(values, "proj_a", true)).toBe(
      "proj_b\nproj_a",
    );
    expect(withAutoCompactProject(values, "proj_a", false)).toBe("proj_b");
  });
});

describe("the idle handler", () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir !== undefined) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  async function setup({
    usedTokens = 400_000,
    captains = ["thr_captain"],
    supervisors = ["thr_crew"],
    ancestors = {} as Record<string, string[]>,
    settings = {
      projects: new Set(["proj_on"]),
      coordinatorK: 200,
      workerK: 300,
    },
  } = {}) {
    dir = await mkdtemp(path.join(os.tmpdir(), "auto-compact-"));
    const logFile = path.join(dir, "log", ".armada-compactions.jsonl");
    const used = { current: usedTokens as number | null };
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
      readSettings: async () => settings,
      isCaptain: async (id) => captains.includes(id),
      readSupervisors: async () => new Set(supervisors),
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
    const log = async () =>
      (await readFile(logFile, "utf8").catch(() => ""))
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => JSON.parse(line));
    return { sdk, idle, used, log };
  }

  it("checkpoints a worker, then compacts it at its next idle and logs both", async () => {
    const { sdk, idle, log } = await setup({
      ancestors: { thr_worker: ["thr_crew", "thr_captain"] },
    });
    await idle({});
    expect(sdk.compact).not.toHaveBeenCalled();
    expect(sdk.send).toHaveBeenCalledTimes(1);
    const sent = sdk.send.mock.calls[0]![0] as {
      threadId: string;
      mode: string;
      input: { text: string }[];
    };
    expect(sent.threadId).toBe("thr_worker");
    expect(sent.mode).toBe("queue-if-active");
    expect(sent.input[0]!.text).toMatch(
      /^\[armada\] Context checkpoint\. Your context is past 300K tokens\. .*state\.md/,
    );

    await idle({});
    expect(sdk.compact).toHaveBeenCalledWith({ threadId: "thr_worker" });
    expect(sdk.send).toHaveBeenCalledTimes(1);

    const lines = await log();
    expect(lines.map((line) => line.step)).toEqual(["checkpoint", "compact"]);
    expect(lines[0]).toMatchObject({
      threadId: "thr_worker",
      projectId: "proj_on",
      role: "worker",
      usedTokens: 400_000,
    });
    expect(typeof lines[0].ms).toBe("number");
  });

  it("asks a captain to stow, and a crew captain too", async () => {
    for (const id of ["thr_captain", "thr_crew"]) {
      const { sdk, idle } = await setup();
      await idle({ id });
      const sent = sdk.send.mock.calls[0]![0] as {
        input: { text: string }[];
      };
      expect(sent.input[0]!.text).toMatch(/past 200K tokens\. .*Run stow now/);
    }
  });

  it("forgets a pending checkpoint once the thread is back under the threshold", async () => {
    const { sdk, idle, used } = await setup({
      ancestors: { thr_worker: ["thr_captain"] },
    });
    await idle({});
    used.current = 20_000;
    await idle({});
    used.current = 400_000;
    await idle({});
    expect(sdk.send).toHaveBeenCalledTimes(2);
    expect(sdk.compact).not.toHaveBeenCalled();
  });

  it.each([
    ["a Codex thread", { providerId: "codex" }],
    ["a project that is not switched on", { projectId: "proj_off" }],
    ["a thread with queued messages", { queuedMessageCount: 1 }],
    ["a thread with background agents", { activeBackgroundAgentCount: 1 }],
  ])("leaves %s alone", async (_name, overrides) => {
    const { sdk, idle } = await setup({
      ancestors: { thr_worker: ["thr_captain"] },
    });
    await idle(overrides);
    expect(sdk.context).not.toHaveBeenCalled();
    expect(sdk.send).not.toHaveBeenCalled();
  });

  it("leaves a thread with no captain above it alone", async () => {
    const { sdk, idle } = await setup({
      ancestors: { thr_worker: ["thr_someone_else"] },
    });
    await idle({});
    expect(sdk.context).not.toHaveBeenCalled();
    expect(sdk.send).not.toHaveBeenCalled();
  });

  it("leaves a thread without usage alone", async () => {
    const { sdk, idle, used } = await setup({
      ancestors: { thr_worker: ["thr_captain"] },
    });
    used.current = null;
    await idle({});
    expect(sdk.send).not.toHaveBeenCalled();
  });

  it("never throws when bb fails", async () => {
    const { sdk, idle } = await setup({
      ancestors: { thr_worker: ["thr_captain"] },
    });
    sdk.context.mockRejectedValueOnce(new Error("boom"));
    await expect(idle({})).resolves.toBeUndefined();
    sdk.send.mockRejectedValueOnce(new Error("boom"));
    await expect(idle({})).resolves.toBeUndefined();
  });

  it("handles one idle at a time per thread", async () => {
    const { sdk, idle } = await setup({
      ancestors: { thr_worker: ["thr_captain"] },
    });
    await Promise.all([idle({}), idle({})]);
    expect(sdk.send).toHaveBeenCalledTimes(1);
  });
});

describe("the plugin", () => {
  it("watches idle threads of the default project", async () => {
    const context = vi.fn(async (_args: unknown) => ({ usage: null }) as never);
    const { bb, harness } = createFakePluginHost({
      pluginId: "armada",
      sdk: {
        threads: { list: async () => [], context },
        files: { listPaths: async () => ({ paths: [], truncated: false }) },
      } as never,
    });
    await bb.storage.kv.set("captain:thr_captain", {
      threadId: "thr_captain",
      avatar: { style: "micah", seed: "a" },
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    await plugin(bb);
    const idle = (overrides: Parameters<typeof makeThreadResponse>[0]) =>
      harness.emitThreadEvent("thread.idle", {
        thread: makeThreadResponse({
          id: "thr_captain",
          providerId: "claude-code",
          ...overrides,
        }),
        lastAssistantText: null,
      });
    await idle({ projectId: "proj_other" });
    expect(context).not.toHaveBeenCalled();
    expect((await idle({ projectId: "proj_try5hy6jg4" })).errors).toEqual([]);
    expect(context).toHaveBeenCalledWith({ threadId: "thr_captain" });
  });
});
