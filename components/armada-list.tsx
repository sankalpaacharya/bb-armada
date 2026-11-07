import { useMemo, useState } from "react";
import {
  experimental_useSidebarThreads,
  useBbNavigate,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";

import { useArrowKeyRows } from "@/hooks/use-arrow-key-rows";
import { useCaptains } from "@/hooks/use-captains";
import { useNow } from "@/hooks/use-now";
import { buildArmada } from "@/lib/model";
import { pickableProjects } from "@/lib/scope";
import { CaptainDialog, type CaptainDialogState } from "./captain-dialog";
import { CaptainsSection } from "./captains-section";
import type { OpenThread } from "./thread-link";
import { ThreadsSection } from "./threads-section";

export function ArmadaList({
  activeThreadId,
  activeProjectId,
  onNavigate,
}: PluginThreadListProps) {
  const { status, threads, projects } = experimental_useSidebarThreads();
  const captains = useCaptains();
  const navigate = useBbNavigate();
  const now = useNow(30_000);
  const [dialog, setDialog] = useState<CaptainDialogState | null>(null);
  const rows = useArrowKeyRows();

  const model = useMemo(
    () => buildArmada(threads, projects, captains ?? []),
    [threads, projects, captains],
  );
  const pickable = useMemo(() => pickableProjects(projects), [projects]);

  const open: OpenThread = (threadId, split) => {
    navigate.toThread(threadId, { split });
    onNavigate();
  };

  return (
    <div
      ref={rows.ref}
      onKeyDown={rows.onKeyDown}
      className="flex min-h-full shrink-0 flex-col px-1.5 pb-2"
    >
      <CaptainsSection
        captains={model.captains}
        activeThreadId={activeThreadId}
        now={now}
        onOpen={open}
        onDialog={setDialog}
      />
      <ThreadsSection
        entries={model.threads}
        projects={pickable}
        status={captains === undefined ? "loading-captains" : status}
        activeThreadId={activeThreadId}
        now={now}
        onOpen={open}
        onAdopt={(thread) => setDialog({ kind: "adopt", thread })}
      />
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
