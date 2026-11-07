import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  experimental_useSidebarThreads,
  useBbNavigate,
  useRpc,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useCaptainRegistry } from "@/hooks/use-captain-registry";
import {
  buildArmada,
  pickableProjects,
  type CaptainEntry,
  type ProjectGroup,
} from "@/lib/model";
import type { rpcContract } from "@/lib/rpc";
import { laneOf } from "@/lib/status";
import { parseBooleanMap, readStored, writeStored } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { CaptainDialog, type CaptainDialogState } from "./captain-dialog";
import { captainItems, makeCaptainItem } from "./captain-menu";
import { CaptainTile } from "./captain-tile";
import { LaneGlyph } from "./lane-glyph";
import { ThreadRow } from "./thread-row";

const COLLAPSED_GROUPS_KEY = "armada/collapsed-groups";
const CAPTAIN_TOGGLES_KEY = "armada/captain-toggles";

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function usePersistedMap(
  key: string,
): [Record<string, boolean>, (id: string, value: boolean) => void] {
  const [map, setMap] = useState(() => readStored(key, parseBooleanMap, {}));
  const set = (id: string, value: boolean) =>
    setMap((current) => {
      const next = { ...current, [id]: value };
      writeStored(key, JSON.stringify(next));
      return next;
    });
  return [map, set];
}

