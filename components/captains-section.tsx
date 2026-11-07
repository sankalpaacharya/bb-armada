import { experimental_useRpcMutation } from "@get-bb/plugin-sdk/app";

import { Icon } from "@/components/ui/icon";
import type { CaptainsRead } from "@/hooks/use-captains";
import type { CaptainEntry } from "@/lib/model";
import { rpcContract } from "@/lib/rpc";
import { DECK_PANEL, HEADER_ACTION } from "@/lib/styles";
import { toastFailure } from "@/lib/toast";
import type { CaptainDialogState } from "./captain-dialog";
import { CaptainRow } from "./captain-row";
import { captainItems } from "./menu-items";
import { Note, SectionHeader } from "./section";
import type { OpenThread } from "./thread-link";

/** The deck: every captain on one raised panel. Their workers are cards in Threads. */
export function CaptainsSection({
  status,
  captains,
  activeThreadId,
  onOpen,
  onDialog,
}: {
  status: CaptainsRead["status"];
  captains: readonly CaptainEntry[];
  activeThreadId: string | null;
  onOpen: OpenThread;
  onDialog: (state: CaptainDialogState) => void;
}) {
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
    <section className="flex flex-col gap-1">
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
          <ul aria-label="Captains" className="m-0 flex flex-col gap-0.5 p-1">
            {captains.map((entry) => (
              <CaptainRow
                key={entry.thread.id}
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
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
