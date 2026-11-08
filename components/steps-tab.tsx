import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  experimental_useRpcQuery,
  experimental_useSidebarThreads,
  experimental_useTabVisible,
  useBbNavigate,
  type ExperimentalThreadActionTabProps,
} from "@get-bb/plugin-sdk/app";

import { useLiveNow } from "@/lib/clock";
import { rpcContract } from "@/lib/rpc";
import {
  STEP_KINDS,
  STEP_KIND_IDS,
  extendTo,
  spanAt,
  type Span,
  type StepKind,
  type ThreadSteps,
  type TurnSteps,
} from "@/lib/steps";
import { AGE_TEXT, FOCUS_RING, PANEL_ROW } from "@/lib/styles";
import { formatElapsed, formatOffset } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Collapsible, Disclosure } from "./disclosure";
import { Note } from "./section";
import {
  KindIcon,
  Node,
  StepFlow,
  type OpenFile,
  type RowContext,
} from "./step-row";
import { MiniRibbon, Ribbon } from "./steps-ribbon";

/** Turns read at first, and how many more each "Show older turns" adds. */
const TURNS_PAGE = 10;
const MAX_TURNS = 40;

type Order = "order" | "slowest";

const CHIP = `inline-flex h-6 cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-2xs text-foreground/80 hover:bg-accent/60 aria-pressed:bg-accent aria-pressed:text-foreground ${FOCUS_RING}`;

const TOGGLE = `h-5 cursor-pointer rounded-[5px] px-1.5 text-2xs text-muted-foreground hover:text-foreground aria-pressed:bg-background aria-pressed:text-foreground ${FOCUS_RING}`;

const TEXT_BUTTON = `cursor-pointer rounded-md px-2 py-1 text-2xs text-muted-foreground hover:bg-accent/60 hover:text-foreground ${FOCUS_RING}`;

function Legend({
  totals,
  filter,
  onFilter,
}: {
  totals: TurnSteps["totals"];
  filter: StepKind | null;
  onFilter: (kind: StepKind | null) => void;
}) {
  const kinds = STEP_KIND_IDS.filter((kind) => totals[kind] > 0).sort(
    (a, b) => totals[b] - totals[a],
  );
  return (
    <div
      role="group"
      aria-label="Show one kind"
      className="flex flex-wrap gap-0.5"
    >
      {kinds.map((kind) => (
        <button
          key={kind}
          type="button"
          aria-pressed={filter === kind}
          title={
            kind === "think"
              ? "The model thinking or writing, between and during its steps"
              : undefined
          }
          onClick={() => onFilter(filter === kind ? null : kind)}
          className={CHIP}
        >
          <KindIcon kind={kind} />
          {STEP_KINDS[kind].label}
          <span className="text-muted-foreground tabular-nums">
            {formatElapsed(totals[kind])}
          </span>
        </button>
      ))}
    </div>
  );
}

function OrderToggle({
  order,
  onOrder,
}: {
  order: Order;
  onOrder: (order: Order) => void;
}) {
  const option = (value: Order, label: string) => (
    <button
      type="button"
      aria-pressed={order === value}
      onClick={() => onOrder(value)}
      className={TOGGLE}
    >
      {label}
    </button>
  );
  return (
    <div
      role="group"
      aria-label="Order steps"
      className="flex w-fit gap-0.5 rounded-md bg-muted/60 p-0.5"
    >
      {option("order", "In order")}
      {option("slowest", "Slowest")}
    </div>
  );
}

function TurnBody({
  turn,
  now,
  openFile,
}: {
  turn: TurnSteps;
  now: number;
  openFile: OpenFile;
}) {
  const [filter, setFilter] = useState<StepKind | null>(null);
  const [order, setOrder] = useState<Order>("order");
  const [hovered, setHovered] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(
    () => new Map(turn.steps.map((step) => [step.id, step])),
    [turn.steps],
  );
  const at = hovered ?? pinned;
  const span = at === null ? null : spanAt(turn.spans, at);
  const highlighted = span?.stepId ?? null;
  const owner = highlighted === null ? null : (byId.get(highlighted) ?? null);
  const label =
    at === null || span === null
      ? ""
      : `${formatOffset(at - turn.startedAt)} · ${
          owner === null
            ? STEP_KINDS[span.kind].label
            : [owner.verb, owner.target].filter(Boolean).join(" ")
        }`;

  const pinnedStep =
    pinned === null ? null : (spanAt(turn.spans, pinned)?.stepId ?? null);
  useEffect(() => {
    if (pinnedStep === null) return;
    const rows = listRef.current?.querySelectorAll<HTMLElement>("[data-step]");
    const row = Array.from(rows ?? []).find(
      (element) =>
        element.dataset.step === pinnedStep ||
        element.dataset.holds?.split(" ").includes(pinnedStep),
    );
    row?.scrollIntoView?.({ block: "nearest" });
  }, [pinnedStep]);

  const toggle = (stepId: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(stepId)) next.add(stepId);
      return next;
    });
  const open = (picked: Span) => {
    const { stepId } = picked;
    if (stepId !== null)
      setExpanded((current) => new Set(current).add(stepId));
  };

  const shown =
    filter === null
      ? turn.steps
      : turn.steps.filter((step) => step.kind === filter);
  const context: RowContext = {
    turnStartedAt: turn.startedAt,
    now,
    expanded,
    onToggle: toggle,
    openFile,
  };

  return (
    <div className="flex flex-col pb-3">
      <div className="sticky top-0 z-10 flex flex-col gap-2 bg-sidebar px-2 pt-1 pb-2">
        <Ribbon
          turn={turn}
          filter={filter}
          at={at}
          label={label}
          onScrub={setHovered}
          onPin={setPinned}
          onOpen={open}
        />
        <Legend totals={turn.totals} filter={filter} onFilter={setFilter} />
        {turn.steps.length > 1 ? (
          <OrderToggle order={order} onOrder={setOrder} />
        ) : null}
      </div>
      <div ref={listRef}>
        {shown.length > 0 ? (
          <StepFlow
            steps={shown}
            order={order}
            context={context}
            highlighted={highlighted}
          />
        ) : (
          <Note>
            {filter === "think"
              ? "This is the model thinking and writing between its steps."
              : "No steps of this kind."}
          </Note>
        )}
      </div>
    </div>
  );
}

