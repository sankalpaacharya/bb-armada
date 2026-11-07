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
  scope,
  onChange,
  onClose,
}: {
  projects: readonly PluginSidebarProject[];
  scope: ThreadScope;
  onChange: (scope: ThreadScope) => void;
  onClose: () => void;
}) {
  const options: { id: ThreadScope; name: string }[] = [
    { id: null, name: "All projects" },
    ...projects.map((project) => ({ id: project.id, name: project.name })),
  ];
  return (
    <ul
      id="armada-scope-list"
      aria-label="Show threads from"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      className="m-0 mb-1 flex list-none flex-col gap-px rounded-md bg-sidebar-accent/30 p-1"
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
                "flex h-7 w-full cursor-pointer items-center gap-2 rounded px-2 text-left text-[13px] text-muted-foreground outline-none hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring",
                selected && "text-foreground",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{option.name}</span>
              {selected ? (
                <Icon name="Check" className="size-3.5 shrink-0" />
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
