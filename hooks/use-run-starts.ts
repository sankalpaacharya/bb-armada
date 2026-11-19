import { useEffect, useMemo, useRef, useState } from "react";
import { useSdk } from "@get-bb/plugin-sdk/app";

import type { ThreadEntry } from "@/lib/model";
import {
  hasTurnStarted,
  isRunning,
  runStartOf,
  type RunStart,
} from "@/lib/run-start";

/** A thread's latest turn start, read when the thread last changed (its `updatedAt`). */
type TurnRead = { stamp: number; at: number | null };

/**
 * When each running worker's run began, by thread id. The latest
 * `turn/started` event is read again only when the thread changes, which a
 * new turn always does, so a long run costs one read. A read that fails, or
 * finds no turn, leaves the thread's last change standing in.
 */
export function useRunStarts(
  entries: readonly ThreadEntry[],
): ReadonlyMap<string, RunStart> {
  const sdk = useSdk();
  const [reads, setReads] = useState<ReadonlyMap<string, TurnRead>>(
    () => new Map(),
  );
  const latest = useRef(reads);
  latest.current = reads;
  const running = useMemo(
    () => entries.filter(isRunning).map((entry) => entry.thread),
    [entries],
  );
  const wanted = running
    .filter(hasTurnStarted)
    .map((thread) => `${thread.id}@${thread.updatedAt}`)
    .join(",");

  useEffect(() => {
    const stamps = new Map(
      (wanted === "" ? [] : wanted.split(",")).map((key) => {
        const [id, stamp] = key.split("@") as [string, string];
        return [id, Number(stamp)];
      }),
    );
    /** A run that ended takes its read with it, so the next run reads afresh. */
    if ([...latest.current.keys()].some((id) => !stamps.has(id)))
      setReads(
        (current) =>
          new Map([...current].filter(([id]) => stamps.has(id))),
      );
    const controller = new AbortController();
    const store = (id: string, read: TurnRead) =>
      setReads((current) => new Map(current).set(id, read));
    for (const [id, stamp] of stamps) {
      if (latest.current.get(id)?.stamp === stamp) continue;
      sdk.threads.events
        .list({
          threadId: id,
          types: ["turn/started"],
          order: "desc",
          limit: "1",
          signal: controller.signal,
        })
        .then(
          (rows) => store(id, { stamp, at: rows[0]?.createdAt ?? null }),
          () => {
            if (!controller.signal.aborted) store(id, { stamp, at: null });
          },
        );
    }
    return () => controller.abort();
  }, [sdk, wanted]);

  return useMemo(
    () =>
      new Map(
        running.map((thread) => [
          thread.id,
          runStartOf(thread, reads.get(thread.id)?.at ?? null),
        ]),
      ),
    [running, reads],
  );
}
