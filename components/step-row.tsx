import { useState, type CSSProperties, type ReactNode } from "react";
import { experimental_useRpcQuery } from "@get-bb/plugin-sdk/app";

import {
  runsOf,
  visibleRuns,
  type RunNode,
  type VisibleRun,
} from "@/lib/step-flow";
import { rpcContract } from "@/lib/rpc";
import { STEP_KINDS, type Step, type StepKind } from "@/lib/steps";
import { FOCUS_RING, PANEL_ROW } from "@/lib/styles";
import { formatElapsed, formatOffset } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Collapsible, Disclosure } from "./disclosure";
import { Icon } from "./ui/icon";

export type OpenFile = ((path: string) => void) | null;

/** What every row in one list shares. */
export interface RowContext {
  threadId: string;
  turns: number;
  turnStartedAt: number;
  turnEndedAt: number;
  now: number;
  expanded: ReadonlySet<string>;
  onToggle: (id: string) => void;
  openFile: OpenFile;
}

const SMALL_BUTTON = `inline-flex h-6 cursor-pointer items-center gap-1 rounded-md px-1.5 text-2xs text-muted-foreground hover:bg-accent/60 hover:text-foreground ${FOCUS_RING}`;

const PROSE_CLAMP_CHARS = 320;

const CODE_BLOCK =
  "m-0 max-h-48 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-2xs leading-relaxed break-all whitespace-pre-wrap text-foreground/80";

/** Name column and timeline column of a waterfall row, and of its time axis. */
export const WATERFALL_COLUMNS =
  "grid grid-cols-[minmax(0,min(60%,20rem))_minmax(0,1fr)]";

/** Each level of nesting steps right by this. */
const INDENT = 16;

const HATCH =
  "repeating-linear-gradient(135deg, currentColor 0 1px, transparent 1px 4px)";

/** Paints a kind: a solid fill for tool time, a quiet hatch for model time. */
function kindFill(kind: StepKind): { className: string; style: CSSProperties } {
  return kind === "think"
    ? {
        className: "bg-foreground/[0.04] text-foreground/30",
        style: { backgroundImage: HATCH },
      }
    : { className: "", style: { backgroundColor: STEP_KINDS[kind].color } };
}

/** A run's own time; a folded run is its steps' time, without the gaps. */
const lengthOfRun = (run: RunNode, now: number): number =>
  run.count === null
    ? Math.max((run.endedAt ?? now) - run.startedAt, 0)
    : run.children.reduce((sum, child) => sum + lengthOfRun(child, now), 0);

const tileStyle = (kind: StepKind): CSSProperties | undefined =>
  kind === "think"
    ? undefined
    : { backgroundColor: STEP_KINDS[kind].color, color: "white" };

/** A step kind's icon in its colour, for labels. */
export function KindIcon({
  kind,
  className,
}: {
  kind: StepKind;
  className?: string;
}) {
  return (
    <Icon
      name={STEP_KINDS[kind].icon}
      fallback="Zap"
      aria-hidden
      className={cn("size-3.5 shrink-0", kind === "think" && "opacity-60", className)}
      style={kind === "think" ? undefined : { color: STEP_KINDS[kind].color }}
    />
  );
}

export function Node({
  kind,
  icon,
  running = false,
  failed = false,
}: {
  kind: StepKind;
  icon: string;
  running?: boolean;
  failed?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-[18px] shrink-0 place-items-center rounded-[5px]",
        kind === "think" && "bg-muted text-muted-foreground",
        failed && "ring-2 ring-destructive-text",
      )}
      style={tileStyle(kind)}
    >
      <Icon
        name={running ? "Spinner" : icon}
        fallback="Zap"
        className={cn(
          "size-3",
          running && "animate-spin motion-reduce:animate-none",
        )}
      />
    </span>
  );
}

function Prose({ text }: { text: string }) {
  const [all, setAll] = useState(false);
  const long = text.length > PROSE_CLAMP_CHARS || text.split("\n").length > 6;
  return (
    <div className="flex flex-col items-start gap-0.5">
      <p
        className={cn(
          "m-0 whitespace-pre-wrap text-xs leading-relaxed text-foreground/80",
          long && !all && "line-clamp-6",
        )}
      >
        {text}
      </p>
      {long ? (
        <button
          type="button"
          onClick={() => setAll((current) => !current)}
          className={cn(SMALL_BUTTON, "-ml-1.5")}
        >
          {all ? "Show less" : "Show all"}
        </button>
      ) : null}
    </div>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1">
      <h4 className="m-0 text-xs font-medium text-foreground">{title}</h4>
      {children}
    </section>
  );
}

function StepOutput({ step, context }: { step: Step; context: RowContext }) {
  const { data, error } = experimental_useRpcQuery({
    contract: rpcContract,
    method: "step_output",
    input: { threadId: context.threadId, stepId: step.id, turns: context.turns },
  });
  if (error !== null)
    return (
      <DetailSection title="Output">
        <p className="m-0 text-2xs text-muted-foreground">Could not read the output.</p>
      </DetailSection>
    );
  if (data === undefined || data.output === null) return null;
  return (
    <DetailSection title="Output">
      {STEP_KINDS[step.kind].detail === "code" ? (
        <pre className={CODE_BLOCK}>{data.output}</pre>
      ) : (
        <Prose text={data.output} />
      )}
    </DetailSection>
  );
}

const STATUS_WORD: Record<Step["status"], string> = {
  running: "Running",
  done: "Success",
  error: "Failed",
  interrupted: "Stopped",
};

const clockTime = (time: number): string =>
  new Date(time).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-2xs text-muted-foreground">{label}</dt>
      <dd className="m-0 text-xs tabular-nums text-foreground">{children}</dd>
    </div>
  );
}

