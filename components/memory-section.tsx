import { useMemo, useState, type ReactNode } from "react";
import { Markdown, experimental_useRpcQuery } from "@get-bb/plugin-sdk/app";

import { memoryTree, type MemoryNode } from "@/lib/captain-home";
import { rpcContract } from "@/lib/rpc";
import { PANEL_ROW, SECTION_TITLE } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { Age } from "./age";
import { Note } from "./section";
import { Icon } from "./ui/icon";

type FileNode = Extract<MemoryNode, { kind: "file" }>;
type FolderNode = Extract<MemoryNode, { kind: "folder" }>;

const ICON = "size-3.5 shrink-0 text-muted-foreground";
const NODE_ROW = cn(PANEL_ROW, "h-7 items-center gap-1.5 px-2");

const sizeLabel = (bytes: number): string =>
  bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;

function Disclosure({ open }: { open: boolean }) {
  return (
    <Icon
      name={open ? "ChevronDown" : "ChevronRight"}
      className={ICON}
      aria-hidden
    />
  );
}

function FileContent({ project, path }: { project: string; path: string }) {
  const { data, error } = experimental_useRpcQuery({
    contract: rpcContract,
    method: "captain_home_file",
    input: { project, path },
  });
  if (data === undefined)
    return (
      <Note>{error === null ? "Loading file…" : "Could not read this file"}</Note>
    );
  return (
    <div className="mx-2 mt-1 mb-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
      <Markdown content={data.content} className="text-sm" />
      {data.truncated ? (
        <p className="pt-2 text-2xs text-muted-foreground">
          Showing the first 200 KB.
        </p>
      ) : null}
    </div>
  );
}

function FileRow({ project, node }: { project: string; node: FileNode }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="list-none">
      <button
        type="button"
        aria-expanded={open}
        title={sizeLabel(node.file.sizeBytes)}
        onClick={() => setOpen((current) => !current)}
        className={NODE_ROW}
      >
        <Disclosure open={open} />
        <Icon name="File" className={ICON} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
          {node.name}
        </span>
        {node.file.modifiedAt === null ? null : (
          <Age at={node.file.modifiedAt} />
        )}
      </button>
      {open ? <FileContent project={project} path={node.file.path} /> : null}
    </li>
  );
}

function FolderRow({
  project,
  node,
  depth,
}: {
  project: string;
  node: FolderNode;
  depth: number;
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
        <Icon name="Folder" className={ICON} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
          {node.name}/
        </span>
      </button>
      {open ? (
        <Nodes project={project} nodes={node.children} depth={depth + 1} />
      ) : null}
    </li>
  );
}

function Nodes({
  project,
  nodes,
  depth,
}: {
  project: string;
  nodes: readonly MemoryNode[];
  depth: number;
}) {
  return (
    <ul className="m-0 flex flex-col gap-px p-0 pl-4">
      {nodes.map((node) =>
        node.kind === "file" ? (
          <FileRow key={node.file.path} project={project} node={node} />
        ) : (
          <FolderRow
            key={node.path}
            project={project}
            node={node}
            depth={depth}
          />
        ),
      )}
    </ul>
  );
}

/** What a captain keeps in its home folder, each file readable in place. */
export function MemorySection({ project }: { project: string }) {
  const { data, error } = experimental_useRpcQuery({
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
  else
    body = (
      <>
        <p className="m-0 flex h-7 items-center gap-1.5 px-2 text-sm text-muted-foreground">
          <Icon name="Folder" className={ICON} aria-hidden />
          <span className="truncate">{data.folder}</span>
        </p>
        <Nodes project={project} nodes={tree} depth={0} />
      </>
    );

  return (
    <section className="flex flex-col gap-1">
      <h3 className={cn("px-2", SECTION_TITLE)}>Memory</h3>
      {body}
    </section>
  );
}
