import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSharedPrCache,
  EMPTY_CACHE,
  FRESH_MS,
  LOCK_STALE_MS,
  QUERY,
  SEARCH,
  type Gh,
  type SharedCache,
} from "../lib/shared-pr-cache";

const NOW = 1_800_000_000_000;
const MINUTE = 60_000;
const DATA = { search: { issueCount: 1, nodes: [{ number: 1 }] } };

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "bb-prs-"));
});

const included = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  [
    `HTTP/2.0 ${status} OK`,
    ...Object.entries(headers).map(([key, value]) => `${key}: ${value}`),
    "",
    JSON.stringify(body),
  ].join("\r\n");

const ok: Gh = async () => included(200, { data: DATA });

/** gh exiting non-zero, as execFile rejects. */
const exit = (code: unknown, stdout = "", stderr = "") =>
  Object.assign(new Error(`gh failed: ${stderr}`), { code, stdout, stderr });

const cacheFile = () => path.join(dir, "open-prs.json");
const stored = async (): Promise<SharedCache> =>
  JSON.parse(await readFile(cacheFile(), "utf8")) as SharedCache;
const store = (cache: Partial<SharedCache> & Record<string, unknown>) =>
  writeFile(cacheFile(), JSON.stringify({ ...EMPTY_CACHE, ...cache }));

function shared(gh: Gh, at: () => number = () => NOW, pid = 101) {
  return createSharedPrCache({ dir, gh, now: at, pid });
}

describe("the shared pull request cache", () => {
  it("searches once with the shared query and writes format v1 atomically", async () => {
    const gh = vi.fn(ok);
    const cache = await shared(gh).refresh();
    expect(gh.mock.calls).toEqual([
      [["api", "graphql", "--include", "-f", `query=${QUERY}`, "-f", `q=${SEARCH}`]],
    ]);
    expect(cache).toEqual(await stored());
    expect(cache).toEqual({
      version: 1,
      search: "is:pr is:open author:@me archived:false sort:updated-desc",
      fetchedAt: NOW,
      nextAllowedAt: NOW + FRESH_MS,
      failures: 0,
      lastError: null,
      data: DATA,
    });
    expect(await readdir(dir)).toEqual(["open-prs.json"]);
  });

  it("never searches while the cache is fresh, whichever plugin wrote it", async () => {
    await store({ fetchedAt: NOW - FRESH_MS + 1, data: DATA });
    const gh = vi.fn(ok);
    expect((await shared(gh).refresh()).data).toEqual(DATA);
    expect(gh).not.toHaveBeenCalled();
    let now = NOW + 1;
    await shared(gh, () => now).refresh();
    expect(gh).toHaveBeenCalledTimes(1);
    now += FRESH_MS - 1;
    await shared(gh, () => now).refresh();
    expect(gh).toHaveBeenCalledTimes(1);
  });

  it("never searches before nextAllowedAt", async () => {
    await store({ fetchedAt: NOW - 3_600_000, nextAllowedAt: NOW + 1, data: DATA });
    const gh = vi.fn(ok);
    await shared(gh).refresh();
    expect(gh).not.toHaveBeenCalled();
    await shared(gh, () => NOW + 1).refresh();
    expect(gh).toHaveBeenCalledTimes(1);
  });

  it("serves the cache without searching while another process holds the lock", async () => {
    await store({ fetchedAt: NOW - 3_600_000, data: DATA });
    await writeFile(path.join(dir, "open-prs.lock"), JSON.stringify({ pid: 7, at: NOW - 1000 }));
    const gh = vi.fn(ok);
    expect((await shared(gh).refresh()).fetchedAt).toBe(NOW - 3_600_000);
    expect(gh).not.toHaveBeenCalled();
  });

  it("takes over a lock older than a minute", async () => {
    await writeFile(
      path.join(dir, "open-prs.lock"),
      JSON.stringify({ pid: 7, at: NOW - LOCK_STALE_MS - 1 }),
    );
    const gh = vi.fn(ok);
    expect((await shared(gh).refresh()).fetchedAt).toBe(NOW);
    expect(gh).toHaveBeenCalledTimes(1);
    expect(await readdir(dir)).toEqual(["open-prs.json"]);
  });

  it("runs one search when two plugins refresh at once", async () => {
    let finish = () => {};
    const gh = vi.fn<Gh>(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(included(200, { data: DATA }));
        }),
    );
    const first = shared(gh, () => NOW, 1).refresh();
    const second = shared(gh, () => NOW, 2).refresh();
    await vi.waitFor(() => expect(gh).toHaveBeenCalledTimes(1));
    finish();
    const results = await Promise.all([first, second]);
    expect(results.filter((cache) => cache.data !== null)).toHaveLength(1);
    expect((await shared(gh, () => NOW, 3).refresh()).data).toEqual(DATA);
    expect(gh).toHaveBeenCalledTimes(1);
  });

  it("treats a newer format as empty and never writes over it", async () => {
    const newer = JSON.stringify({ version: 2, whatever: true });
    await writeFile(cacheFile(), newer);
    const gh = vi.fn(ok);
    expect(await shared(gh).refresh()).toEqual(EMPTY_CACHE);
    expect(gh).not.toHaveBeenCalled();
    expect(await readFile(cacheFile(), "utf8")).toBe(newer);
  });
});

