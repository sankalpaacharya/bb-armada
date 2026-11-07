import type { PluginSidebarProject } from "@get-bb/plugin-sdk/app";

/** Distinct, theme-safe tile colours; listed whole so Tailwind keeps them. */
const TONES = [
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
] as const;

export type ProjectMark = { initial: string; tone: string };

/**
 * A letter and a colour per project, assigned in name order so the first
 * eight projects never share a colour.
 */
export function projectMarks(
  projects: readonly PluginSidebarProject[],
): ReadonlyMap<string, ProjectMark> {
  const byName = [...projects].sort((a, b) => a.name.localeCompare(b.name));
  return new Map(
    byName.map((project, index) => [
      project.id,
      {
        initial: (project.name.trim()[0] ?? "?").toUpperCase(),
        tone: TONES[index % TONES.length],
      },
    ]),
  );
}
