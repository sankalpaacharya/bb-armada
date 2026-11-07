import type { ParkActions } from "@/hooks/use-park-actions";
import type { ThreadEntry } from "@/lib/model";
import { FOCUS_RING } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { ShelfRow } from "./shelf-row";
import type { OpenThread } from "./thread-link";

/** Rows a shelf shows before it offers the rest. */
const PREVIEW = 8;

/**
 * A shelf under the active list, drawn like T3 Code's: a quiet label with a
 * rule to the edge, then its threads as muted lines. Long shelves show a
 * handful and offer the rest. Renders nothing while it is empty.
 */
export function ShelfSection({
  title,
  entries,
  expanded,
  onToggle,
  activeThreadId,
  actions,
  onOpen,
}: {
  title: "Inactive" | "Snoozed" | "Settled";
  entries: readonly ThreadEntry[];
  /** True once the user asked for every row, not just the preview. */
  expanded: boolean;
  onToggle: () => void;
  activeThreadId: string | null;
  actions: ParkActions;
  onOpen: OpenThread;
}) {
  if (entries.length === 0) return null;
  const shown = expanded ? entries : entries.slice(0, PREVIEW);
  const hidden = entries.length - shown.length;
  return (
    <section aria-label={title} className="flex flex-col pt-3">
      <div className="flex h-6 items-center gap-2 px-2.5">
        <span className="text-2xs font-medium text-muted-foreground/70">
          {title}
        </span>
        <span
          aria-hidden="true"
          className="text-2xs tabular-nums text-muted-foreground/50"
        >
          {entries.length}
        </span>
        <span aria-hidden="true" className="h-px flex-1 bg-sidebar-border/70" />
      </div>
      <ul aria-label={title} className="m-0 flex flex-col gap-px p-0">
        {shown.map((entry) => (
          <ShelfRow
            key={entry.thread.id}
            entry={entry}
            active={entry.thread.id === activeThreadId}
            actions={actions}
            onOpen={onOpen}
          />
        ))}
      </ul>
      {hidden > 0 || expanded ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={onToggle}
          className={cn(
            "flex h-7 w-full cursor-pointer items-center rounded-md px-2.5 text-left text-2xs text-muted-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-foreground",
            FOCUS_RING,
          )}
        >
          {expanded
            ? `Show fewer ${title.toLowerCase()}`
            : `Show ${hidden} more ${title.toLowerCase()}`}
        </button>
      ) : null}
    </section>
  );
}
