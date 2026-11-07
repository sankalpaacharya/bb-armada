import { useEffect, useMemo, useState } from "react";
import {
  experimental_useSidebarThreads,
  useBbNavigate,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";

import { useArrowKeyRows } from "@/hooks/use-arrow-key-rows";
import { useCaptains } from "@/hooks/use-captains";
import { useParkActions, usePruneParks } from "@/hooks/use-park-actions";
import { useParks } from "@/hooks/use-parks";
import { useStoredState } from "@/hooks/use-stored-state";
import { useWakeTime } from "@/lib/clock";
import { wakesOf } from "@/lib/lifecycle";
import { buildArmada } from "@/lib/model";
import {
  parseScope,
  pickableProjects,
  resolveScope,
  scopeThreads,
} from "@/lib/scope";
import { parseBooleanMap, removeStored } from "@/lib/storage";
import type { CaptainRecord } from "@/lib/captains";
import { CaptainDialog, type CaptainDialogState } from "./captain-dialog";
import { CaptainsSection } from "./captains-section";
import { ShelfSection } from "./shelf-section";
import type { OpenThread } from "./thread-link";
import { ThreadsSection } from "./threads-section";

const SCOPE_KEY = "armada/thread-scope";
const SHELVES_KEY = "armada/shelves";
/** The registry cache from before captains were read through RPC, and the deck's old worker toggles. */
const RETIRED_KEYS = ["armada/captains", "armada/captain-toggles"];
const NO_CAPTAINS: readonly CaptainRecord[] = [];

export function ArmadaList({
  activeThreadId,
  activeProjectId,
  onNavigate,
}: PluginThreadListProps) {
  const { status, threads, projects } = experimental_useSidebarThreads();
  const captains = useCaptains();
  const parks = useParks();
  const parkActions = useParkActions();
  const navigate = useBbNavigate();
  const [dialog, setDialog] = useState<CaptainDialogState | null>(null);
  const [storedScope, setScope] = useStoredState(SCOPE_KEY, parseScope, null);
  const [shelves, setShelves] = useStoredState(SHELVES_KEY, parseBooleanMap, {});
  const rows = useArrowKeyRows();

  const records = captains.status === "ready" ? captains.records : NO_CAPTAINS;
  const wakeTime = useWakeTime(wakesOf(parks));
  const model = useMemo(
    () => buildArmada(threads, projects, records, parks, wakeTime),
    [threads, projects, records, parks, wakeTime],
  );
  usePruneParks(model.expiredParks);
  useEffect(() => RETIRED_KEYS.forEach(removeStored), []);
  const pickable = useMemo(() => pickableProjects(projects), [projects]);
  const scope = resolveScope(storedScope, pickable);
  const scoped = useMemo(() => scopeThreads(model.threads, scope), [model, scope]);
  const snoozed = scopeThreads(model.snoozed, scope);
  const settled = scopeThreads(model.settled, scope);

  const open: OpenThread = (threadId, split) => {
    navigate.toThread(threadId, { split });
    onNavigate();
  };

  const shelf = (name: "snoozed" | "settled") => ({
    expanded: shelves[name] ?? false,
    onToggle: () => setShelves({ ...shelves, [name]: !(shelves[name] ?? false) }),
    activeThreadId,
    actions: parkActions,
    onOpen: open,
  });

  return (
    <div
      ref={rows.ref}
      onKeyDown={rows.onKeyDown}
      className="flex min-h-full shrink-0 flex-col px-1.5 pb-2"
    >
      <CaptainsSection
        status={captains.status}
        captains={model.captains}
        activeThreadId={activeThreadId}
        onOpen={open}
        onDialog={setDialog}
      />
      <ThreadsSection
        entries={model.threads}
        scoped={scoped}
        parkedCount={snoozed.length + settled.length}
        projects={pickable}
        scope={scope}
        onScope={setScope}
        status={captains.status === "loading" ? "loading-captains" : status}
        activeThreadId={activeThreadId}
        parkActions={parkActions}
        onOpen={open}
        onAdopt={(thread) => setDialog({ kind: "adopt", thread })}
      />
      <ShelfSection title="Snoozed" entries={snoozed} {...shelf("snoozed")} />
      <ShelfSection title="Settled" entries={settled} {...shelf("settled")} />
      {dialog === null ? null : (
        <CaptainDialog
          state={dialog}
          projects={pickable}
          activeProjectId={activeProjectId}
          onClose={() => setDialog(null)}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
}
