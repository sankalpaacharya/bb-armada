import { randomBytes } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

/**
 * The user's open pull requests, read once for every bb plugin that shows
 * them. Format v1 is owned by beautiful-bb's PRs card; both plugins send the
 * same search, share one file, take one lock, and back off together, so the
 * user's GitHub limits see one search every five minutes at most.
 */
export const CACHE_VERSION = 1;

export const SEARCH = "is:pr is:open author:@me archived:false sort:updated-desc";

/** Read-only, and exactly the card's selection: both plugins derive their views from it. */
export const QUERY = `query($q: String!) {
  rateLimit { cost remaining resetAt }
  search(query: $q, type: ISSUE, first: 100) {
    issueCount
    nodes { ... on PullRequest {
      number title url isDraft createdAt updatedAt additions deletions headRefName baseRefName
      author { login }
      repository { name nameWithOwner owner { login avatarUrl(size: 32) } }
      labels(first: 20) { nodes { name } }
      reviewDecision mergeable
      commits(last: 1) { nodes { commit { statusCheckRollup { state contexts(first: 1) {
        checkRunCountsByState { state count } statusContextCountsByState { state count } } } } } }
    } }
  }
}`;

export const CACHE_DIR = path.join(os.homedir(), ".cache", "bb-prs");

export const FRESH_MS = 5 * 60_000;
const LOCK_STALE_MS = 60_000;
const MINUTE = 60_000;

const errorKinds = ["rate-limited", "no-gh", "signed-out", "error"] as const;

const cacheSchema = z.object({
  version: z.number().int(),
  search: z.string(),
  fetchedAt: z.number().nullable(),
  nextAllowedAt: z.number(),
  failures: z.number().int().nonnegative(),
  lastError: z
    .object({
      at: z.number(),
      kind: z.enum(errorKinds),
      message: z.string(),
    })
    .nullable(),
  data: z.unknown().nullable(),
});

export type SharedCache = z.infer<typeof cacheSchema>;

export const EMPTY_CACHE: SharedCache = {
  version: CACHE_VERSION,
  search: SEARCH,
  fetchedAt: null,
  nextAllowedAt: 0,
  failures: 0,
  lastError: null,
  data: null,
};

/** Runs `gh` and resolves with its stdout; rejects with execFile's error, `stdout` and `stderr` on it. */
export type Gh = (args: readonly string[]) => Promise<string>;

export const isFresh = (cache: SharedCache, now: number): boolean =>
  cache.fetchedAt !== null && now - cache.fetchedAt < FRESH_MS;

const mayFetch = (cache: SharedCache, now: number): boolean =>
  !isFresh(cache, now) && now >= cache.nextAllowedAt;

type Response = {
  status: number | null;
  headers: Map<string, string>;
  body: { data?: unknown; errors?: { type?: string }[] } | null;
};

/** `gh api --include` output: the status line and headers, a blank line, then the body. */
export function parseIncluded(stdout: string): Response {
  const split = /\r?\n\r?\n/.exec(stdout);
  const head = split === null ? "" : stdout.slice(0, split.index);
  const rest = split === null ? stdout : stdout.slice(split.index + split[0].length);
  const [statusLine = "", ...lines] = head.split(/\r?\n/);
  const status = Number(/^HTTP\/\S+\s+(\d{3})/.exec(statusLine)?.[1] ?? NaN);
  const headers = new Map<string, string>();
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon > 0)
      headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
  }
  let body: Response["body"] = null;
  try {
    body = JSON.parse(rest) as Response["body"];
  } catch {
    body = null;
  }
  return { status: Number.isNaN(status) ? null : status, headers, body };
}

const isRateLimit = (response: Response, stderr: string): boolean =>
  response.status === 403 ||
  response.status === 429 ||
  (response.body?.errors ?? []).some(
    (error) => error.type === "RATE_LIMITED" || error.type === "RATE_LIMIT",
  ) ||
  /rate limit/i.test(stderr);

const shortLine = (text: string): string =>
  (text.split("\n").find((line) => line.trim() !== "") ?? "").trim().slice(0, 160);

const rateLimitSchema = z.object({
  resources: z.object({
    graphql: z.object({ remaining: z.number(), reset: z.number() }),
  }),
});

/**
 * When GitHub lets us search again after a rate limit: Retry-After, then the
 * exhausted limit's reset, then one free `gh api rate_limit` call, and only
 * then 5 minutes doubling per failure, up to an hour.
 */
async function rateLimitedUntil(
  response: Response,
  failures: number,
  gh: Gh,
  now: number,
): Promise<number> {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (retryAfter > 0) return now + retryAfter * 1000;
  const reset = Number(response.headers.get("x-ratelimit-reset"));
  if (response.headers.get("x-ratelimit-remaining") === "0" && reset > 0)
    return reset * 1000;
  try {
    const { graphql } = rateLimitSchema.parse(
      JSON.parse(await gh(["api", "rate_limit"])),
    ).resources;
    if (graphql.remaining === 0 && graphql.reset * 1000 > now)
      return graphql.reset * 1000;
  } catch {
    // The backoff below covers a failed check too.
  }
  return now + Math.min(5 * MINUTE * 2 ** failures, 60 * MINUTE);
}

