import { useEffect, useId, useMemo, useRef, useState } from "react";
import type {
  PluginSidebarProject,
  PluginSidebarThread,
  PluginSidebarThreadsState,
} from "@get-bb/plugin-sdk/app";

import { Icon } from "@/components/ui/icon";
import { useStoredState } from "@/hooks/use-stored-state";
import type { ThreadEntry } from "@/lib/model";
import {
  countByProject,
  parseScope,
  resolveScope,
  scopeThreads,
} from "@/lib/scope";
import { HEADER_ACTION } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { makeCaptainItem } from "./captain-menu";
import { ChoiceList, type Choice } from "./choice-list";
import { Note, SectionHeader } from "./section";
import { ThreadCard } from "./thread-card";
import type { OpenThread } from "./thread-link";

const SCOPE_KEY = "armada/thread-scope";

export function ThreadsSection({
  entries,
  projects,
  status,
  activeThreadId,
  now,
  onOpen,
  onAdopt,
}: {
  entries: readonly ThreadEntry[];
  /** Pickable projects, in picker order. */
  projects: readonly PluginSidebarProject[];
  status: PluginSidebarThreadsState["status"] | "loading-captains";
  activeThreadId: string | null;
  now: number;
  onOpen: OpenThread;
  onAdopt: (thread: PluginSidebarThread) => void;
}) {
  const [storedScope, setScope] = useStoredState(SCOPE_KEY, parseScope, null);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const sectionRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const scope = resolveScope(storedScope, projects);
  const scoped = useMemo(() => scopeThreads(entries, scope), [entries, scope]);
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

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
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
        actions={
          <button
            ref={triggerRef}
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={`Threads from ${scopeName ?? "All projects"}`}
            onClick={() => setOpen((current) => !current)}
            className={cn(
              HEADER_ACTION,
              "flex h-6 w-auto max-w-[60%] min-w-0 gap-1 px-1.5 text-[12px]",
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
            setScope(next);
            close(true);
          }}
          onClose={() => close(true)}
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
          {scopeName === null
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
              now={now}
              inline={
                entry.adoptable
                  ? [makeCaptainItem(() => onAdopt(entry.thread))]
                  : undefined
              }
              onOpen={onOpen}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
