import { useMemo } from "react";
import type {
  PluginSidebarProject,
  PluginSidebarThread,
  PluginSidebarThreadsState,
} from "@get-bb/plugin-sdk/app";

import { Icon } from "@/components/ui/icon";
import type { ParkActions } from "@/hooks/use-park-actions";
import { useStoredState } from "@/hooks/use-stored-state";
import type { ThreadEntry } from "@/lib/model";
import {
  countByProject,
  layoutThreads,
  type ProjectGroup,
  type ThreadScope,
} from "@/lib/scope";
import { parseBooleanMap } from "@/lib/storage";
import { FOCUS_RING, HEADER_ACTION, SECTION_TEXT } from "@/lib/styles";
import { cn } from "@/lib/utils";
import type { Choice } from "./choice-list";
import { Dropdown } from "./dropdown";
import { makeCaptainItem, parkItems } from "./menu-items";
import { Note, SectionHeader } from "./section";
import { StatusGlyph } from "./status-mark";
import { ThreadCard } from "./thread-card";
import type { OpenThread } from "./thread-link";

const COLLAPSED_KEY = "armada/collapsed-projects";

/** A project's header in the full list: its name and a chevron, and while closed, what is live inside. */
function ProjectHeader({
  group,
  onToggle,
}: {
  group: ProjectGroup;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={!group.collapsed}
      onClick={onToggle}
      className={cn(
        "group/project flex h-7 w-full cursor-pointer items-center gap-1 rounded-md pr-2.5 pl-8 text-left text-2xs text-muted-foreground",
        FOCUS_RING,
      )}
    >
      <span className="min-w-0 truncate transition-colors group-hover/project:text-foreground">
        {group.name}
      </span>
      <Icon
        name="ChevronDown"
        className={cn(
          "size-3 shrink-0 text-muted-foreground/60 transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none group-hover/project:text-foreground",
          group.collapsed && "-rotate-90",
        )}
      />
      {group.collapsed && group.status !== null ? (
        <span className="grid size-4 shrink-0 place-items-center">
          <StatusGlyph status={group.status} />
        </span>
      ) : null}
    </button>
  );
}

export function ThreadsSection({
  entries,
  scoped,
  shelvedCount,
  projects,
  scope,
  onScope,
  status,
  activeThreadId,
  parkActions,
  onOpen,
  onAdopt,
}: {
  /** Every active entry, for the picker's counts. */
  entries: readonly ThreadEntry[];
  /** The active entries within the scope. */
  scoped: readonly ThreadEntry[];
  /** Shelved entries within the scope, so an empty list can say where they went. */
  shelvedCount: number;
  /** Pickable projects, in picker order. */
  projects: readonly PluginSidebarProject[];
  scope: ThreadScope;
  onScope: (scope: ThreadScope) => void;
  status: PluginSidebarThreadsState["status"] | "loading-captains";
  activeThreadId: string | null;
  parkActions: ParkActions;
  onOpen: OpenThread;
  onAdopt: (thread: PluginSidebarThread) => void;
}) {
  const counts = useMemo(() => countByProject(entries), [entries]);
  const [collapsed, setCollapsed] = useStoredState(
    COLLAPSED_KEY,
    parseBooleanMap,
    {},
  );
  const layout = useMemo(
    () => layoutThreads(scoped, scope, collapsed),
    [scoped, scope, collapsed],
  );
  const scopeName =
    projects.find((project) => project.id === scope)?.name ?? null;
  const choices: Choice<string | null>[] = [
    { id: null, label: "All projects", icon: "Layers", count: entries.length },
    ...projects.map((project) => ({
      id: project.id,
      label: project.name,
      icon: "Folder",
      count: counts.get(project.id) ?? 0,
    })),
  ];

  const card = (entry: ThreadEntry) => (
    <ThreadCard
      key={entry.thread.id}
      entry={entry}
      active={entry.thread.id === activeThreadId}
      showProject={scope === null}
      parkActions={parkActions}
      inline={[
        ...(entry.adoptable
          ? [makeCaptainItem(() => onAdopt(entry.thread))]
          : []),
        ...parkItems(entry, parkActions),
      ]}
      onOpen={onOpen}
    />
  );

  return (
    <section className="flex flex-col gap-1">
      <SectionHeader
        title="Threads"
        count={scoped.length}
        actions={
          <Dropdown
            label="Show threads from"
            triggerLabel={`Threads from ${scopeName ?? "All projects"}`}
            choices={choices}
            value={scope}
            onChange={onScope}
            align="end"
            triggerClassName={cn(
              HEADER_ACTION,
              "flex h-6 w-auto max-w-[60%] min-w-0 gap-1 px-1.5",
              SECTION_TEXT,
            )}
            panelClassName="w-56 max-w-[calc(100%-0.5rem)]"
            listClassName="max-h-64 overflow-y-auto"
          >
            <span className="min-w-0 truncate">
              {scopeName ?? "All projects"}
            </span>
          </Dropdown>
        }
      />
      {status === "loading" || status === "loading-captains" ? (
        <Note>Loading threads…</Note>
      ) : status === "error" && entries.length === 0 ? (
        <Note>Could not load threads</Note>
      ) : scoped.length === 0 ? (
        <Note>
          {shelvedCount > 0
            ? "Nothing active. Inactive, snoozed and settled threads are below."
            : scopeName === null
              ? "No threads yet"
              : `No threads in ${scopeName} yet.`}
        </Note>
      ) : (
        <ul
          aria-label="Threads"
          className={cn(
            "m-0 flex flex-col p-0",
            layout.kind === "grouped" ? "gap-2" : "gap-px",
          )}
        >
          {layout.kind === "flat"
            ? layout.entries.map(card)
            : layout.groups.map((group) => (
                <li key={group.projectId} className="flex list-none flex-col">
                  <ProjectHeader
                    group={group}
                    onToggle={() =>
                      setCollapsed({
                        ...collapsed,
                        [group.projectId]: !group.collapsed,
                      })
                    }
                  />
                  {group.collapsed ? null : (
                    <ul
                      aria-label={group.name}
                      className="m-0 flex flex-col gap-px p-0"
                    >
                      {group.entries.map(card)}
                    </ul>
                  )}
                </li>
              ))}
        </ul>
      )}
    </section>
  );
}
