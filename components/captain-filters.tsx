import type { PluginSidebarProject } from "@get-bb/plugin-sdk/app";

import type { CaptainFilter } from "@/lib/captain-filter";
import type { CaptainEntry } from "@/lib/model";
import { FOCUS_RING } from "@/lib/styles";
import { cn } from "@/lib/utils";

export function CaptainFilters({
  captains,
  projects,
  value,
  onChange,
}: {
  captains: readonly CaptainEntry[];
  projects: readonly PluginSidebarProject[];
  value: CaptainFilter;
  onChange: (filter: CaptainFilter) => void;
}) {
  const groups = new Map<string, { name: string; count: number }>();
  for (const { thread } of captains) {
    const group = groups.get(thread.projectId);
    if (group !== undefined) {
      group.count += 1;
      continue;
    }
    const project = projects.find((project) => project.id === thread.projectId);
    if (project !== undefined) groups.set(project.id, { name: project.name, count: 1 });
  }
  const choices: {
    label: string;
    filter: CaptainFilter;
    selected: boolean;
    count: number;
  }[] = [
    {
      label: "All",
      filter: { kind: "all" },
      selected: value.kind === "all",
      count: captains.length,
    },
    ...Array.from(groups, ([projectId, group]) => ({
      label: group.name,
      filter: { kind: "project", projectId } satisfies CaptainFilter,
      selected: value.kind === "project" && value.projectId === projectId,
      count: group.count,
    })),
  ];

  return (
    <div
      role="group"
      aria-label="Filter captains"
      className="flex min-w-0 items-center gap-1 overflow-x-auto px-2.5 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {choices.map((choice) => (
        <button
          key={choice.filter.kind === "project" ? choice.filter.projectId : choice.filter.kind}
          type="button"
          aria-pressed={choice.selected}
          aria-label={`${choice.label} (${choice.count})`}
          title={choice.label}
          onClick={() => onChange(choice.filter)}
          className={cn(
            "inline-flex h-6 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2 text-[12px] font-medium transition-colors",
            FOCUS_RING,
            choice.selected
              ? "bg-foreground/85 text-background hover:bg-foreground/90"
              : "bg-sidebar-accent/60 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
          )}
        >
          <span className="max-w-40 truncate">{choice.label}</span>
          <span aria-hidden="true" className="text-[10px] tabular-nums opacity-60">
            {choice.count}
          </span>
        </button>
      ))}
    </div>
  );
}
