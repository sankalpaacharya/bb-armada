import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

export type Place = {
  icon: "FolderGit" | "GitBranch" | "Laptop";
  label: string;
};

/** Where a thread runs: a worktree, a branch of the project checkout, or a machine. */
export function placeOf(thread: PluginSidebarThread): Place | null {
  const branch = thread.environment?.branchName ?? null;
  if (branch !== null) {
    return thread.environment?.isWorktree === true
      ? { icon: "FolderGit", label: `Worktree ${branch}` }
      : { icon: "GitBranch", label: `Branch ${branch}` };
  }
  if (thread.host !== null) return { icon: "Laptop", label: thread.host.name };
  return null;
}
