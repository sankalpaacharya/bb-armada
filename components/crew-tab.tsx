import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ThreadChat,
  ThreadTitle,
  experimental_ThreadActionsContextMenu as ThreadActionsContextMenu,
  experimental_useRpcQuery,
  useBbNavigate,
  type ExperimentalThreadActionTabProps,
} from "@get-bb/plugin-sdk/app";

import { useArmadaModel } from "@/hooks/use-armada-model";
import { useCrewActions } from "@/hooks/use-crew-actions";
import { useParkActions, type ParkActions } from "@/hooks/use-park-actions";
import { useProjectLogos } from "@/hooks/use-project-logos";
import { toActionTarget } from "@/lib/action-target";
import { captainIdOf, crewOf, type Crew } from "@/lib/crew";
import type { CaptainEntry, ThreadEntry } from "@/lib/model";
import { rpcContract } from "@/lib/rpc";
import { FOCUS_RING, PANEL_ROW, SECTION_TITLE } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { Age } from "./age";
import { Summary } from "./captain-row";
import { CaptainTile } from "./captain-tile";
import { MemorySection } from "./memory-section";
import { parkItems, removeFromCrewItems } from "./menu-items";
import { PlaceLine } from "./place-line";
import { ProjectLogo } from "./project-logo";
import { RowActions } from "./row-actions";
import { Note } from "./section";
import { StatusGlyph } from "./status-mark";
import { Icon } from "./ui/icon";

type Open = (threadId: string) => void;

const HEADER_BUTTON = `flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-2xs text-muted-foreground hover:bg-accent/60 hover:text-foreground ${FOCUS_RING}`;

function WorkerChat({
  threadId,
  onBack,
  onOpenFull,
}: {
  threadId: string;
  onBack: () => void;
  onOpenFull: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
        <button type="button" onClick={onBack} className={HEADER_BUTTON}>
          <Icon name="ChevronLeft" className="size-3.5" />
          Crew
        </button>
        <span className="min-w-0 flex-1 truncate px-1 text-sm text-foreground">
          <ThreadTitle threadId={threadId} />
        </span>
        <button type="button" onClick={onOpenFull} className={HEADER_BUTTON}>
          <Icon name="Maximize2" className="size-3.5" />
          Open
        </button>
      </header>
      <ThreadChat threadId={threadId} variant="compact" className="min-h-0 flex-1" />
    </div>
  );
}

function Group({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section className="flex flex-col gap-1">
      <h3 className={cn("flex items-baseline gap-1.5 px-2", SECTION_TITLE)}>
        {title}
        <span className="text-2xs font-normal tabular-nums text-muted-foreground">
          {count}
        </span>
      </h3>
      <ul className="m-0 flex flex-col gap-px p-0">{children}</ul>
    </section>
  );
}

/** What the captain's backlog keeps waiting on the user, answered in its thread. */
/** How often, at most, the decisions are read again while the captain keeps acting. */
const NEEDS_YOU_REFRESH_MS = 30_000;

/** Read again when the captain acts, since that is when it closes or opens a decision. */
function NeedsYou({
  project,
  captainActivityAt,
  onOpenCaptain,
}: {
  project: string;
  captainActivityAt: number;
  onOpenCaptain: () => void;
}) {
  const { data, refetch } = experimental_useRpcQuery({
    contract: rpcContract,
    method: "captain_home",
    input: { project },
  });
  const activityWindow = Math.floor(captainActivityAt / NEEDS_YOU_REFRESH_MS);
  useEffect(() => {
    void refetch();
  }, [activityWindow, refetch]);
  const items = data?.status === "ready" ? data.needsYou : [];
  return (
    <Group title="Needs you" count={items.length}>
      {items.map((item, index) => (
        <li key={`${index}:${item}`} className="list-none">
          <button
            type="button"
            title={item}
            onClick={onOpenCaptain}
            className={cn(PANEL_ROW, "items-start gap-2 px-2 py-1.5")}
          >
            <span className="grid h-5 w-4 shrink-0 place-items-center">
              <StatusGlyph status="needs-you" />
            </span>
            <span className="line-clamp-2 min-w-0 flex-1 text-sm text-foreground/85">
              {item}
            </span>
          </button>
        </li>
      ))}
    </Group>
  );
}

