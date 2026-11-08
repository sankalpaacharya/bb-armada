import { useState, type CSSProperties, type ReactNode } from "react";

import { flowOf, groupTitle, stepPlace, type FlowItem } from "@/lib/step-flow";
import { STEP_KINDS, type Step, type StepKind } from "@/lib/steps";
import { FOCUS_RING, PANEL_ROW } from "@/lib/styles";
import { formatElapsed, formatOffset } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Collapsible } from "./disclosure";
import { Icon } from "./ui/icon";

export type OpenFile = ((path: string) => void) | null;

/** What every row in one list shares. */
export interface RowContext {
  turnStartedAt: number;
  now: number;
  expanded: ReadonlySet<string>;
  onToggle: (id: string) => void;
  openFile: OpenFile;
}

/** A step's own length, up to now while it runs. */
export const lengthOf = (step: Step, now: number): number =>
  Math.max((step.endedAt ?? now) - step.startedAt, 0);

const SMALL_BUTTON = `inline-flex h-6 cursor-pointer items-center gap-1 rounded-md px-1.5 text-2xs text-muted-foreground hover:bg-accent/60 hover:text-foreground ${FOCUS_RING}`;

const PROSE_CLAMP_CHARS = 320;

/** The line through every node, from the first node's middle to the last's. */
const RAIL =
  "relative before:absolute before:left-[calc(0.875rem-0.5px)] before:top-0 before:bottom-0 before:w-px before:bg-border first:before:top-4 last:before:bottom-[calc(100%-1rem)]";

/** Actions within a kind that read better with their own icon. */
const VERB_ICONS: Record<string, string> = {
  Searched: "Search",
  Listed: "Folder",
  "Searched the web": "Search",
  Viewed: "Image",
};

const iconOf = (step: Pick<Step, "kind" | "verb">): string =>
  VERB_ICONS[step.verb] ?? STEP_KINDS[step.kind].icon;

const tint = (kind: StepKind): CSSProperties =>
  kind === "think"
    ? {}
    : {
        color: STEP_KINDS[kind].color,
        backgroundColor: `color-mix(in oklab, ${STEP_KINDS[kind].color} 16%, transparent)`,
      };

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
  count,
}: {
  kind: StepKind;
  icon: string;
  running?: boolean;
  failed?: boolean;
  count?: number;
}) {
  return (
    <span
      className={cn(
        "relative z-[1] grid size-7 shrink-0 place-items-center rounded-lg bg-sidebar",
        kind === "think" && "text-muted-foreground",
        failed && "ring-1 ring-destructive-text",
      )}
    >
      <span
        aria-hidden
        className="grid size-full place-items-center rounded-lg bg-muted/60"
        style={tint(kind)}
      >
        <Icon
          name={running ? "Spinner" : icon}
          fallback="Zap"
          className={cn(
            "size-3.5",
            running && "animate-spin motion-reduce:animate-none",
          )}
        />
      </span>
      {count === undefined ? null : (
        <span className="absolute -right-1.5 -bottom-1 min-w-4 rounded-full bg-sidebar px-0.5 text-center text-[10px] leading-4 font-medium tabular-nums text-foreground ring-1 ring-border">
          {count}
        </span>
      )}
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

function StepDetail({ step, context }: { step: Step; context: RowContext }) {
  const { path } = step;
  const { openFile } = context;
  return (
    <div className="flex flex-col gap-1.5 pt-0.5 pr-2 pb-2 pl-11">
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
        <StepFlow
          steps={step.children}
          order="order"
          context={context}
          highlighted={null}
        />
      )}
    </div>
  );
}

