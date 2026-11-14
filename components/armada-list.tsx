import { useEffect, useMemo, useState } from "react";
import {
  useBbNavigate,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";

import { useArrowKeyRows } from "@/hooks/use-arrow-key-rows";
import { useArmadaModel } from "@/hooks/use-armada-model";
import { useCrewActions } from "@/hooks/use-crew-actions";
import {
  useAutoSettleOnMount,
  useParkActions,
  usePruneParks,
} from "@/hooks/use-park-actions";
import { useStoredState } from "@/hooks/use-stored-state";
import {
  ALL_PROJECTS,
  parseScope,
  pickableProjects,
  resolveScope,
  scopeThreads,
} from "@/lib/scope";
import type { ThreadEntry } from "@/lib/model";
import { parseBooleanMap, removeStored } from "@/lib/storage";
import { CaptainDialog, type CaptainDialogState } from "./captain-dialog";
import { CaptainsSection } from "./captains-section";
import { ShelfSection } from "./shelf-section";
import type { OpenThread } from "./thread-link";
import { ThreadsSection } from "./threads-section";

const SCOPE_KEY = "armada/thread-scope";
const SHELVES_KEY = "armada/shelves";
/** The registry cache from before captains were read through RPC, and the deck's old worker toggles. */
const RETIRED_KEYS = ["armada/captains", "armada/captain-toggles"];

/** A captain's threads live in its Crew tab, not in the sidebar list. */
const noCaptain = (entry: ThreadEntry): boolean => entry.captain === null;

export function ArmadaList({
  activeThreadId,
  activeProjectId,
  onNavigate,
}: PluginThreadListProps) {
  const { status, projects, captains, model } = useArmadaModel();
  const parkActions = useParkActions();
  const crewActions = useCrewActions();
  const navigate = useBbNavigate();
  const [dialog, setDialog] = useState<CaptainDialogState | null>(null);
  const [storedScope, setScope] = useStoredState(SCOPE_KEY, parseScope, ALL_PROJECTS);
  const [shelves, setShelves] = useStoredState(
    SHELVES_KEY,
    parseBooleanMap,
    {},
  );
  const rows = useArrowKeyRows();

  usePruneParks(model.expiredParks);
  useAutoSettleOnMount();
  useEffect(() => RETIRED_KEYS.forEach(removeStored), []);
  const pickable = useMemo(() => pickableProjects(projects), [projects]);
  const captainCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { thread } of model.captains)
      counts.set(thread.projectId, (counts.get(thread.projectId) ?? 0) + 1);
    return counts;
  }, [model.captains]);
  const scope = resolveScope(storedScope, pickable);
  const loose = useMemo(
    () => ({
      threads: model.threads.filter(noCaptain),
      inactive: model.inactive.filter(noCaptain),
      snoozed: model.snoozed.filter(noCaptain),
      settled: model.settled.filter(noCaptain),
    }),
    [model],
  );
  const scoped = useMemo(
    () => scopeThreads(loose.threads, scope),
    [loose, scope],
  );
  const inactive = scopeThreads(loose.inactive, scope);
  const snoozed = scopeThreads(loose.snoozed, scope);
  const settled = scopeThreads(loose.settled, scope);

  const openThread: OpenThread = (threadId, split) => {
    navigate.toThread(threadId, { split });
    onNavigate();
  };

  const shelf = (name: "inactive" | "snoozed" | "settled") => {
    const open = shelves[name] ?? name !== "settled";
    return {
      open,
      onToggleOpen: () => setShelves({ ...shelves, [name]: !open }),
      activeThreadId,
      actions: parkActions,
      onOpen: openThread,
    };
  };

  return (
    <div
      ref={rows.ref}
      onKeyDown={rows.onKeyDown}
      className="flex min-h-full shrink-0 flex-col gap-6 px-1.5 pb-2"
    >
      <CaptainsSection
        status={captains.status}
        captains={model.captains}
        activeThreadId={activeThreadId}
        onOpen={openThread}
        onDialog={setDialog}
      />
      <div className="flex flex-col">
        <ThreadsSection
          entries={loose.threads}
          scoped={scoped}
          shelvedCount={inactive.length + snoozed.length + settled.length}
          projects={pickable}
          scope={scope}
          onScope={setScope}
          status={captains.status === "loading" ? "loading-captains" : status}
          activeThreadId={activeThreadId}
          parkActions={parkActions}
          captains={model.captains}
          crewActions={crewActions}
          onOpen={openThread}
          onAdopt={(thread) => setDialog({ kind: "adopt", thread })}
        />
        <ShelfSection
          title="Inactive"
          entries={inactive}
          {...shelf("inactive")}
        />
        <ShelfSection title="Snoozed" entries={snoozed} {...shelf("snoozed")} />
        <ShelfSection title="Settled" entries={settled} {...shelf("settled")} />
      </div>
      {dialog === null ? null : (
        <CaptainDialog
          state={dialog}
          projects={pickable}
          activeProjectId={activeProjectId}
          captainCounts={captainCounts}
          onClose={() => setDialog(null)}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
}
