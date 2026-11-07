/** The tree fields the app's sidebar threads and the server's listed threads share. */
export type TreeThread = {
  id: string;
  parentThreadId: string | null;
  lifecycleOwnerThreadId: string | null;
};

export const parentIdOf = (thread: TreeThread): string | null =>
  thread.parentThreadId ?? thread.lifecycleOwnerThreadId;

export type Forest<T extends TreeThread> = {
  /** Each card's root: a non-captain thread with no parent in the list, or a captain for a parent. */
  roots: T[];
  /** Every descendant, stopping at captains, which own their own subtree. */
  subtreeOf: (rootId: string) => T[];
};

/**
 * How threads fold into cards, for the list and for the auto-settle job
 * alike. Parents missing from `threads` count as absent, so a thread under an
 * archived or hidden parent is a root.
 */
export function threadForest<T extends TreeThread>(
  threads: readonly T[],
  captainIds: ReadonlySet<string>,
): Forest<T> {
  const byId = new Map(threads.map((thread) => [thread.id, thread]));
  const childrenOf = new Map<string, T[]>();
  for (const thread of threads) {
    const parentId = parentIdOf(thread);
    if (parentId === null || !byId.has(parentId)) continue;
    const siblings = childrenOf.get(parentId) ?? [];
    siblings.push(thread);
    childrenOf.set(parentId, siblings);
  }

  const subtreeOf = (rootId: string): T[] => {
    const found: T[] = [];
    const seen = new Set([rootId]);
    const pending = [rootId];
    for (let index = 0; index < pending.length; index += 1) {
      for (const child of childrenOf.get(pending[index]) ?? []) {
        if (seen.has(child.id) || captainIds.has(child.id)) continue;
        seen.add(child.id);
        found.push(child);
        pending.push(child.id);
      }
    }
    return found;
  };

  const rootOf = (thread: T): T => {
    let current = thread;
    const seen = new Set([current.id]);
    for (;;) {
      const parentId = parentIdOf(current);
      const parent = parentId === null ? undefined : byId.get(parentId);
      if (
        parent === undefined ||
        captainIds.has(parent.id) ||
        seen.has(parent.id)
      )
        return current;
      seen.add(parent.id);
      current = parent;
    }
  };

  const roots = new Map<string, T>();
  for (const thread of threads) {
    if (captainIds.has(thread.id)) continue;
    const root = rootOf(thread);
    roots.set(root.id, root);
  }
  return { roots: [...roots.values()], subtreeOf };
}
