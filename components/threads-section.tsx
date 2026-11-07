import { useMemo } from "react";
import type {
  PluginSidebarProject,
  PluginSidebarThread,
  PluginSidebarThreadsState,
} from "@get-bb/plugin-sdk/app";

import type { ParkActions } from "@/hooks/use-park-actions";
import type { ThreadEntry } from "@/lib/model";
import {
  ALL_PROJECTS,
  countByProject,
  toggleScope,
  type ThreadScope,
} from "@/lib/scope";
import { HEADER_ACTION, SECTION_TEXT } from "@/lib/styles";
import { cn } from "@/lib/utils";
import type { Choice } from "./choice-list";
import { Dropdown } from "./dropdown";
import { makeCaptainItem, parkItems } from "./menu-items";
import { Note, SectionHeader } from "./section";
import { ThreadCard } from "./thread-card";
import type { OpenThread } from "./thread-link";

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
  const chosenNames = scope.flatMap((id) => {
    const name = projects.find((project) => project.id === id)?.name;
    return name === undefined ? [] : [name];
  });
  const scopeName =
    chosenNames.length === 0
      ? null
      : chosenNames.length === 1
        ? chosenNames[0]
        : `${chosenNames[0]} +${chosenNames.length - 1}`;
  const choices: Choice<string | null>[] = [
    { id: null, label: "All projects", icon: "Layers", count: entries.length },
    ...projects.map((project) => ({
      id: project.id,
      label: project.name,
      icon: "Folder",
      count: counts.get(project.id) ?? 0,
    })),
  ];

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
            isSelected={(id) =>
              id === null ? scope.length === 0 : scope.includes(id)
            }
            onPick={(id) =>
              onScope(id === null ? ALL_PROJECTS : toggleScope(scope, id))
            }
            multiselectable
            keepOpen={(id) => id !== null}
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
              : chosenNames.length === 1
                ? `No threads in ${scopeName} yet.`
                : "No threads in these projects yet."}
        </Note>
      ) : (
        <ul aria-label="Threads" className="m-0 flex flex-col gap-0.5 p-0">
          {scoped.map((entry) => (
            <ThreadCard
              key={entry.thread.id}
              entry={entry}
              active={entry.thread.id === activeThreadId}
              showProject={scope.length !== 1}
              parkActions={parkActions}
              inline={[
                ...(entry.adoptable
                  ? [makeCaptainItem(() => onAdopt(entry.thread))]
                  : []),
                ...parkItems(entry, parkActions),
              ]}
              onOpen={onOpen}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