/** The two lines beside a node, and how long and when on the right. */
function Card({
  title,
  place,
  length,
  notable,
  offset,
  expanded,
  highlighted,
  onClick,
}: {
  title: ReactNode;
  place: string;
  length: number;
  notable: boolean;
  offset: number;
  expanded: boolean;
  highlighted: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={onClick}
      className={cn(
        PANEL_ROW,
        "min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1",
        expanded && "bg-accent/60",
        highlighted && "bg-accent",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] leading-5 font-medium text-foreground">
          {title}
        </span>
        <span className="truncate text-[11px] leading-4 text-muted-foreground">
          {place}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span
          className={cn(
            "text-[11px] leading-5 tabular-nums",
            notable ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {formatElapsed(length)}
        </span>
        <span className="text-[10px] leading-4 tabular-nums text-muted-foreground/70">
          {formatOffset(offset)}
        </span>
      </span>
    </button>
  );
}

function StepItem({
  step,
  longest,
  highlighted,
  context,
}: {
  step: Step;
  longest: number;
  highlighted: boolean;
  context: RowContext;
}) {
  const expanded = context.expanded.has(step.id);
  const length = lengthOf(step, context.now);
  const failed = step.status === "error";
  return (
    <li data-step={step.id} className={cn("list-none scroll-mt-40", RAIL)}>
      <div className="flex items-center gap-1.5">
        <Node
          kind={step.kind}
          icon={iconOf(step)}
          running={step.status === "running"}
          failed={failed}
        />
        <Card
          title={step.kind === "think" ? step.verb : step.target || step.verb}
          place={
            step.kind === "think"
              ? step.target
              : failed
                ? `Failed: ${stepPlace(step)}`
                : stepPlace(step)
          }
          length={length}
          notable={length >= longest / 4 && length >= 1_000}
          offset={step.startedAt - context.turnStartedAt}
          expanded={expanded}
          highlighted={highlighted}
          onClick={() => context.onToggle(step.id)}
        />
      </div>
      <Collapsible open={expanded}>
        <StepDetail step={step} context={context} />
      </Collapsible>
    </li>
  );
}

function GroupItem({
  id,
  steps,
  longest,
  highlighted,
  context,
}: {
  id: string;
  steps: readonly Step[];
  longest: number;
  highlighted: string | null;
  context: RowContext;
}) {
  const expanded = context.expanded.has(id);
  const first = steps[0]!;
  const length = steps.reduce((sum, step) => sum + lengthOf(step, context.now), 0);
  const holds = highlighted !== null && steps.some((step) => step.id === highlighted);
  return (
    <li
      data-step={id}
      data-holds={steps.map((step) => step.id).join(" ")}
      className={cn("list-none scroll-mt-40", RAIL)}
    >
      <div className="flex items-center gap-1.5">
        <Node kind={first.kind} icon={iconOf(first)} count={steps.length} />
        <Card
          title={groupTitle(steps)}
          place={steps.map((step) => step.target).join(", ")}
          length={length}
          notable={length >= longest / 4 && length >= 1_000}
          offset={first.startedAt - context.turnStartedAt}
          expanded={expanded}
          highlighted={holds && !expanded}
          onClick={() => context.onToggle(id)}
        />
      </div>
      <Collapsible open={expanded}>
        <div className="pl-5">
          <StepFlow
            steps={steps}
            order="order"
            context={context}
            highlighted={highlighted}
            grouped={false}
          />
        </div>
      </Collapsible>
    </li>
  );
}

function ThoughtItem({
  step,
  highlighted,
  context,
}: {
  step: Step;
  highlighted: boolean;
  context: RowContext;
}) {
  const expanded = context.expanded.has(step.id);
  const length = lengthOf(step, context.now);
  const running = step.status === "running";
  return (
    <li data-step={step.id} className={cn("list-none scroll-mt-40", RAIL)}>
      <div className="flex items-center gap-1.5">
        <span className="relative z-[1] grid w-7 shrink-0 place-items-center">
          <span
            aria-hidden
            className={cn(
              "size-2 rounded-full border border-muted-foreground/50 bg-sidebar",
              running && "animate-pulse motion-reduce:animate-none",
            )}
          />
        </span>
        <button
          type="button"
          aria-expanded={expanded}
          disabled={step.detail === null}
          onClick={() => context.onToggle(step.id)}
          className={cn(
            PANEL_ROW,
            "h-6 min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 text-[11px] text-muted-foreground disabled:cursor-default",
            highlighted && "bg-accent text-foreground",
          )}
        >
          <span className="truncate">
            {running ? "Thinking" : `Thought for ${formatElapsed(length)}`}
          </span>
        </button>
      </div>
      <Collapsible open={expanded}>
        <StepDetail step={step} context={context} />
      </Collapsible>
    </li>
  );
}

/**
 * Steps as a line of nodes, top to bottom. In order, long thoughts sit
 * between the cards and runs of one action fold into a card; by slowest,
 * every step is its own card.
 */
export function StepFlow({
  steps,
  order,
  context,
  highlighted,
  grouped = true,
}: {
  steps: readonly Step[];
  order: "order" | "slowest";
  context: RowContext;
  highlighted: string | null;
  grouped?: boolean;
}) {
  const longest = Math.max(1, ...steps.map((step) => lengthOf(step, context.now)));
  const items: FlowItem[] =
    order === "slowest"
      ? [...steps]
          .sort((a, b) => lengthOf(b, context.now) - lengthOf(a, context.now))
          .map((step) => ({ type: "step", step }))
      : grouped
        ? flowOf(steps, context.now)
        : steps.map((step) => ({ type: "step", step }));
  return (
    <ol className="m-0 flex flex-col gap-0.5 p-0">
      {items.map((item) =>
        item.type === "group" ? (
          <GroupItem
            key={item.id}
            id={item.id}
            steps={item.steps}
            longest={longest}
            highlighted={highlighted}
            context={context}
          />
        ) : item.type === "thought" ? (
          <ThoughtItem
            key={item.step.id}
            step={item.step}
            highlighted={item.step.id === highlighted}
            context={context}
          />
        ) : (
          <StepItem
            key={item.step.id}
            step={item.step}
            longest={longest}
            highlighted={item.step.id === highlighted}
            context={context}
          />
        ),
      )}
    </ol>
  );
}