function WorkerRow({
  entry,
  current,
  onOpen,
  onRemove,
  parkActions,
}: {
  entry: ThreadEntry;
  current: boolean;
  onOpen: Open;
  onRemove: (threadId: string) => void;
  parkActions: ParkActions;
}) {
  const target = useMemo(() => toActionTarget(entry.thread), [entry.thread]);
  const threadId = entry.thread.id;
  return (
    <li className="group/row relative list-none">
      <ThreadActionsContextMenu
        thread={target}
        inline={[
          ...parkItems(entry, parkActions),
          ...removeFromCrewItems(entry.thread, () => onRemove(threadId)),
        ]}
      >
        <button
          type="button"
          aria-current={current ? "page" : undefined}
          onClick={() => onOpen(entry.thread.id)}
          className={cn(
            PANEL_ROW,
            "flex-col px-2 py-1",
            current && "bg-accent",
          )}
        >
          <span className="flex h-7 w-full items-center gap-2">
            <span className="grid size-4 shrink-0 place-items-center">
              {entry.projectLogo === null ? (
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-muted-foreground/40"
                />
              ) : (
                <ProjectLogo src={entry.projectLogo} />
              )}
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-sm text-foreground",
                entry.parkable &&
                  "group-focus-within/row:pr-6 group-hover/row:pr-6",
              )}
            >
              <ThreadTitle threadId={threadId} />
            </span>
          </span>
          <span className="w-full">
            <PlaceLine
              thread={entry.thread}
              project={null}
              className="pr-0"
              trailing={
                <>
                  {entry.status === null ? null : (
                    <span className="grid h-4 min-w-4 shrink-0 place-items-center">
                      <StatusGlyph status={entry.status} />
                    </span>
                  )}
                  <Age at={entry.lastActivityAt} />
                </>
              }
            />
          </span>
        </button>
      </ThreadActionsContextMenu>
      {entry.parkable ? (
        <span className="absolute top-1 right-2 h-7 w-6">
          <RowActions
            actions={[
              {
                label: "Settle",
                icon: "Check",
                run: () => parkActions.settle(threadId),
              },
            ]}
          />
        </span>
      ) : null}
    </li>
  );
}

