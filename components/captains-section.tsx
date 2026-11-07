import { useState } from "react";
import { experimental_useRpcMutation } from "@get-bb/plugin-sdk/app";

import { Icon } from "@/components/ui/icon";
import type { CaptainsRead } from "@/hooks/use-captains";
import type { ParkActions } from "@/hooks/use-park-actions";
import { useStoredState } from "@/hooks/use-stored-state";
import type { CaptainEntry } from "@/lib/model";
import { rpcContract } from "@/lib/rpc";
import { isLive } from "@/lib/status";
import { parseBooleanMap } from "@/lib/storage";
import {
  DECK_INDENT,
  DECK_PANEL,
  FOCUS_RING,
  HEADER_ACTION,
  ROW_HOVER,
} from "@/lib/styles";
import { toastFailure } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { CaptainDialogState } from "./captain-dialog";
import { CaptainRow } from "./captain-row";
import { captainItems } from "./menu-items";
import { Note, SectionHeader } from "./section";
import type { OpenThread } from "./thread-link";
import { WorkerCard } from "./worker-card";

const TOGGLES_KEY = "armada/captain-toggles";
const WORKER_PREVIEW = 5;

/** Keeps only toggles for captains that still exist, plus the one just set. */
function pruneToggles(
  toggles: Record<string, boolean>,
  captains: readonly CaptainEntry[],
  threadId: string,
  value: boolean,
): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const captain of captains) {
    const kept = toggles[captain.thread.id];
    if (kept !== undefined) next[captain.thread.id] = kept;
  }
  next[threadId] = value;
  return next;
}

/** The deck: every captain on one raised panel, with its active workers nested under it. */
export function CaptainsSection({
  status,
  captains,
  activeThreadId,
  parkActions,
  onOpen,
  onDialog,
}: {
  status: CaptainsRead["status"];
  captains: readonly CaptainEntry[];
  activeThreadId: string | null;
  parkActions: ParkActions;
  onOpen: OpenThread;
  onDialog: (state: CaptainDialogState) => void;
}) {
  const [toggles, setToggles] = useStoredState(TOGGLES_KEY, parseBooleanMap, {});
  const [showAll, setShowAll] = useState<ReadonlySet<string>>(() => new Set());
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

  return (
    <>
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
      <div className={DECK_PANEL}>
        {status === "loading" ? (
          <Note>Loading captains…</Note>
        ) : status === "error" ? (
          <Note>Could not load captains</Note>
        ) : captains.length === 0 ? (
          <Note>Start a captain to run a project from one chat.</Note>
        ) : (
          <ul aria-label="Captains" className="m-0 flex flex-col gap-px p-0">
            {captains.map((entry) => {
              const { thread, workers } = entry;
              const expanded =
                workers.length === 0
                  ? null
                  : (toggles[thread.id] ??
                    workers.some((worker) => isLive(worker.status)));
              const shown = showAll.has(thread.id)
                ? workers
                : workers.slice(0, WORKER_PREVIEW);
              const hidden = workers.length - shown.length;
              return (
                <CaptainRow
                  key={thread.id}
                  entry={entry}
                  active={thread.id === activeThreadId}
                  expanded={expanded}
                  onToggle={() =>
                    setToggles(
                      pruneToggles(toggles, captains, thread.id, !expanded),
                    )
                  }
                  inline={captainItems({
                    edit: () =>
                      onDialog({ kind: "edit", thread, record: entry.record }),
                    remove: () =>
                      remove
                        .mutate({ threadId: thread.id })
                        .catch((cause: unknown) =>
                          toastFailure("Could not remove the captain", cause),
                        ),
                  })}
                  onOpen={onOpen}
                >
                  {expanded ? (
                    <ul
                      aria-label={`Workers of ${thread.displayTitle}`}
                      className="m-0 flex flex-col gap-px p-0"
                    >
                      {shown.map((worker) => (
                        <WorkerCard
                          key={worker.thread.id}
                          entry={worker}
                          active={worker.thread.id === activeThreadId}
                          parkActions={parkActions}
                          onOpen={onOpen}
                        />
                      ))}
                      {hidden > 0 ? (
                        <li className="list-none">
                          <button
                            type="button"
                            onClick={() =>
                              setShowAll((current) =>
                                new Set(current).add(thread.id),
                              )
                            }
                            className={cn(
                              "flex h-7 w-full cursor-pointer items-center rounded-md pr-2.5 text-left text-2xs text-muted-foreground hover:text-foreground",
                              ROW_HOVER,
                              DECK_INDENT,
                              FOCUS_RING,
                            )}
                          >
                            {hidden} more
                          </button>
                        </li>
                      ) : null}
                    </ul>
                  ) : null}
                </CaptainRow>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
