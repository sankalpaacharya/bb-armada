import type { PluginSidebarProject } from "@get-bb/plugin-sdk/app";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ThreadScope } from "@/lib/scope";

const ALL_PROJECTS = "armada:all-projects";

export function ScopePicker({
  projects,
  scope,
  onChange,
}: {
  projects: readonly PluginSidebarProject[];
  scope: ThreadScope;
  onChange: (scope: ThreadScope) => void;
}) {
  const label =
    projects.find((project) => project.id === scope)?.name ?? "All projects";
  return (
    <Select
      value={scope ?? ALL_PROJECTS}
      onValueChange={(value) => onChange(value === ALL_PROJECTS ? null : value)}
    >
      <SelectTrigger
        aria-label={`Threads from ${label}`}
        className="h-6 w-auto max-w-[60%] gap-1 rounded-md border-0 px-1.5 py-0 text-[12px] text-muted-foreground shadow-none hover:bg-sidebar-accent/60 hover:text-foreground focus:ring-0 focus-visible:ring-1 data-[state=open]:bg-sidebar-accent/60 [&>svg]:size-3 [&>svg]:shrink-0"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_PROJECTS}>All projects</SelectItem>
        {projects.map((project) => (
          <SelectItem key={project.id} value={project.id}>
            {project.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
