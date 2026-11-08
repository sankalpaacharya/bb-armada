import type { Step } from "./steps";

/** Thinking shorter than this is left off the flow; the ribbon still counts it. */
export const THOUGHT_SHOWN_MS = 2_000;

/** This many steps in a row with the same verb fold into one card. */
export const GROUP_MIN = 3;

export type FlowItem =
  | { type: "step"; step: Step }
  | { type: "group"; id: string; steps: readonly Step[] }
  | { type: "thought"; step: Step };

const lengthOf = (step: Step, now: number): number =>
  Math.max((step.endedAt ?? now) - step.startedAt, 0);

const sameRun = (a: Step, b: Step): boolean =>
  a.kind === b.kind && a.verb === b.verb && a.children.length === 0;

/**
 * Steps in order as cards to read top to bottom: long thoughts become notes
 * between cards, short ones drop out, and runs of the same action fold into
 * one card. A running step never folds, so what is happening now stays in view.
 */
export function flowOf(steps: readonly Step[], now: number): FlowItem[] {
  const items: FlowItem[] = [];
  let run: Step[] = [];
  const flush = () => {
    if (run.length >= GROUP_MIN)
      items.push({ type: "group", id: `group:${run[0]!.id}`, steps: run });
    else for (const step of run) items.push({ type: "step", step });
    run = [];
  };
  for (const step of steps) {
    if (step.kind === "think") {
      if (lengthOf(step, now) < THOUGHT_SHOWN_MS && step.status !== "running")
        continue;
      flush();
      items.push({ type: "thought", step });
      continue;
    }
    const last = run.at(-1);
    if (
      last !== undefined &&
      (!sameRun(last, step) || step.status === "running")
    )
      flush();
    run.push(step);
  }
  flush();
  return items;
}

const HOME = /^\/(?:Users|home)\/[^/]+(?=\/|$)/;

/** A path as people read it: the home folder as `~`. */
export const tildePath = (path: string): string => path.replace(HOME, "~");

const parentOf = (path: string): string => {
  const cut = path.lastIndexOf("/");
  return cut <= 0 ? path : path.slice(0, cut);
};

const CD_PREFIX = /^\s*cd\s+("[^"]+"|'[^']+'|\S+)\s*(?:&&|;)/;

/** The folder a command ran in, when it starts by changing into one. */
export function commandFolder(command: string): string | null {
  const match = CD_PREFIX.exec(command);
  if (match === null) return null;
  return tildePath(match[1]!.replace(/^["']|["']$/g, ""));
}

/** The muted second line of a step's card. */
export function stepPlace(step: Step): string {
  if (step.kind === "agent")
    return step.children.length === 1
      ? "Subagent, 1 step"
      : `Subagent, ${step.children.length} steps`;
  if (step.path !== null) return `${step.verb} in ${tildePath(parentOf(step.path))}`;
  if (step.detail !== null && (step.kind === "run" || step.kind === "read")) {
    const folder = commandFolder(step.detail);
    if (folder !== null) return `${step.verb} in ${folder}`;
  }
  return step.verb;
}

const GROUP_NOUNS: Record<string, [string, string]> = {
  Read: ["file", "files"],
  Viewed: ["image", "images"],
  Edited: ["file", "files"],
  Created: ["file", "files"],
  Deleted: ["file", "files"],
  Ran: ["command", "commands"],
  Searched: ["search", "searches"],
  Listed: ["folder", "folders"],
  Fetched: ["page", "pages"],
};

/** A folded run's title: "Read 6 files", "Ran 4 commands". */
export function groupTitle(steps: readonly Step[]): string {
  const verb = steps[0]?.verb ?? "";
  const nouns = GROUP_NOUNS[verb];
  if (nouns === undefined) return `${verb} ${steps.length} times`;
  return `${verb} ${steps.length} ${steps.length === 1 ? nouns[0] : nouns[1]}`;
}
