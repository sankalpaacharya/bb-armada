import { z } from "zod";

import { captainSlug } from "./captain-text";

/** Where a captain keeps its memory, as the armada skill lays it out. */
export const homeFolder = (projectName: string): string =>
  `~/.bb/captains/${captainSlug(projectName)}`;

const SUPERVISOR_LINE =
  /^[\s>*_-]*(?:Crew captain|Supervisor)[*_]*:[*_\s]*`?(thr_[A-Za-z0-9_]+)/im;

/** The crew captain a home's backlog names on its `Crew captain:` line, or an older home's `Supervisor:` line. */
export function supervisorIdOf(backlog: string): string | null {
  return SUPERVISOR_LINE.exec(backlog)?.[1] ?? null;
}

/** Older homes call the section "Waiting on captain". */
const WAITING_HEADING = /^##\s+Waiting on (?:the user|captain)\s*$/i;
const HEADING = /^#{1,6}\s/;
const BULLET = /^[-*]\s+(.*\S)\s*$/;
const PLACEHOLDER = /^\(.*\)$/;

/** The decisions under a backlog's Waiting on the user, one per top-level bullet. */
export function waitingOnUser(backlog: string): string[] {
  const lines = backlog.split(/\r?\n/);
  const start = lines.findIndex((line) => WAITING_HEADING.test(line));
  if (start === -1) return [];
  const items: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (HEADING.test(line)) break;
    const text = BULLET.exec(line)?.[1];
    if (text !== undefined && !PLACEHOLDER.test(text)) items.push(text);
  }
  return items;
}

/** A decision left unanswered this long stops showing as Needs you. */
export const NEEDS_YOU_TTL_MS = 4 * 60 * 60 * 1000;

export const needsYouSeenSchema = z.record(z.string(), z.number());

/**
 * The decisions still within their time, and when each was first seen. A
 * backlog line carries no reliable time of its own, so the first read starts
 * its clock; a line that leaves the backlog is forgotten.
 */
export function expireNeedsYou(
  items: readonly string[],
  seen: Readonly<Record<string, number>>,
  now: number,
): { fresh: string[]; seen: Record<string, number> } {
  const next = Object.fromEntries(
    items.map((item) => [item, seen[item] ?? now]),
  );
  return {
    fresh: items.filter((item) => now - next[item]! < NEEDS_YOU_TTL_MS),
    seen: next,
  };
}

/**
 * A markdown file at most three folders deep, named relative to its home. A
 * segment cannot start with a dot, which rules out `..` and hidden files.
 */
const HOME_FILE_PATH =
  /^(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/){0,2}[A-Za-z0-9_-][A-Za-z0-9._-]*\.md$/;

export const homeFilePathSchema = z
  .string()
  .max(200)
  .regex(HOME_FILE_PATH, "Not a markdown file inside the home");

const homeFileSchema = z.object({
  path: homeFilePathSchema,
  sizeBytes: z.number().int().nonnegative(),
  modifiedAt: z.number().nullable(),
});

export type HomeFile = z.infer<typeof homeFileSchema>;

export const captainHomeSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("missing"), folder: z.string() }),
  z.object({
    status: z.literal("ready"),
    folder: z.string(),
    root: z.string(),
    files: z.array(homeFileSchema),
    /** The backlog's open decisions, from {@link waitingOnUser}. */
    needsYou: z.array(z.string()),
  }),
]);

export type CaptainHome = z.infer<typeof captainHomeSchema>;

export type MemoryNode =
  | { kind: "file"; name: string; file: HomeFile }
  | { kind: "folder"; name: string; path: string; children: MemoryNode[] };

/** Startup memory first, then the rest of the home, then a task's own files. */
const FILE_ORDER = [
  "captain.md",
  "learnings.md",
  "backlog.md",
  "crew.md",
  "supervisor.md",
  "archive.md",
  "brief.md",
  "steers.md",
  "report.md",
];

const rankOf = (name: string): number => {
  const rank = FILE_ORDER.indexOf(name);
  return rank === -1 ? FILE_ORDER.length : rank;
};

function sortNodes(nodes: MemoryNode[]): MemoryNode[] {
  for (const node of nodes) if (node.kind === "folder") sortNodes(node.children);
  return nodes.sort(
    (a, b) =>
      (a.kind === b.kind ? 0 : a.kind === "file" ? -1 : 1) ||
      (a.kind === "file" ? rankOf(a.name) - rankOf(b.name) : 0) ||
      a.name.localeCompare(b.name),
  );
}

const splitPath = (path: string): [folder: string, name: string] => {
  const slash = path.lastIndexOf("/");
  return [slash === -1 ? "" : path.slice(0, slash), path.slice(slash + 1)];
};

/** A home's files as folders and files, each level with its files first. */
export function memoryTree(files: readonly HomeFile[]): MemoryNode[] {
  const root: MemoryNode[] = [];
  const folders = new Map<string, MemoryNode[]>([["", root]]);
  const folderOf = (path: string): MemoryNode[] => {
    const known = folders.get(path);
    if (known !== undefined) return known;
    const [parent, name] = splitPath(path);
    const children: MemoryNode[] = [];
    folderOf(parent).push({ kind: "folder", name, path, children });
    folders.set(path, children);
    return children;
  };
  for (const file of files) {
    const [folder, name] = splitPath(file.path);
    folderOf(folder).push({ kind: "file", name, file });
  }
  return sortNodes(root);
}
