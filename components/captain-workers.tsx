import type { ThreadEntry } from "@/lib/model";
import type { RunStart } from "@/lib/run-start";
import { cn } from "@/lib/utils";
import { WorkerTime } from "./age";
import { EASE_OUT } from "./disclosure";
import { StatusGlyph } from "./status-mark";
import { ThreadLink, type OpenThread } from "./thread-link";

/** A captain's active workers, one line each, folded under its row. */
export function CaptainWorkers({
  workers,
  open,
  runStarts,
  activeThreadId,
  onOpen,
}: {
  workers: readonly ThreadEntry[];
  open: boolean;
  runStarts: ReadonlyMap<string, RunStart>;
  activeThreadId: string | null;
  onOpen: OpenThread;
}) {
  return (
    <div
      inert={!open}
      aria-hidden={!open}
      className={cn(
        "grid transition-[grid-template-rows] motion-reduce:transition-none",
        EASE_OUT,
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
      )}
    >
      <ul className="m-0 flex min-h-0 flex-col gap-px overflow-hidden p-0">
        {workers.map((entry) => (
          <li key={entry.thread.id} className="list-none first:mt-px">
            <ThreadLink
              thread={entry.thread}
              active={entry.thread.id === activeThreadId}
              onOpen={onOpen}
              className="flex h-7 items-center gap-2 pr-4 pl-[46px]"
            >
              {({ title }) => (
                <span className="pointer-events-none relative flex min-w-0 flex-1 items-center gap-2">
                  {title}
                  {entry.status === null ? null : (
                    <span className="grid h-4 min-w-4 shrink-0 place-items-center">
                      <StatusGlyph status={entry.status} />
                    </span>
                  )}
                  <WorkerTime
                    entry={entry}
                    start={runStarts.get(entry.thread.id) ?? null}
                  />
                </span>
              )}
            </ThreadLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
