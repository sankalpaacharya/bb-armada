import { useMemo, useState, type ReactNode } from "react";
import {
  ThreadTitle,
  useBbNavigate,
  type ExperimentalThreadActionTabProps,
} from "@get-bb/plugin-sdk/app";

import { useArmadaModel } from "@/hooks/use-armada-model";
import { captainIdOf, crewOf, type Crew } from "@/lib/crew";
import type { CaptainEntry, ThreadEntry } from "@/lib/model";
import { FOCUS_RING, SECTION_TITLE } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { Age } from "./age";
import { Summary } from "./captain-row";
import { CaptainTile } from "./captain-tile";
import { PlaceLine } from "./place-line";
import { PullRequestNumber } from "./pull-request-number";
import { Note } from "./section";
import { StatusGlyph } from "./status-mark";

type Open = (threadId: string) => void;

const ROW = `flex w-full cursor-pointer rounded-md text-left hover:bg-accent/60 ${FOCUS_RING}`;

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

function WorkerRow({
  entry,
  current,
  onOpen,
}: {
  entry: ThreadEntry;
  current: boolean;
  onOpen: Open;
}) {
  return (
    <li className="list-none">
      <button
        type="button"
        aria-current={current ? "page" : undefined}
        onClick={() => onOpen(entry.thread.id)}
        className={cn(ROW, "flex-col px-2 py-1", current && "bg-accent")}
      >
        <span className="flex h-7 w-full items-center gap-2">
          <span className="grid size-4 shrink-0 place-items-center">
            {entry.status === null ? (
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-muted-foreground/40"
              />
            ) : (
              <StatusGlyph status={entry.status} />
            )}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">
            <ThreadTitle threadId={entry.thread.id} />
          </span>
          <span className="contents text-2xs">
            <PullRequestNumber
              environmentId={entry.thread.environment?.id ?? null}
            />
          </span>
          <Age at={entry.lastActivityAt} />
        </span>
        <span className="w-full">
          <PlaceLine thread={entry.thread} project={null} />
        </span>
      </button>
    </li>
  );
}

function CrewView({
  crew,
  currentThreadId,
  onOpen,
  onBack,
}: {
  crew: Crew;
  currentThreadId: string;
  onOpen: Open;
  onBack: (() => void) | null;
}) {
  const { captain } = crew;
  const workers = crew.active.length + crew.inactive.length + crew.parked.length;
  const rows = (entries: readonly ThreadEntry[]) =>
    entries.map((entry) => (
      <WorkerRow
        key={entry.thread.id}
        entry={entry}
        current={entry.thread.id === currentThreadId}
        onOpen={onOpen}
      />
    ));
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3 px-2">
        <CaptainTile avatar={captain.record.avatar} size="preview" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <button
            type="button"
            onClick={() => onOpen(captain.thread.id)}
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
      {workers === 0 ? (
        <Note>
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
            className={cn(ROW, "h-11 items-center gap-2.5 px-2")}
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
  const { status, threads, captains, model } = useArmadaModel();
  const navigate = useBbNavigate();
  const [picked, setPicked] = useState<string | null>(null);
  const own = useMemo(
    () => captainIdOf(model, threads, threadId),
    [model, threads, threadId],
  );
  const crew = useMemo(() => {
    const captainId = own ?? picked;
    return captainId === null ? null : crewOf(model, captainId);
  }, [model, own, picked]);
  const open: Open = (id) => navigate.toThread(id);

  let body: ReactNode;
  if (status === "loading" || captains.status === "loading")
    body = <Note>Loading crew…</Note>;
  else if (captains.status === "error")
    body = <Note>Could not load captains</Note>;
  else if (crew !== null)
    body = (
      <CrewView
        crew={crew}
        currentThreadId={threadId}
        onOpen={open}
        onBack={own === null ? () => setPicked(null) : null}
      />
    );
  else body = <CaptainPicker captains={model.captains} onPick={setPicked} />;

  return <div className="h-full overflow-y-auto p-3">{body}</div>;
}
