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
