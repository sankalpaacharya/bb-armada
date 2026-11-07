import { useState } from "react";
import { experimental_useRpcMutation } from "@get-bb/plugin-sdk/app";

import { Icon } from "@/components/ui/icon";
import { useStoredState } from "@/hooks/use-stored-state";
import { withoutLeadingEmoji } from "@/lib/captain-text";
import type { CaptainEntry } from "@/lib/model";
import { rpcContract } from "@/lib/rpc";
import { isLive } from "@/lib/status";
import { parseBooleanMap } from "@/lib/storage";
import { FOCUS_RING, HEADER_ACTION } from "@/lib/styles";
import { toastFailure } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { CaptainDialogState } from "./captain-dialog";
import { captainItems } from "./captain-menu";
import { CaptainRow } from "./captain-row";
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

export function CaptainsSection({
  captains,
  activeThreadId,
  onOpen,
  onDialog,
}: {
  captains: readonly CaptainEntry[];
  activeThreadId: string | null;
  onOpen: OpenThread;
  onDialog: (state: CaptainDialogState) => void;
}) {
  const [toggles, setToggles] = useStoredState(TOGGLES_KEY, parseBooleanMap, {});
  const [showAll, setShowAll] = useState<ReadonlySet<string>>(() => new Set());
  const remove = experimental_useRpcMutation({
    contract: rpcContract,
    method: "captains_remove",
    optimistic: ({ threadId }, cache) =>
      cache.update("captains_list", null, (current) =>
        current.filter((record) => record.threadId !== threadId),
      ),
  });

  return (
    <>
      <SectionHeader
        title="Captains"
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
      {captains.length === 0 ? (
        <Note className="pl-9">
          Start a captain to run a project from one chat.
        </Note>
      ) : (
        <ul aria-label="Captains" className="m-0 flex flex-col gap-px p-0">
          {captains.map((entry) => {
            const { thread, record, workers } = entry;
            const title = withoutLeadingEmoji(thread.displayTitle);
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
                title={title}
                active={thread.id === activeThreadId}
                expanded={expanded}
                onToggle={() =>
                  setToggles(pruneToggles(toggles, captains, thread.id, !expanded))
                }
                inline={captainItems(record, {
                  changeLogo: () => onDialog({ kind: "edit", thread, record }),
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
                    aria-label={`Workers of ${title}`}
                    className="m-0 flex flex-col gap-px p-0"
                  >
                    {shown.map((worker) => (
                      <WorkerCard
                        key={worker.thread.id}
                        entry={worker}
                        active={worker.thread.id === activeThreadId}
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
                            "flex h-7 w-full cursor-pointer items-center rounded-md pr-2.5 pl-9 text-left text-2xs text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
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
    </>
  );
}
