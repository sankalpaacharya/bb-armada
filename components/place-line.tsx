import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { ProviderGlyph } from "./provider-glyph";
import { PullRequestNumber } from "./pull-request-number";

function ActivityCount({ label, count }: { label: string; count: number }) {
  return (
    <span
      aria-label={`${count} ${label}`}
      className="shrink-0 rounded bg-muted px-1 font-mono text-2xs text-muted-foreground"
    >
      {count}
    </span>
  );
}

/**
 * A thread's detail line: its project, branch or worktree, activity and PR.
 * The detailed line, for the open thread, adds the machine and the harness.
 * With nothing to say it draws nothing, so the row stays one line.
 */
export function PlaceLine({
  thread,
  project,
  detailed = true,
  className,
}: {
  thread: PluginSidebarThread;
  project: string | null;
  detailed?: boolean;
  className?: string;
}) {
  const environment = thread.environment;
  const branch = environment?.branchName ?? null;
  const host = detailed ? thread.host : null;
  const placeIcon =
    branch !== null
      ? environment?.isWorktree === true
        ? { name: "FolderGit", label: "Worktree" }
        : { name: "GitBranch", label: "Branch" }
      : host !== null
        ? { name: "Laptop", label: "Machine" }
        : null;
  const busy =
    thread.activity.workflows > 0 || thread.activity.backgroundAgents > 0;
  if (project === null && placeIcon === null && !busy && !detailed)
    return null;
  return (
    <div
      className={cn(
        "flex h-5 items-center gap-1.5 pr-2 pl-6 text-2xs text-muted-foreground",
        className,
      )}
    >
      {project === null ? null : (
        <span className="max-w-[40%] shrink-0 truncate">{project}</span>
      )}
      {placeIcon === null ? null : (
        <Icon
          name={placeIcon.name}
          aria-label={placeIcon.label}
          className="size-3 shrink-0 text-muted-foreground"
        />
      )}
      {branch !== null ? (
        <span className="min-w-0 flex-1 truncate font-mono">{branch}</span>
      ) : host !== null ? (
        <span className="min-w-0 flex-1 truncate">{host.name}</span>
      ) : (
        <span className="flex-1" />
      )}
      {thread.activity.workflows > 0 ? (
        <ActivityCount label="workflows" count={thread.activity.workflows} />
      ) : null}
      {thread.activity.backgroundAgents > 0 ? (
        <ActivityCount
          label="background agents"
          count={thread.activity.backgroundAgents}
        />
      ) : null}
      <PullRequestNumber environmentId={environment?.id ?? null} />
      {detailed ? <ProviderGlyph providerId={thread.providerId} /> : null}
    </div>
  );
}
