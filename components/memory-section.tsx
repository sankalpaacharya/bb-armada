import {
  useMemo,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  experimental_useRpcQuery,
  useBbNavigate,
} from "@get-bb/plugin-sdk/app";

import { useStoredState } from "@/hooks/use-stored-state";
import { memoryTree, type MemoryNode } from "@/lib/captain-home";
import { rpcContract } from "@/lib/rpc";
import { FOCUS_RING, PANEL_ROW, SECTION_TITLE } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { Age } from "./age";
import { Disclosure, EASE_OUT } from "./disclosure";
import { Note } from "./section";
import { Icon } from "./ui/icon";

type FileNode = Extract<MemoryNode, { kind: "file" }>;
type FolderNode = Extract<MemoryNode, { kind: "folder" }>;
type OpenFile = ((path: string) => void) | null;

const ICON = "size-3.5 shrink-0 text-muted-foreground";
const NODE_ROW = cn(PANEL_ROW, "h-7 items-center gap-1.5 px-2");

const HEIGHT_KEY = "armada:memory-height";
const MIN_HEIGHT = 96;
const KEY_STEP = 24;

const defaultHeight = (): number => Math.round(window.innerHeight * 0.4);
const maxHeight = (): number => Math.round(window.innerHeight * 0.8);
const clampHeight = (height: number): number =>
  Math.round(Math.min(Math.max(height, MIN_HEIGHT), maxHeight()));

const parseHeight = (raw: string): number | undefined => {
  const value: unknown = JSON.parse(raw);
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

/**
 * The open folder's height. A drag moves it live and stores it once on
 * release, so the next Crew tab opens at the same height.
 */
function useMemoryHeight() {
  const [stored, setStored] = useStoredState(HEIGHT_KEY, parseHeight, 0);
  const [dragging, setDragging] = useState<number | null>(null);
  const height = clampHeight(dragging ?? (stored || defaultHeight()));
  return {
    height,
    drag: (next: number) => setDragging(clampHeight(next)),
    commit: (next: number) => {
      setDragging(null);
      setStored(clampHeight(next));
    },
    reset: () => {
      setDragging(null);
      setStored(0);
    },
  };
}

/** The top edge of the open folder; drag it, or use the arrow keys. */
function ResizeHandle({
  height,
  onDrag,
  onCommit,
  onReset,
}: {
  height: number;
  onDrag: (height: number) => void;
  onCommit: (height: number) => void;
  onReset: () => void;
}) {
  const [start, setStart] = useState<{ y: number; height: number } | null>(
    null,
  );
  const heightAt = (event: PointerEvent<HTMLDivElement>): number =>
    start === null ? height : start.height + (start.y - event.clientY);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowUp") onCommit(height + KEY_STEP);
    else if (event.key === "ArrowDown") onCommit(height - KEY_STEP);
    else return;
    event.preventDefault();
  };
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize memory"
      aria-valuenow={height}
      aria-valuemin={MIN_HEIGHT}
      tabIndex={0}
      title="Drag to resize, double-click to reset"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setStart({ y: event.clientY, height });
      }}
      onPointerMove={(event) => {
        if (start !== null) onDrag(heightAt(event));
      }}
      onPointerUp={(event) => {
        if (start === null) return;
        onCommit(heightAt(event));
        setStart(null);
      }}
      onPointerCancel={() => setStart(null)}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      className={cn(
        "group/resize absolute inset-x-0 -top-[13px] z-10 flex h-2 cursor-row-resize touch-none items-center",
        FOCUS_RING,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-0.5 w-full bg-transparent transition-colors duration-150 group-hover/resize:bg-ring/60",
          start !== null && "bg-ring",
        )}
      />
    </div>
  );
}

const sizeLabel = (bytes: number): string =>
  bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;

function FileRow({ node, onOpen }: { node: FileNode; onOpen: OpenFile }) {
  return (
    <li className="list-none">
      <button
        type="button"
        disabled={onOpen === null}
        title={sizeLabel(node.file.sizeBytes)}
        onClick={() => onOpen?.(node.file.path)}
        className={cn(NODE_ROW, "disabled:cursor-default")}
      >
        <span className="size-3.5 shrink-0" aria-hidden />
        <Icon
          name="FileText"
          className="size-3.5 shrink-0 text-sky-500/80"
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-sm text-foreground/90">
          {node.name}
        </span>
        {node.file.modifiedAt === null ? null : (
          <Age at={node.file.modifiedAt} />
        )}
      </button>
    </li>
  );
}

