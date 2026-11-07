import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

/** A row's tooltip, with what the row leaves out: project, then worktree, branch or machine, then how long ago it moved. */
export function rowHint(
  thread: PluginSidebarThread,
  project: string | null,
  ago: string | null,
): string {
  const branch = thread.environment?.branchName ?? null;
  const place =
    branch !== null
      ? `${thread.environment?.isWorktree === true ? "Worktree" : "Branch"} ${branch}`
      : (thread.host?.name ?? null);
  return [project, place, ago].filter((part) => part !== null).join(" · ");
}