const TurnSection = memo(function TurnSection({
  turn,
  initiallyOpen,
  now,
  openFile,
}: {
  turn: TurnSteps;
  initiallyOpen: boolean;
  /** Moves only for a running turn. */
  now: number;
  openFile: OpenFile;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const wall = Math.max((turn.endedAt ?? now) - turn.startedAt, 0);
  return (
    <li className="list-none">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(PANEL_ROW, "flex-col gap-1.5 px-2 py-1.5")}
      >
        <span className="flex w-full items-start gap-1.5">
          <span className="grid h-5 shrink-0 place-items-center">
            <Disclosure open={open} />
          </span>
          <span className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-5 text-foreground">
            {turn.prompt}
          </span>
          <span className={cn(AGE_TEXT, "leading-5")}>{formatElapsed(wall)}</span>
        </span>
        {open ? null : (
          <span className="w-full pl-5">
            <MiniRibbon turn={turn} />
          </span>
        )}
      </button>
      <Collapsible open={open}>
        <TurnBody turn={turn} now={now} openFile={openFile} />
      </Collapsible>
    </li>
  );
});

function NowLine({ steps, now }: { steps: ThreadSteps; now: number }) {
  const step = steps.now;
  const kind = step?.kind ?? "think";
  const since = step?.startedAt ?? steps.turns[0]?.spans.at(-1)?.from ?? now;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5">
      <Node kind={kind} icon={STEP_KINDS[kind].icon} running />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] leading-5 font-medium text-foreground">
          {step?.target || STEP_KINDS[kind].label}
        </span>
        <span className="text-[11px] leading-4 text-muted-foreground">
          {STEP_KINDS[kind].label} now
        </span>
      </span>
      <span className="shrink-0 text-[11px] tabular-nums text-foreground">
        {formatElapsed(Math.max(now - since, 0))}
      </span>
    </div>
  );
}

/**
 * A side panel tab with where the thread's time went: each turn as a ribbon
 * of what the agent was doing, and its steps, slowest first if asked.
 */
export function StepsTab({ threadId }: ExperimentalThreadActionTabProps) {
  const visible = experimental_useTabVisible();
  const [turns, setTurns] = useState(TURNS_PAGE);
  const { data, error, refetch } = experimental_useRpcQuery({
    contract: rpcContract,
    method: "thread_steps",
    input: { threadId, turns },
    enabled: visible,
  });
  const [kept, setKept] = useState(data);
  if (data !== undefined && data !== kept) setKept(data);
  const steps = data ?? (kept?.threadId === threadId ? kept : undefined);
  const now = useLiveNow(steps?.running ?? false);

  const hostId =
    experimental_useSidebarThreads().threads.find(
      (thread) => thread.id === threadId,
    )?.host?.id ?? null;
  const navigate = useBbNavigate();
  const openFile = useMemo<OpenFile>(
    () =>
      hostId === null
        ? null
        : (path) =>
            navigate.experimental_openFilePreview({
              target: { kind: "host", hostId, path },
              location: null,
            }),
    [hostId, navigate],
  );

  let body: ReactNode;
  if (steps === undefined)
    body =
      error === null ? (
        <Note>Loading steps…</Note>
      ) : (
        <div className="flex items-center gap-2">
          <Note className="min-w-0 flex-1">
            Could not read this thread's steps: {error.message}
          </Note>
          <button
            type="button"
            onClick={() => void refetch()}
            className={TEXT_BUTTON}
          >
            Retry
          </button>
        </div>
      );
  else if (steps.turns.length === 0)
    body = <Note>No steps yet. They show here as the agent works.</Note>;
  else
    body = (
      <>
        {steps.running ? <NowLine steps={steps} now={now} /> : null}
        <ol className="m-0 flex flex-col gap-1 p-0">
          {steps.turns.map((turn, index) => (
            <TurnSection
              key={turn.id}
              turn={extendTo(turn, now)}
              initiallyOpen={index === 0}
              now={turn.running ? now : 0}
              openFile={openFile}
            />
          ))}
        </ol>
        {steps.hasOlder && turns < MAX_TURNS ? (
          <button
            type="button"
            onClick={() =>
              setTurns((current) => Math.min(current + TURNS_PAGE, MAX_TURNS))
            }
            className={cn(TEXT_BUTTON, "self-start")}
          >
            Show older turns
          </button>
        ) : null}
      </>
    );

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-3">{body}</div>
  );
}
