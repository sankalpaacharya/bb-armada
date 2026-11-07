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
import { withoutLeadingEmoji } from "@/lib/captain-text";
import { buildArmada, pickableProjects, type CaptainEntry } from "@/lib/model";
import type { rpcContract } from "@/lib/rpc";
import {
  parseScope,
  resolveScope,
  scopeThreads,
  type ThreadScope,
} from "@/lib/scope";
import { isLive, statusOf } from "@/lib/status";
import { parseBooleanMap, readStored, writeStored } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { CaptainDialog, type CaptainDialogState } from "./captain-dialog";
import { captainItems, makeCaptainItem } from "./captain-menu";
import { CaptainTile } from "./captain-tile";
import { ScopeList, ScopeTrigger, scopeLabel } from "./scope-picker";
import { ThreadRow } from "./thread-row";

const CAPTAIN_TOGGLES_KEY = "armada/captain-toggles";
const THREAD_SCOPE_KEY = "armada/thread-scope";
const WORKER_PREVIEW = 5;

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

function useStoredScope(): [ThreadScope, (scope: ThreadScope) => void] {
  const [scope, setScope] = useState(() =>
    readStored<ThreadScope>(THREAD_SCOPE_KEY, parseScope, null),
  );
  const set = (next: ThreadScope) => {
    setScope(next);
    writeStored(THREAD_SCOPE_KEY, JSON.stringify(next));
  };
  return [scope, set];
}

const HEADER_ACTION =
  "size-6 rounded-md text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground";

function SectionHeader({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <h2 className="mt-3 flex h-8 items-center justify-between gap-2 px-2.5 first:mt-0">
      <span className="text-[13px] font-normal text-muted-foreground">
        {title}
      </span>
      {children}
    </h2>
  );
}

function Note({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("px-2.5 py-1.5 text-sm text-muted-foreground", className)}>
      {children}
    </p>
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
  const [toggles, setToggle] = usePersistedMap(CAPTAIN_TOGGLES_KEY);
  const [storedScope, setScope] = useStoredScope();
  const [scopeOpen, setScopeOpen] = useState(false);
  const [allWorkers, setAllWorkers] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const listRef = useRef<HTMLDivElement>(null);

  const model = useMemo(
    () => buildArmada(threads, projects, registry),
    [threads, projects, registry],
  );
  const pickable = useMemo(() => pickableProjects(projects), [projects]);
  const scope = resolveScope(storedScope, projects);
  const scoped = useMemo(
    () => scopeThreads(model.threads, scope),
    [model.threads, scope],
  );
  const scopeName =
    projects.find((project) => project.id === scope)?.name ?? null;

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

  const renderCaptain = (entry: CaptainEntry) => {
    const { thread, record } = entry;
    const title = withoutLeadingEmoji(thread.displayTitle);
    const hasWorkers = entry.workers.length > 0;
    const isOpen =
      toggles[thread.id] ??
      entry.workers.some((worker) => isLive(statusOf(worker)));
    const label = isOpen ? "Hide workers" : "Show workers";
    const showAll = allWorkers.has(thread.id);
    const workers = showAll
      ? entry.workers
      : entry.workers.slice(0, WORKER_PREVIEW);
    const hidden = entry.workers.length - workers.length;
    return (
      <Fragment key={thread.id}>
        <ThreadRow
          thread={thread}
          kind="captain"
          status={entry.status}
          activityAt={thread.updatedAt}
          now={now}
          active={thread.id === activeThreadId}
          title={title}
          avatar={<CaptainTile logo={record.logo} color={record.color} />}
          toggle={
            hasWorkers ? (
              <button
                type="button"
                aria-expanded={isOpen}
                aria-label={label}
                title={label}
                onClick={() => setToggle(thread.id, !isOpen)}
                className="pointer-events-auto grid size-4 shrink-0 cursor-pointer place-items-center rounded text-muted-foreground opacity-0 outline-none group-hover/row:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon
                  name="ChevronRight"
                  className={cn(
                    "size-3.5 transition-transform",
                    isOpen && "rotate-90",
                  )}
                />
              </button>
            ) : null
          }
          inline={captainItems(record, {
            changeLogo: () => setDialog({ kind: "edit", thread, record }),
            remove: () => removeCaptain(thread.id),
          })}
          onOpen={open}
        />
        {hasWorkers && isOpen ? (
          <li className="list-none">
            <ul
              aria-label={`Workers of ${title}`}
              className="m-0 flex flex-col gap-px p-0"
            >
              {workers.map((worker) => (
                <ThreadRow
                  key={worker.id}
                  thread={worker}
                  kind="worker"
                  status={statusOf(worker)}
                  activityAt={worker.updatedAt}
                  now={now}
                  active={worker.id === activeThreadId}
                  onOpen={open}
                />
              ))}
              {hidden > 0 ? (
                <li className="list-none">
                  <button
                    type="button"
                    onClick={() =>
                      setAllWorkers((current) =>
                        new Set(current).add(thread.id),
                      )
                    }
                    className="flex h-7 w-full cursor-pointer items-center rounded-md pr-2.5 pl-9 text-left text-2xs text-muted-foreground outline-none hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {hidden} more
                  </button>
                </li>
              ) : null}
            </ul>
          </li>
        ) : null}
      </Fragment>
    );
  };

  return (
    <div
      ref={listRef}
      onKeyDown={onKeyDown}
      className="flex min-h-full shrink-0 flex-col px-1.5 pb-2"
    >
      <SectionHeader title="Captains">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="New captain"
          className={HEADER_ACTION}
          onClick={() => setDialog({ kind: "create" })}
        >
          <Icon name="Plus" className="size-4" />
        </Button>
      </SectionHeader>
      {model.captains.length > 0 ? (
        <ul aria-label="Captains" className="m-0 flex flex-col gap-px p-0">
          {model.captains.map(renderCaptain)}
        </ul>
      ) : (
        <Note className="pl-9">
          Start a captain to run a project from one chat.
        </Note>
      )}
      <SectionHeader title="Threads">
        <ScopeTrigger
          label={scopeLabel(pickable, scope)}
          open={scopeOpen}
          onToggle={() => setScopeOpen((current) => !current)}
        />
      </SectionHeader>
      {scopeOpen ? (
        <ScopeList
          projects={pickable}
          scope={scope}
          onChange={setScope}
          onClose={() => setScopeOpen(false)}
        />
      ) : null}
      {status === "loading" ? (
        <Note>Loading threads…</Note>
      ) : status === "error" && threads.length === 0 ? (
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
            <ThreadRow
              key={entry.thread.id}
              thread={entry.thread}
              kind="thread"
              status={entry.status}
              activityAt={entry.activityAt}
              now={now}
              active={entry.thread.id === activeThreadId}
              project={scope === null ? { name: entry.projectName } : undefined}
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