function CrewView({
  crew,
  projectName,
  currentThreadId,
  onOpen,
  onOpenCaptain,
  onBack,
}: {
  crew: Crew;
  /** The captain's project, which names its memory folder. */
  projectName: string | null;
  currentThreadId: string;
  onOpen: Open;
  onOpenCaptain: () => void;
  onBack: (() => void) | null;
}) {
  const { captain } = crew;
  const crewActions = useCrewActions();
  const parkActions = useParkActions();
  const projectLogo = useProjectLogos()[captain.thread.projectId] ?? null;
  const workers = crew.active.length + crew.inactive.length + crew.parked.length;
  const rows = (entries: readonly ThreadEntry[]) =>
    entries.map((entry) => (
      <WorkerRow
        key={entry.thread.id}
        entry={entry}
        current={entry.thread.id === currentThreadId}
        onOpen={onOpen}
        onRemove={crewActions.remove}
        parkActions={parkActions}
      />
    ));
  return (
    <div className="flex min-h-full flex-col gap-5">
      <header className="flex items-center gap-3 px-2">
        <span className="relative shrink-0">
          <CaptainTile avatar={captain.record.avatar} size="preview" />
          {projectLogo === null ? null : (
            <ProjectLogo
              src={projectLogo}
              className="absolute -right-1 -bottom-1 size-4 rounded-[5px] ring-2 ring-background"
            />
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <button
            type="button"
            onClick={onOpenCaptain}
            className={cn(
              "cursor-pointer truncate text-left text-sm font-medium text-foreground hover:underline",
              FOCUS_RING,
            )}
          >
            {captain.thread.displayTitle}
          </button>
          <span className="flex items-center gap-1.5 text-2xs">
            <Summary counts={captain.counts} />
          </span>
        </div>
        {onBack === null ? null : (
          <button
            type="button"
            onClick={onBack}
            className={cn(
              "shrink-0 cursor-pointer rounded-md px-2 py-1 text-2xs text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            All captains
          </button>
        )}
      </header>
      {projectName === null ? null : (
        <NeedsYou
          project={projectName}
          captainActivityAt={captain.thread.updatedAt}
          onOpenCaptain={onOpenCaptain}
        />
      )}
      {workers === 0 ? (
        <Note className="px-2">
          No workers yet. Ask the captain for something and its workers show up
          here.
        </Note>
      ) : (
        <>
          <Group title="Active" count={crew.active.length}>
            {rows(crew.active)}
          </Group>
          <Group title="Inactive" count={crew.inactive.length}>
            {rows(crew.inactive)}
          </Group>
          <Group title="Settled" count={crew.parked.length}>
            {rows(crew.parked)}
          </Group>
        </>
      )}
      {projectName === null ? null : (
        <div className="sticky -bottom-3 -mx-3 -mb-3 mt-auto border-t border-border bg-sidebar px-3 py-2">
          <MemorySection
            project={projectName}
            hostId={captain.thread.host?.id ?? null}
          />
        </div>
      )}
    </div>
  );
}

function CaptainPicker({
  captains,
  onPick,
}: {
  captains: readonly CaptainEntry[];
  onPick: (captainId: string) => void;
}) {
  if (captains.length === 0)
    return (
      <Note>
        No captains yet. Start one with + beside Captains in the sidebar.
      </Note>
    );
  return (
    <Group title="Captains" count={captains.length}>
      {captains.map((entry) => (
        <li key={entry.thread.id} className="list-none">
          <button
            type="button"
            onClick={() => onPick(entry.thread.id)}
            className={cn(PANEL_ROW, "h-11 items-center gap-2.5 px-2")}
          >
            <CaptainTile avatar={entry.record.avatar} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium text-foreground">
                {entry.thread.displayTitle}
              </span>
              <span className="flex h-4 items-center gap-1.5 text-2xs">
                <Summary counts={entry.counts} />
              </span>
            </span>
          </button>
        </li>
      ))}
    </Group>
  );
}

/**
 * A side panel tab with a captain's crew: the open thread's captain, or a
 * captain picked from the list when the thread has none.
 */
export function CrewTab({ threadId }: ExperimentalThreadActionTabProps) {
  const { status, threads, projects, captains, model } = useArmadaModel();
  const navigate = useBbNavigate();
  const [picked, setPicked] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const own = useMemo(
    () => captainIdOf(model, threads, threadId),
    [model, threads, threadId],
  );
  const crew = useMemo(() => {
    const captainId = own ?? picked;
    return captainId === null ? null : crewOf(model, captainId);
  }, [model, own, picked]);
  if (chatId !== null && chatId !== threadId)
    return (
      <WorkerChat
        threadId={chatId}
        onBack={() => setChatId(null)}
        onOpenFull={() => {
          setChatId(null);
          navigate.toThread(chatId);
        }}
      />
    );

  let body: ReactNode;
  if (status === "loading" || captains.status === "loading")
    body = <Note>Loading crew…</Note>;
  else if (captains.status === "error")
    body = <Note>Could not load captains</Note>;
  else if (crew !== null)
    body = (
      <CrewView
        crew={crew}
        projectName={
          projects.find(
            (project) => project.id === crew.captain.thread.projectId,
          )?.name ?? null
        }
        currentThreadId={threadId}
        onOpen={setChatId}
        onOpenCaptain={() => navigate.toThread(crew.captain.thread.id)}
        onBack={own === null ? () => setPicked(null) : null}
      />
    );
  else body = <CaptainPicker captains={model.captains} onPick={setPicked} />;

  return <div className="h-full overflow-y-auto p-3">{body}</div>;
}
