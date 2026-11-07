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
  /** The parent a thread folds under, which skips its captain's supervisor. */
  parentOf: (thread: T) => string | null;
};

/**
 * How threads fold into cards, for the list and for the auto-settle job
 * alike. Parents missing from `threads` count as absent, so a thread under an
 * archived or hidden parent is a root.
 *
 * A supervisor is part of its captain: it folds into the captain's tree and
 * is never a card, and the threads it runs count as the captain's own. A
 * supervisor id counts only for a thread whose parent is a captain.
 */
export function threadForest<T extends TreeThread>(
  threads: readonly T[],
  captainIds: ReadonlySet<string>,
  supervisorIds: ReadonlySet<string>,
): Forest<T> {
  const byId = new Map(threads.map((thread) => [thread.id, thread]));
  const captainOf = new Map<string, string>();
  for (const id of supervisorIds) {
    const supervisor = byId.get(id);
    const parentId = supervisor === undefined ? null : parentIdOf(supervisor);
    if (
      parentId !== null &&
      byId.has(parentId) &&
      captainIds.has(parentId) &&
      !captainIds.has(id)
    )
      captainOf.set(id, parentId);
  }
  const parentOf = (thread: T): string | null => {
    const parentId = parentIdOf(thread);
    return parentId === null ? null : (captainOf.get(parentId) ?? parentId);
  };

  const childrenOf = new Map<string, T[]>();
  for (const thread of threads) {
    const parentId = parentOf(thread);
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
      const parentId = parentOf(current);
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
    if (captainIds.has(thread.id) || captainOf.has(thread.id)) continue;
    const root = rootOf(thread);
    roots.set(root.id, root);
  }
  return { roots: [...roots.values()], subtreeOf, parentOf };
}
