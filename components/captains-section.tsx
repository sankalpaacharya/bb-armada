import {
  experimental_useRpcMutation,
  type PluginSidebarProject,
} from "@get-bb/plugin-sdk/app";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";

import { Icon } from "@/components/ui/icon";
import type { CaptainsRead } from "@/hooks/use-captains";
import { useStoredState } from "@/hooks/use-stored-state";
import {
  ALL_CAPTAINS,
  filterCaptains,
  parseCaptainFilter,
} from "@/lib/captain-filter";
import { useRunStarts } from "@/hooks/use-run-starts";
import type { CaptainEntry, ThreadEntry } from "@/lib/model";
import { parseBooleanMap } from "@/lib/storage";
import { moveCaptain } from "@/lib/captain-order";
import { rpcContract } from "@/lib/rpc";
import { FOCUS_RING, HEADER_ACTION } from "@/lib/styles";
import { toastFailure } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { CaptainDialogState } from "./captain-dialog";
import { CaptainRow } from "./captain-row";
import { CaptainWorkers } from "./captain-workers";
import { CaptainFilters } from "./captain-filters";
import { captainItems } from "./menu-items";
import { Note, SectionHeader } from "./section";
import type { OpenThread } from "./thread-link";

const isActiveWorker = (entry: ThreadEntry) =>
  entry.captain !== null &&
  (entry.status === "working" || entry.status === "needs-you");

