import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

/** Where a thread runs, for its row's tooltip: project, then worktree, branch or machine. */
export function placeHint(
  thread: PluginSidebarThread,
  project: string | null,
): string {
  const branch = thread.environment?.branchName ?? null;
  const place =
    branch !== null
      ? `${thread.environment?.isWorktree === true ? "Worktree" : "Branch"} ${branch}`
      : (thread.host?.name ?? null);
  return [project, place].filter((part) => part !== null).join(" · ");
}