describe("backing off", () => {
  const stale = { fetchedAt: NOW - 3_600_000, data: DATA };

  it("waits for Retry-After on a 429, keeping the last data", async () => {
    await store(stale);
    const gh = vi.fn<Gh>(async () => {
      throw exit(1, included(429, { message: "slow down" }, { "Retry-After": "120" }));
    });
    const cache = await shared(gh).refresh();
    expect(cache).toMatchObject({
      nextAllowedAt: NOW + 120_000,
      failures: 1,
      data: DATA,
      fetchedAt: NOW - 3_600_000,
      lastError: { at: NOW, kind: "rate-limited" },
    });
    expect(gh).toHaveBeenCalledTimes(1);
  });

  it("waits for the exhausted limit's reset", async () => {
    await store(stale);
    const reset = NOW / 1000 + 900;
    const gh = vi.fn<Gh>(async () => {
      throw exit(
        1,
        included(403, { message: "API rate limit exceeded" }, {
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(reset),
        }),
      );
    });
    expect((await shared(gh).refresh()).nextAllowedAt).toBe(reset * 1000);
    expect(gh).toHaveBeenCalledTimes(1);
  });

  it("asks gh for the GraphQL reset once when GitHub's error gives no time", async () => {
    await store(stale);
    const reset = NOW / 1000 + 1200;
    const gh = vi.fn<Gh>(async (args) => {
      if (args[1] === "rate_limit")
        return JSON.stringify({ resources: { graphql: { remaining: 0, reset } } });
      throw exit(
        1,
        included(200, { errors: [{ type: "RATE_LIMITED", message: "API rate limit already exceeded" }] }),
        "gh: API rate limit already exceeded for user ID 1.",
      );
    });
    const cache = await shared(gh).refresh();
    expect(cache.nextAllowedAt).toBe(reset * 1000);
    expect(cache.lastError?.message).toBe("gh: API rate limit already exceeded for user ID 1.");
    expect(gh.mock.calls.map(([args]) => args[1])).toEqual(["graphql", "rate_limit"]);
  });

  it("doubles five minutes per failed rate limit, up to an hour, when nothing gives a time", async () => {
    const limited = vi.fn<Gh>(async (args) => {
      if (args[1] === "rate_limit") throw exit(1);
      throw exit(1, "", "API rate limit exceeded");
    });
    const waits = [];
    for (const failures of [0, 1, 2, 5]) {
      await store({ ...stale, failures });
      waits.push((await shared(limited).refresh()).nextAllowedAt - NOW);
    }
    expect(waits).toEqual([5 * MINUTE, 10 * MINUTE, 20 * MINUTE, 60 * MINUTE]);
  });

  it("doubles a minute per other failure, up to half an hour", async () => {
    const broken = vi.fn<Gh>(async () => {
      throw exit(1, included(502, { message: "Bad gateway" }), "HTTP 502");
    });
    const waits = [];
    for (const failures of [0, 1, 3, 9]) {
      await store({ ...stale, failures });
      const cache = await shared(broken).refresh();
      expect(cache).toMatchObject({ failures: failures + 1, data: DATA, lastError: { kind: "error" } });
      waits.push(cache.nextAllowedAt - NOW);
    }
    expect(waits).toEqual([MINUTE, 2 * MINUTE, 8 * MINUTE, 30 * MINUTE]);
  });

  it("waits five minutes without gh or its sign-in", async () => {
    await store(stale);
    const missing = await shared(async () => {
      throw exit("ENOENT");
    }).refresh();
    expect(missing).toMatchObject({ nextAllowedAt: NOW + 5 * MINUTE, lastError: { kind: "no-gh" } });
    await store(stale);
    const signedOut = await shared(async () => {
      throw exit(4, "", "To get started with GitHub CLI, please run:  gh auth login");
    }).refresh();
    expect(signedOut.lastError?.kind).toBe("signed-out");
  });

  it("clears the failures after a good read", async () => {
    await store({
      ...stale,
      failures: 3,
      lastError: { at: NOW - MINUTE, kind: "error", message: "HTTP 502" },
    });
    expect(await shared(ok).refresh()).toMatchObject({
      failures: 0,
      lastError: null,
      fetchedAt: NOW,
    });
  });
});