/** Every captain, one row each, with its active workers folded under it. */
export function CaptainsSection({
  status,
  captains: allCaptains,
  threads,
  projects,
  activeThreadId,
  onOpen,
  onDialog,
}: {
  status: CaptainsRead["status"];
  captains: readonly CaptainEntry[];
  /** Every active thread, of which a captain's working and waiting workers nest under it. */
  threads: readonly ThreadEntry[];
  projects: readonly PluginSidebarProject[];
  activeThreadId: string | null;
  onOpen: OpenThread;
  onDialog: (state: CaptainDialogState) => void;
}) {
  const [storedFilter, setFilter] = useStoredState(
    "armada/captain-filter",
    parseCaptainFilter,
    ALL_CAPTAINS,
  );
  const filter =
    storedFilter.kind === "project" && !allCaptains.some(
      (entry) => entry.thread.projectId === storedFilter.projectId,
    ) ? ALL_CAPTAINS : storedFilter;
  const captains = filterCaptains(allCaptains, filter);
  const activeWorkers = useMemo(() => threads.filter(isActiveWorker), [threads]);
  const runStarts = useRunStarts(activeWorkers);
  const workersOf = useMemo(() => {
    const byCaptain = new Map<string, ThreadEntry[]>();
    for (const entry of activeWorkers) {
      const id = entry.captain!.threadId;
      byCaptain.set(id, [...(byCaptain.get(id) ?? []), entry]);
    }
    return byCaptain;
  }, [activeWorkers]);
  const [folds, setFolds] = useStoredState(
    "armada/captain-workers",
    parseBooleanMap,
    {},
  );
  const remove = experimental_useRpcMutation({
    contract: rpcContract,
    method: "captains_remove",
    optimistic: ({ threadId }, cache) => {
      cache.update("captains_list", null, (current) =>
        current.filter((record) => record.threadId !== threadId),
      );
      cache.update("parks_list", null, (current) =>
        current.filter((park) => park.threadId !== threadId),
      );
    },
  });
  const reorder = experimental_useRpcMutation({
    contract: rpcContract,
    method: "captains_reorder",
    optimistic: ({ threadId, beforeThreadId }, cache) => {
      cache.update("captains_list", null, (current) =>
        moveCaptain(current, threadId, beforeThreadId),
      );
    },
  });
  const [drag, setDrag] = useState<{
    threadId: string;
    over: { threadId: string; after: boolean } | null;
  } | null>(null);
  const keyboardHandle = useRef<HTMLButtonElement | null>(null);
  useLayoutEffect(() => {
    const handle = keyboardHandle.current;
    if (handle === null) return;
    if (
      document.activeElement === document.body ||
      document.activeElement === handle
    )
      handle.focus();
    if (!reorder.isPending || document.activeElement !== handle)
      keyboardHandle.current = null;
  }, [captains, reorder.isPending]);

  const move = (threadId: string, beforeThreadId: string | null) => {
    const index = captains.findIndex((entry) => entry.thread.id === threadId);
    if (
      reorder.isPending ||
      index < 0 ||
      threadId === beforeThreadId ||
      (captains[index + 1]?.thread.id ?? null) === beforeThreadId
    )
      return;
    void reorder
      .mutate({ threadId, beforeThreadId })
      .catch((cause: unknown) =>
        toastFailure("Could not save captain order", cause),
      );
  };

  const isAfter = (event: DragEvent<HTMLLIElement>) => {
    const row = event.currentTarget.firstElementChild ?? event.currentTarget;
    const rect = row.getBoundingClientRect();
    return event.clientY >= rect.top + rect.height / 2;
  };

  return (
    <section className="flex min-w-0 flex-col gap-1">
      <CaptainFilters
        captains={allCaptains}
        projects={projects}
        value={filter}
        onChange={(next) => {
          keyboardHandle.current = null;
          setDrag(null);
          setFilter(next);
        }}
      />
      <SectionHeader
        title="Captains"
        count={status === "ready" ? captains.length : undefined}
        actions={
          <button
            type="button"
            aria-label="New captain"
            title="New captain"
            className={HEADER_ACTION}
            onClick={() => onDialog({ kind: "create" })}
          >
            <Icon name="Plus" className="size-4" />
          </button>
        }
      />
      <div>
        {status === "loading" ? (
          <Note>Loading captains…</Note>
        ) : status === "error" ? (
          <Note>Could not load captains</Note>
        ) : captains.length === 0 ? (
          <Note>
            {allCaptains.length === 0
              ? "Start a captain to run a project from one chat."
              : "No captains in this project."}
          </Note>
        ) : (
          <ul aria-label="Captains" className="m-0 flex flex-col gap-px p-0">
            {captains.map((entry, index) => {
              const workers = workersOf.get(entry.thread.id) ?? [];
              const open =
                folds[entry.thread.id] ??
                workers.some((worker) => worker.status === "working");
              return (
              <li
                key={entry.thread.id}
                className={cn(
                  "relative list-none",
                  drag?.threadId === entry.thread.id && "opacity-40",
                  drag?.over?.threadId === entry.thread.id &&
                    "after:pointer-events-none after:absolute after:inset-x-2 after:z-10 after:h-0.5 after:rounded after:bg-primary",
                  drag?.over?.threadId === entry.thread.id &&
                    (drag.over.after ? "after:bottom-0" : "after:top-0"),
                )}
                onDragOver={(event) => {
                  if (drag === null) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDrag({
                    threadId: drag.threadId,
                    over:
                      entry.thread.id === drag.threadId
                        ? null
                        : {
                            threadId: entry.thread.id,
                            after: isAfter(event),
                          },
                  });
                }}
                onDrop={(event) => {
                  if (drag === null) return;
                  event.preventDefault();
                  const beforeThreadId = isAfter(event)
                    ? (captains[index + 1]?.thread.id ?? null)
                    : entry.thread.id;
                  move(drag.threadId, beforeThreadId);
                  setDrag(null);
                }}
              >
                <CaptainRow
                  entry={entry}
                  active={entry.thread.id === activeThreadId}
                  inline={captainItems({
                    edit: () =>
                      onDialog({
                        kind: "edit",
                        thread: entry.thread,
                        record: entry.record,
                      }),
                    remove: () =>
                      remove
                        .mutate({ threadId: entry.thread.id })
                        .catch((cause: unknown) =>
                          toastFailure("Could not remove the captain", cause),
                        ),
                  })}
                  onOpen={onOpen}
                  fold={
                    workers.length === 0
                      ? null
                      : {
                          open,
                          onToggle: () =>
                            setFolds({ ...folds, [entry.thread.id]: !open }),
                        }
                  }
                  reorderHandle={
                    <button
                      type="button"
                      aria-label={`Reorder ${entry.thread.displayTitle}`}
                      title="Drag to reorder. Use Arrow Up or Arrow Down to move."
                      draggable={!reorder.isPending}
                      aria-disabled={reorder.isPending}
                      className={cn(
                      "pointer-events-auto relative flex size-5 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground opacity-40 hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing aria-disabled:cursor-default",
                        FOCUS_RING,
                      )}
                      onDragStart={(event) => {
                        if (reorder.isPending) {
                          event.preventDefault();
                          return;
                        }
                        keyboardHandle.current = null;
                        event.stopPropagation();
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData(
                          "text/plain",
                          entry.thread.id,
                        );
                        setDrag({ threadId: entry.thread.id, over: null });
                      }}
                      onDragEnd={() => setDrag(null)}
                      onKeyDown={(event) => {
                        if (
                          event.key !== "ArrowUp" &&
                          event.key !== "ArrowDown"
                        )
                          return;
                        event.preventDefault();
                        event.stopPropagation();
                        if (reorder.isPending) return;
                        if (event.key === "ArrowUp" && index > 0) {
                          keyboardHandle.current = event.currentTarget;
                          move(
                            entry.thread.id,
                            captains[index - 1]?.thread.id ?? null,
                          );
                        }
                        if (
                          event.key === "ArrowDown" &&
                          index < captains.length - 1
                        ) {
                          keyboardHandle.current = event.currentTarget;
                          move(
                            entry.thread.id,
                            captains[index + 2]?.thread.id ?? null,
                          );
                        }
                      }}
                    >
                    <Icon name="DragDropVertical" className="size-3.5" />
                    </button>
                  }
                />
                {workers.length === 0 ? null : (
                  <CaptainWorkers
                    workers={workers}
                    open={open}
                    runStarts={runStarts}
                    activeThreadId={activeThreadId}
                    onOpen={onOpen}
                  />
                )}
              </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