/** The cache after one search: the new data, or the old data with when to try again. */
export async function fetchInto(
  cache: SharedCache,
  gh: Gh,
  now: number,
): Promise<SharedCache> {
  let stdout: string;
  let stderr = "";
  let code: unknown = 0;
  try {
    stdout = await gh([
      "api",
      "graphql",
      "--include",
      "-f",
      `query=${QUERY}`,
      "-f",
      `q=${SEARCH}`,
    ]);
  } catch (cause) {
    const error = cause as { code?: unknown; stdout?: unknown; stderr?: unknown };
    stdout = typeof error.stdout === "string" ? error.stdout : "";
    stderr = typeof error.stderr === "string" ? error.stderr : "";
    code = error.code ?? 1;
    if (stderr === "" && cause instanceof Error) stderr = cause.message;
  }
  const response = parseIncluded(stdout);
  const failed = (
    kind: (typeof errorKinds)[number],
    nextAllowedAt: number,
  ): SharedCache => ({
    ...cache,
    nextAllowedAt,
    failures: cache.failures + 1,
    lastError: { at: now, kind, message: shortLine(stderr) || kind },
  });
  if (code === "ENOENT") return failed("no-gh", now + 5 * MINUTE);
  if (code === 4 || /gh auth login/.test(stderr))
    return failed("signed-out", now + 5 * MINUTE);
  if (isRateLimit(response, stderr))
    return failed(
      "rate-limited",
      await rateLimitedUntil(response, cache.failures, gh, now),
    );
  const data = response.body?.data;
  if (code !== 0 || data === undefined || data === null || response.body?.errors)
    return failed(
      "error",
      now + Math.min(MINUTE * 2 ** cache.failures, 30 * MINUTE),
    );
  return {
    ...EMPTY_CACHE,
    fetchedAt: now,
    nextAllowedAt: now + FRESH_MS,
    data,
  };
}

type Read = { cache: SharedCache; writable: boolean };

/**
 * The shared cache on disk, refreshed at most once per five minutes across
 * every process. A newer format than this one is someone else's: it reads as
 * empty and is never written over.
 */
export function createSharedPrCache(
  options: { dir?: string; gh: Gh; now?: () => number; pid?: number },
) {
  const dir = options.dir ?? CACHE_DIR;
  const now = options.now ?? Date.now;
  const pid = options.pid ?? process.pid;
  const file = path.join(dir, "open-prs.json");
  const lock = path.join(dir, "open-prs.lock");
  let refreshing: Promise<SharedCache> | null = null;

  const read = async (): Promise<Read> => {
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch {
      return { cache: EMPTY_CACHE, writable: true };
    }
    try {
      const raw = JSON.parse(text) as { version?: unknown };
      if (typeof raw.version === "number" && raw.version > CACHE_VERSION)
        return { cache: EMPTY_CACHE, writable: false };
      return { cache: cacheSchema.parse(raw), writable: true };
    } catch {
      return { cache: EMPTY_CACHE, writable: true };
    }
  };

  const write = async (cache: SharedCache): Promise<void> => {
    const temp = `${file}.${pid}.${randomBytes(6).toString("hex")}.tmp`;
    await writeFile(temp, JSON.stringify(cache), { mode: 0o600 });
    await rename(temp, file);
  };

  /**
   * Older than a minute by the time inside it. A lock that can't be read yet
   * is being written by its taker, so its file's age decides instead.
   */
  const lockIsStale = async (): Promise<boolean> => {
    try {
      const at = Number(
        (JSON.parse(await readFile(lock, "utf8")) as { at?: unknown }).at,
      );
      if (at > 0) return now() - at > LOCK_STALE_MS;
    } catch {
      // Unwritten or unreadable: fall through to its file's age.
    }
    try {
      return Date.now() - (await stat(lock)).mtimeMs > LOCK_STALE_MS;
    } catch {
      return true;
    }
  };

  const takeLock = async (retry = true): Promise<boolean> => {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    try {
      const handle = await open(lock, "wx", 0o600);
      await handle.writeFile(JSON.stringify({ pid, at: now() }));
      await handle.close();
      return true;
    } catch {
      if (!retry) return false;
      if (!(await lockIsStale())) return false;
      await unlink(lock).catch(() => undefined);
      return takeLock(false);
    }
  };

  const refreshOnce = async (): Promise<SharedCache> => {
    const before = await read();
    if (!before.writable || !mayFetch(before.cache, now())) return before.cache;
    if (!(await takeLock())) return before.cache;
    try {
      const current = await read();
      if (!current.writable || !mayFetch(current.cache, now())) return current.cache;
      const next = await fetchInto(current.cache, options.gh, now());
      await write(next);
      return next;
    } finally {
      await unlink(lock).catch(() => undefined);
    }
  };

  return {
    /** The cache as it is on disk; never calls GitHub. */
    read: async (): Promise<SharedCache> => (await read()).cache,
    /** Searches when the cache is stale and nobody is backing off or searching; otherwise reads it. */
    refresh: (): Promise<SharedCache> => {
      refreshing ??= refreshOnce().finally(() => {
        refreshing = null;
      });
      return refreshing;
    },
  };
}
