import { useState } from "react";

import { STEP_KINDS, type Step } from "@/lib/steps";
import { AGE_TEXT, FOCUS_RING, PANEL_ROW } from "@/lib/styles";
import { formatElapsed, formatOffset } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Collapsible } from "./disclosure";
import { KindSwatch, kindFill } from "./steps-ribbon";
import { Icon } from "./ui/icon";

export type OpenFile = ((path: string) => void) | null;

/** What every row in one list shares. */
export interface RowContext {
  turnStartedAt: number;
  now: number;
  expanded: ReadonlySet<string>;
  onToggle: (stepId: string) => void;
  openFile: OpenFile;
}

/** A step's own length, up to now while it runs. */
export const lengthOf = (step: Step, now: number): number =>
  Math.max((step.endedAt ?? now) - step.startedAt, 0);

const SMALL_BUTTON = `inline-flex h-6 cursor-pointer items-center gap-1 rounded-md px-1.5 text-2xs text-muted-foreground hover:bg-accent/60 hover:text-foreground ${FOCUS_RING}`;

const PROSE_CLAMP_CHARS = 320;

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

function StepDetail({ step, context }: { step: Step; context: RowContext }) {
  const { path } = step;
  const { openFile } = context;
  return (
    <div className="flex flex-col gap-1.5 pt-0.5 pr-2 pb-2 pl-[3.25rem]">
      {step.detail === null ? null : STEP_KINDS[step.kind].detail === "code" ? (
        <pre className="m-0 max-h-48 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-2xs leading-relaxed break-all whitespace-pre-wrap text-foreground/80">
          {step.detail}
        </pre>
      ) : (
        <Prose text={step.detail} />
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
      {step.children.length === 0 ? null : (
        <StepList steps={step.children} context={context} highlighted={null} />
      )}
    </div>
  );
}

function StepRow({
  step,
  scale,
  highlighted,
  context,
}: {
  step: Step;
  /** The longest step in the list, which fills the bar. */
  scale: number;
  highlighted: boolean;
  context: RowContext;
}) {
  const expanded = context.expanded.has(step.id);
  const length = lengthOf(step, context.now);
  const failed = step.status === "error";
  const bar = kindFill(step.kind);
  return (
    <li data-step={step.id} className="list-none scroll-mt-32">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => context.onToggle(step.id)}
        className={cn(
          PANEL_ROW,
          "h-7 items-center gap-2 px-2 text-[13px]",
          (highlighted || expanded) && "bg-accent/60",
          highlighted && "bg-accent",
        )}
      >
        <span className="w-9 shrink-0 text-2xs text-muted-foreground tabular-nums">
          {formatOffset(step.startedAt - context.turnStartedAt)}
        </span>
        <span
          className={cn(
            "shrink-0 text-foreground/60",
            failed && "text-destructive-text",
          )}
        >
          {step.verb}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-foreground",
            failed && "text-destructive-text",
          )}
        >
          {step.target}
        </span>
        {step.status === "running" ? (
          <KindSwatch
            kind={step.kind}
            className="size-1.5 animate-pulse rounded-full motion-reduce:animate-none"
          />
        ) : null}
        <span className={AGE_TEXT}>{formatElapsed(length)}</span>
        <span
          aria-hidden
          className="h-1 w-10 shrink-0 overflow-hidden rounded-full bg-foreground/5"
        >
          <span
            className={cn("block h-full rounded-full", bar.className)}
            style={{
              ...bar.style,
              width: length > 0 ? `${Math.max((length / scale) * 100, 4)}%` : 0,
            }}
          />
        </span>
      </button>
      <Collapsible open={expanded}>
        <StepDetail step={step} context={context} />
      </Collapsible>
    </li>
  );
}

/** Steps as rows, each opening to its detail, a subagent's to its own steps. */
export function StepList({
  steps,
  context,
  highlighted,
  scale = Math.max(1, ...steps.map((step) => lengthOf(step, context.now))),
}: {
  steps: readonly Step[];
  context: RowContext;
  highlighted: string | null;
  /** The length that fills a row's bar; the longest of `steps` unless given. */
  scale?: number;
}) {
  return (
    <ol className="m-0 flex flex-col gap-px p-0">
      {steps.map((step) => (
        <StepRow
          key={step.id}
          step={step}
          scale={scale}
          highlighted={step.id === highlighted}
          context={context}
        />
      ))}
    </ol>
  );
}
