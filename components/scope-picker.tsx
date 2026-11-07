import type { PluginSidebarProject } from "@get-bb/plugin-sdk/app";

import { Icon } from "@/components/ui/icon";
import type { ThreadScope } from "@/lib/scope";
import { cn } from "@/lib/utils";

export function scopeLabel(
  projects: readonly PluginSidebarProject[],
  scope: ThreadScope,
): string {
  return (
    projects.find((project) => project.id === scope)?.name ?? "All projects"
  );
}

export function ScopeTrigger({
  label,
  open,
  onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls="armada-scope-list"
      aria-label={`Threads from ${label}`}
      onClick={onToggle}
      className={cn(
        "flex h-6 max-w-[60%] min-w-0 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[12px] text-muted-foreground outline-none hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring",
        open && "bg-sidebar-accent/60 text-foreground",
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      <Icon
        name="ChevronDown"
        className={cn(
          "size-3 shrink-0 transition-transform",
          open && "rotate-180",
        )}
      />
    </button>
  );
}

export function ScopeList({
  projects,
  counts,
  scope,
  onChange,
  onClose,
}: {
  projects: readonly PluginSidebarProject[];
  counts: ReadonlyMap<string, number>;
  scope: ThreadScope;
  onChange: (scope: ThreadScope) => void;
  onClose: () => void;
}) {
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  const options: {
    id: ThreadScope;
    name: string;
    icon: string;
    count: number;
  }[] = [
    { id: null, name: "All projects", icon: "Layers", count: total },
    ...projects.map((project) => ({
      id: project.id,
      name: project.name,
      icon: "Folder",
      count: counts.get(project.id) ?? 0,
    })),
  ];
  return (
    <ul
      id="armada-scope-list"
      aria-label="Show threads from"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      className="m-0 mb-2 flex max-h-64 list-none flex-col gap-px overflow-y-auto p-0"
    >
      {options.map((option) => {
        const selected = option.id === scope;
        return (
          <li key={option.id ?? "all"}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => {
                onChange(option.id);
                onClose();
              }}
              className={cn(
                "flex h-7 w-full cursor-pointer items-center gap-2 rounded-md px-2.5 text-left text-[13px] text-muted-foreground outline-none hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring",
                selected &&
                  "bg-sidebar-accent text-foreground hover:bg-sidebar-accent",
              )}
            >
              <Icon
                name={option.icon}
                className="size-3.5 shrink-0 text-muted-foreground"
              />
              <span className="min-w-0 flex-1 truncate">{option.name}</span>
              {option.count > 0 ? (
                <span className="shrink-0 text-2xs tabular-nums text-muted-foreground/70">
                  {option.count}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