function FolderRow({
  node,
  depth,
  onOpen,
}: {
  node: FolderNode;
  depth: number;
  onOpen: OpenFile;
}) {
  const [open, setOpen] = useState(depth === 0);
  return (
    <li className="list-none">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={NODE_ROW}
      >
        <Disclosure open={open} />
        <Icon
          name={open ? "FolderOpen" : "Folder"}
          className="size-3.5 shrink-0 text-amber-500/80"
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-sm text-foreground/90">
          {node.name}/
        </span>
      </button>
      {open ? (
        <Nodes nodes={node.children} depth={depth + 1} onOpen={onOpen} />
      ) : null}
    </li>
  );
}

function Nodes({
  nodes,
  depth,
  onOpen,
}: {
  nodes: readonly MemoryNode[];
  depth: number;
  onOpen: OpenFile;
}) {
  return (
    <ul className="m-0 flex flex-col gap-px p-0 pl-4">
      {nodes.map((node) =>
        node.kind === "file" ? (
          <FileRow key={node.file.path} node={node} onOpen={onOpen} />
        ) : (
          <FolderRow
            key={node.path}
            node={node}
            depth={depth}
            onOpen={onOpen}
          />
        ),
      )}
    </ul>
  );
}

/** What a captain keeps in its home folder, each file opening in bb's preview. */
export function MemorySection({
  project,
  hostId,
}: {
  project: string;
  hostId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const memoryHeight = useMemoryHeight();
  const navigate = useBbNavigate();
  const [refreshing, setRefreshing] = useState(false);
  const { data, error, refetch } = experimental_useRpcQuery({
    contract: rpcContract,
    method: "captain_home",
    input: { project },
  });
  const tree = useMemo(
    () => (data?.status === "ready" ? memoryTree(data.files) : []),
    [data],
  );

  let body: ReactNode;
  if (data === undefined)
    body = (
      <Note>{error === null ? "Loading memory…" : "Could not load memory"}</Note>
    );
  else if (data.status === "missing")
    body = <Note>No memory folder yet at {data.folder}.</Note>;
  else {
    const { root } = data;
    const onOpen: OpenFile =
      hostId === null
        ? null
        : (path) =>
            navigate.experimental_openFilePreview({
              target: { kind: "host", hostId, path: `${root}/${path}` },
              location: null,
            });
    body = (
      <>
        <p className="m-0 flex h-7 items-center gap-1.5 px-2 text-sm text-muted-foreground">
          <Icon name="Folder" className={ICON} aria-hidden />
          <span className="truncate">{data.folder}</span>
        </p>
        <Nodes nodes={tree} depth={0} onOpen={onOpen} />
      </>
    );
  }

  return (
    <section className="relative flex flex-col gap-1">
      {open ? (
        <ResizeHandle
          height={memoryHeight.height}
          onDrag={memoryHeight.drag}
          onCommit={memoryHeight.commit}
          onReset={memoryHeight.reset}
        />
      ) : null}
      <h3 className="m-0 flex items-center gap-1">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            if (!open) void refetch();
            setOpen((current) => !current);
          }}
          className={cn(PANEL_ROW, "h-7 items-center gap-1.5 px-2", SECTION_TITLE)}
        >
          <Disclosure open={open} />
          Memory
        </button>
        <button
          type="button"
          aria-label="Refresh memory"
          title="Refresh memory"
          onClick={() => {
            setRefreshing(true);
            void refetch().finally(() => setRefreshing(false));
          }}
          className={cn(
            "grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            FOCUS_RING,
          )}
        >
          <Icon
            name="RotateCcw"
            aria-hidden
            className={cn(
              "size-3.5",
              refreshing && "animate-spin motion-reduce:animate-none",
            )}
          />
        </button>
      </h3>
      <div
        inert={!open}
        aria-hidden={!open}
        className={cn(
          "grid transition-[grid-template-rows,opacity] motion-reduce:transition-opacity",
          EASE_OUT,
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div
          className="min-h-0 overflow-y-auto"
          style={{ maxHeight: memoryHeight.height }}
        >
          {body}
        </div>
      </div>
    </section>
  );
}
