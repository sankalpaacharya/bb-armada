import { useEffect, useId, useMemo, useRef, useState } from "react";
import type {
  PluginSidebarProject,
  PluginSidebarThread,
  PluginSidebarThreadsState,
} from "@get-bb/plugin-sdk/app";

import { Icon } from "@/components/ui/icon";
import type { ParkActions } from "@/hooks/use-park-actions";
import type { ThreadEntry } from "@/lib/model";
import { countByProject, type ThreadScope } from "@/lib/scope";
import { HEADER_ACTION, SECTION_TEXT } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { ChoiceList, type Choice } from "./choice-list";
import { makeCaptainItem, parkItems } from "./menu-items";
import { Note, SectionHeader } from "./section";
import { ThreadCard } from "./thread-card";
import type { OpenThread } from "./thread-link";

export function ThreadsSection({
  entries,
  scoped,
  parkedCount,
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
  /** Parked entries within the scope, so an empty list can say where they went. */
  parkedCount: number;
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
  const [open, setOpen] = useState(false);
  const listId = useId();
  const sectionRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const counts = useMemo(() => countByProject(entries), [entries]);
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

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !sectionRef.current?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={sectionRef} className="contents">
      <SectionHeader
        title="Threads"
        count={scoped.length}
        actions={
          <button
            ref={triggerRef}
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-label={`Threads from ${scopeName ?? "All projects"}`}
            onClick={() => setOpen((current) => !current)}
            className={cn(
              HEADER_ACTION,
              "flex h-6 w-auto max-w-[60%] min-w-0 gap-1 px-1.5",
              SECTION_TEXT,
            )}
          >
            <span className="min-w-0 truncate">
              {scopeName ?? "All projects"}
            </span>
            <Icon
              name="ChevronDown"
              className={cn(
                "size-3 shrink-0 transition-transform",
                open && "rotate-180",
              )}
            />
          </button>
        }
      />
      {open ? (
        <ChoiceList
          id={listId}
          label="Show threads from"
          choices={choices}
          value={scope}
          onChange={(next) => {
            onScope(next);
            close();
          }}
          onClose={close}
          autoFocus
          className="mb-2 max-h-64 overflow-y-auto"
        />
      ) : null}
      {status === "loading" || status === "loading-captains" ? (
        <Note>Loading threads…</Note>
      ) : status === "error" && entries.length === 0 ? (
        <Note>Could not load threads</Note>
      ) : scoped.length === 0 ? (
        <Note>
          {parkedCount > 0
            ? "Nothing active. Settled and snoozed threads are below."
            : scopeName === null
              ? "No threads yet"
              : `No threads in ${scopeName} yet.`}
        </Note>
      ) : (
        <ul aria-label="Threads" className="m-0 flex flex-col gap-px p-0">
          {scoped.map((entry) => (
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
          ))}
        </ul>
      )}
    </div>
  );
}