function StepFacts({ step, now }: { step: Step; now: number }) {
  return (
    <dl className="m-0 grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-x-3 gap-y-2">
      <Fact label="Start">{clockTime(step.startedAt)}</Fact>
      {step.endedAt === null ? null : (
        <Fact label="End">{clockTime(step.endedAt)}</Fact>
      )}
      <Fact label="Status">
        <span className="inline-flex items-center gap-1">
          {step.status === "done" ? (
            <Icon name="Check" className="size-3 text-success-foreground" aria-hidden />
          ) : null}
          {STATUS_WORD[step.status]}
        </span>
      </Fact>
      <Fact label="Latency">{formatElapsed(Math.max((step.endedAt ?? now) - step.startedAt, 0))}</Fact>
      <Fact label="Type">{STEP_KINDS[step.kind].type}</Fact>
    </dl>
  );
}

function StepDetail({ step, context }: { step: Step; context: RowContext }) {
  const { path } = step;
  const { openFile } = context;
  const thought = step.kind === "think";
  return (
    <div className="flex flex-col gap-3 pt-1.5 pr-2 pb-3">
      <StepFacts step={step} now={context.now} />
      {step.detail === null ? null : (
        <DetailSection title={thought ? "Thinking" : "Input"}>
          {STEP_KINDS[step.kind].detail === "code" ? (
            <pre className={CODE_BLOCK}>{step.detail}</pre>
          ) : (
            <Prose text={step.detail} />
          )}
        </DetailSection>
      )}
      {thought || step.status === "running" ? null : (
        <StepOutput step={step} context={context} />
      )}
      {path === null || openFile === null ? null : (
        <button
          type="button"
          onClick={() => openFile(path)}
          className={cn(SMALL_BUTTON, "-ml-1.5 self-start")}
        >
          <Icon name="FileText" className="size-3.5" aria-hidden />
          Open file
        </button>
      )}
    </div>
  );
}

/** A run's bar at its real place on the turn's time axis. */
function Bars({ row, context }: { row: VisibleRun; context: RowContext }) {
  const { node } = row;
  const { now, turnStartedAt, turnEndedAt } = context;
  const wall = Math.max(turnEndedAt - turnStartedAt, 1);
  const percent = (time: number) =>
    Math.min(Math.max(((time - turnStartedAt) / wall) * 100, 0), 100);
  const from = percent(node.startedAt);
  const to = percent(node.endedAt ?? now);
  const fill = kindFill(node.kind);
  const segment = (start: number, end: number, key?: string) => (
    <span
      key={key}
      className={cn(
        "absolute inset-y-0 min-w-0.5 rounded-[2px]",
        fill.className,
        node.status === "running" && "animate-pulse motion-reduce:animate-none",
      )}
      style={{ ...fill.style, left: `${start}%`, width: `${end - start}%` }}
    />
  );
  return (
    <span
      className="relative block h-full"
      style={{
        backgroundImage:
          "linear-gradient(to right, color-mix(in oklab, var(--border) 45%, transparent) 1px, transparent 1px)",
        backgroundSize: "25% 100%",
      }}
    >
      <span className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2">
        {node.count === null ? (
          segment(from, to)
        ) : (
          <>
            <span
              className="absolute inset-y-1 rounded-[2px] bg-foreground/10"
              style={{ left: `${from}%`, width: `${to - from}%` }}
            />
            {node.children.map((child) =>
              segment(
                percent(child.startedAt),
                percent(child.endedAt ?? now),
                child.id,
              ),
            )}
          </>
        )}
      </span>
    </span>
  );
}

function RunRow({ row, context }: { row: VisibleRun; context: RowContext }) {
  const { node, depth } = row;
  const open = context.expanded.has(node.id);
  const length = lengthOfRun(node, context.now);
  const offset = formatOffset(node.startedAt - context.turnStartedAt);
  const indent = INDENT * depth;
  return (
    <li data-step={node.id} className="list-none">
      <button
        type="button"
        aria-expanded={open}
        title={`${node.title}\n${node.place}\nStarted at ${offset}, took ${formatElapsed(length)}`}
        onClick={() => context.onToggle(node.id)}
        className={cn(
          PANEL_ROW,
          WATERFALL_COLUMNS,
          "h-7 items-stretch rounded-md px-2",
          open && "bg-accent",
        )}
      >
        <span
          className="flex min-w-0 items-center gap-2 pr-2"
          style={{ paddingLeft: indent }}
        >
          <Node
            kind={node.kind}
            icon={node.icon}
            running={node.status === "running"}
            failed={node.status === "error"}
          />
          <span className="truncate text-[13px] text-foreground">{node.title}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {formatElapsed(length)}
          </span>
          <span className="ml-auto shrink-0">
            <Disclosure open={open} />
          </span>
        </span>
        <Bars row={row} context={context} />
      </button>
      {node.step === null ? null : (
        <Collapsible open={open}>
          <div style={{ paddingLeft: indent + 34 }}>
            <StepDetail step={node.step} context={context} />
          </div>
        </Collapsible>
      )}
    </li>
  );
}

/**
 * The turn as a waterfall: each step has its bar on one shared timeline, so
 * slow and parallel steps show. Open rows show their input, output and steps.
 */
export function StepFlow({
  steps,
  context,
}: {
  steps: readonly Step[];
  context: RowContext;
}) {
  const rows = visibleRuns(runsOf(steps, context.now), context.expanded);
  return (
    <ol className="m-0 flex flex-col p-0">
      {rows.map((row) => (
        <RunRow key={row.node.id} row={row} context={context} />
      ))}
    </ol>
  );
}