function SectionHeader({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-7 items-center justify-between px-2 pt-2">
      <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="px-2 py-2 text-xs text-muted-foreground">{children}</p>;
}

function captainDetail(
  entry: CaptainEntry,
  projectName: string | null,
): ReactNode {
  const parts: string[] = [];
  if (entry.counts.working > 0) parts.push(`${entry.counts.working} working`);
  if (entry.counts.attention > 0)
    parts.push(`${entry.counts.attention} needs you`);
  const text = parts.length > 0 ? parts.join(" · ") : (projectName ?? "");
  return text === "" ? null : (
    <span className="block truncate text-[11.5px] text-muted-foreground">
      {text}
    </span>
  );
}

function focusRow(
  container: HTMLElement | null,
  from: Element | null,
  step: 1 | -1,
) {
  const anchors = Array.from(
    container?.querySelectorAll<HTMLElement>("[data-armada-anchor]") ?? [],
  );
  const index = anchors.findIndex((anchor) => anchor === from);
  anchors[Math.min(anchors.length - 1, Math.max(0, index + step))]?.focus();
}

export function ArmadaList({
  activeThreadId,
  activeProjectId,
  onNavigate,
}: PluginThreadListProps) {
  const { status, threads, projects } = experimental_useSidebarThreads();
  const registry = useCaptainRegistry();
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const now = useNow(30_000);
  const [dialog, setDialog] = useState<CaptainDialogState | null>(null);
  const [collapsed, setCollapsed] = usePersistedMap(COLLAPSED_GROUPS_KEY);
  const [toggles, setToggle] = usePersistedMap(CAPTAIN_TOGGLES_KEY);
  const listRef = useRef<HTMLDivElement>(null);

  const model = useMemo(
    () => buildArmada(threads, projects, registry),
    [threads, projects, registry],
  );
  const pickable = useMemo(() => pickableProjects(projects), [projects]);
  const projectName = (projectId: string) =>
    projects.find((project) => project.id === projectId)?.name ?? null;

  const open = (threadId: string, split: boolean) => {
    navigate.toThread(threadId, { split });
    onNavigate();
  };

  const removeCaptain = (threadId: string) => {
    rpc.call("captains_remove", { threadId }).catch((cause: unknown) => {
      toast.error("Could not remove the captain", {
        description: cause instanceof Error ? cause.message : String(cause),
      });
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      !(event.target instanceof HTMLElement) ||
      !event.target.matches("[data-armada-anchor]")
    )
      return;
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    focusRow(listRef.current, event.target, event.key === "ArrowDown" ? 1 : -1);
  };

  const newCaptain = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="New captain"
      className="size-6 text-muted-foreground"
      onClick={() => setDialog({ kind: "create" })}
    >
      <Icon name="Plus" className="size-3.5" />
    </Button>
  );

  const renderCaptain = (entry: CaptainEntry) => {
    const { thread, record } = entry;
    const hasWorkers = entry.workers.length > 0;
    const isOpen =
      toggles[thread.id] ??
      entry.workers.some((worker) => laneOf(worker) !== null);
    const label = isOpen ? "Hide workers" : "Show workers";
    return (
      <Fragment key={thread.id}>
        <ThreadRow
          thread={thread}
          kind="captain"
          lane={entry.lane}
          activityAt={thread.updatedAt}
          now={now}
          active={thread.id === activeThreadId}
          before={
            hasWorkers ? (
              <button
                type="button"
                aria-expanded={isOpen}
                aria-label={label}
                title={label}
                onClick={() => setToggle(thread.id, !isOpen)}
                className="grid size-5 shrink-0 cursor-pointer place-items-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon
                  name="ChevronRight"
                  className={cn(
                    "size-3.5 transition-transform",
                    isOpen && "rotate-90",
                  )}
                />
              </button>
            ) : (
              <span aria-hidden="true" className="size-5 shrink-0" />
            )
          }
          tile={<CaptainTile logo={record.logo} color={record.color} />}
          detail={captainDetail(entry, projectName(thread.projectId))}
          inline={captainItems(record, {
            changeLogo: () => setDialog({ kind: "edit", thread, record }),
            remove: () => removeCaptain(thread.id),
          })}
          onOpen={open}
        />
        {hasWorkers && isOpen ? (
          <li className="list-none">
            <ul
              aria-label={`Workers of ${thread.displayTitle}`}
              className="m-0 ml-[18px] space-y-px border-l border-sidebar-border p-0 pl-2"
            >
              {entry.workers.map((worker) => (
                <ThreadRow
                  key={worker.id}
                  thread={worker}
                  kind="worker"
                  lane={laneOf(worker)}
                  activityAt={worker.updatedAt}
                  now={now}
                  active={worker.id === activeThreadId}
                  onOpen={open}
                />
              ))}
            </ul>
          </li>
        ) : null}
      </Fragment>
    );
  };

  const renderGroup = (group: ProjectGroup) => {
    const key = group.project.id;
    const isCollapsed = collapsed[key] === true;
    return (
      <section key={key} className="mb-1">
        <button
          type="button"
          aria-expanded={!isCollapsed}
          onClick={() => setCollapsed(key, !isCollapsed)}
          className="flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-md px-2 text-left text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon
            name="ChevronRight"
            className={cn(
              "size-3 shrink-0 transition-transform",
              !isCollapsed && "rotate-90",
            )}
          />
          <span className="min-w-0 flex-1 truncate">{group.project.name}</span>
          {isCollapsed ? <LaneGlyph lane={group.lane} /> : null}
        </button>
        {isCollapsed ? null : (
          <ul className="m-0 space-y-px p-0">
            {group.threads.map((entry) => (
              <ThreadRow
                key={entry.thread.id}
                thread={entry.thread}
                kind="thread"
                lane={entry.lane}
                activityAt={entry.activityAt}
                now={now}
                active={entry.thread.id === activeThreadId}
                inline={
                  entry.thread.parentThreadId === null
                    ? [
                        makeCaptainItem(() =>
                          setDialog({ kind: "adopt", thread: entry.thread }),
                        ),
                      ]
                    : undefined
                }
                onOpen={open}
              />
            ))}
          </ul>
        )}
      </section>
    );
  };

  return (
    <div
      ref={listRef}
      onKeyDown={onKeyDown}
      className="armada-root flex min-h-full shrink-0 flex-col px-1.5 pb-2"
    >
      <SectionHeader title="Captains">{newCaptain}</SectionHeader>
      {model.captains.length > 0 ? (
        <ul className="m-0 space-y-px p-0">
          {model.captains.map(renderCaptain)}
        </ul>
      ) : (
        <Note>No captains yet</Note>
      )}
      <SectionHeader title="Threads" />
      {status === "loading" ? (
        <Note>Loading threads…</Note>
      ) : status === "error" && threads.length === 0 ? (
        <Note>Could not load threads</Note>
      ) : model.groups.length === 0 ? (
        <Note>No threads yet</Note>
      ) : (
        model.groups.map(renderGroup)
      )}
      {dialog === null ? null : (
        <CaptainDialog
          state={dialog}
          projects={pickable}
          activeProjectId={activeProjectId}
          onClose={() => setDialog(null)}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
}
