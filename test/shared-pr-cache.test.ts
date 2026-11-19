import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSharedPrCache,
  EMPTY_CACHE,
  FRESH_MS,
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
const store = (cache: Partial<SharedCache>) =>
  writeFile(cacheFile(), JSON.stringify({ ...EMPTY_CACHE, ...cache }));

function shared(gh: Gh, at: () => number = () => NOW, pid = 101) {
  return createSharedPrCache({ dir, gh, now: at, pid });
}

const stale = { fetchedAt: NOW - 3_600_000, data: DATA };

describe("the shared pull request cache", () => {
  it("searches once, clears past failures, writes format v1, and never searches again while fresh", async () => {
    await store({
      ...stale,
      failures: 3,
      lastError: { at: NOW - MINUTE, kind: "error", message: "HTTP 502" },
    });
    const gh = vi.fn(ok);
    const cache = await shared(gh).refresh();
    expect(gh.mock.calls).toEqual([
      [
        [
          "api",
          "graphql",
          "--include",
          "-f",
          `query=${QUERY}`,
          "-f",
          `q=${SEARCH}`,
        ],
      ],
    ]);
    expect(cache).toEqual({
      version: 1,
      search: "is:pr is:open author:@me archived:false sort:updated-desc",
      fetchedAt: NOW,
      nextAllowedAt: NOW + FRESH_MS,
      failures: 0,
      lastError: null,
      data: DATA,
    });
    expect(JSON.parse(await readFile(cacheFile(), "utf8"))).toEqual(cache);
    expect(await readdir(dir)).toEqual(["open-prs.json"]);
    await shared(gh, () => NOW + FRESH_MS - 1, 202).refresh();
    expect(gh).toHaveBeenCalledTimes(1);
    await shared(gh, () => NOW + FRESH_MS, 202).refresh();
    expect(gh).toHaveBeenCalledTimes(2);
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
    await Promise.all([first, second]);
    expect((await shared(gh, () => NOW, 3).refresh()).data).toEqual(DATA);
    expect(gh).toHaveBeenCalledTimes(1);
  });
});

describe("backing off", () => {
  const failing =
    (stdout: string, stderr = ""): Gh =>
    async () => {
      throw exit(1, stdout, stderr);
    };
  const noTime: Gh = async () => {
    throw exit(1, "", "API rate limit exceeded");
  };
  const badGateway = failing(
    included(502, { message: "Bad gateway" }),
    "HTTP 502",
  );

  it.each<[string, Gh, number, string, number]>([
    [
      "Retry-After on a 429",
      failing(
        included(429, { message: "slow down" }, { "Retry-After": "120" }),
      ),
      0,
      "rate-limited",
      2 * MINUTE,
    ],
    [
      "five minutes after a first rate limit with no time",
      noTime,
      0,
      "rate-limited",
      5 * MINUTE,
    ],
    ["doubled after a second", noTime, 1, "rate-limited", 10 * MINUTE],
    ["at most an hour", noTime, 5, "rate-limited", 60 * MINUTE],
  ])(
    "waits for %s, keeping the last data",
    async (_, gh, failures, kind, wait) => {
      await store({ ...stale, failures });
      const search = vi.fn(gh);
      expect(await shared(search).refresh()).toMatchObject({
        nextAllowedAt: NOW + wait,
        failures: failures + 1,
        data: DATA,
        fetchedAt: stale.fetchedAt,
        lastError: { at: NOW, kind },
      });
      const calls = search.mock.calls.length;
      await shared(search, () => NOW + wait - 1).refresh();
      expect(search).toHaveBeenCalledTimes(calls);
    },
  );
});
