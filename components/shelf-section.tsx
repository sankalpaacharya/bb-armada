import { useState } from "react";

import { Icon } from "@/components/ui/icon";
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
 * rule to the edge, then its threads as muted lines. The label opens and
 * closes it; an open long shelf shows a handful and offers the rest. Renders nothing while it is empty.
 */
export function ShelfSection({
  title,
  entries,
  open,
  onToggleOpen,
  activeThreadId,
  actions,
  onOpen,
}: {
  title: "Inactive" | "Snoozed" | "Settled";
  entries: readonly ThreadEntry[];
  /** Whether the shelf shows its rows; remembered per shelf. */
  open: boolean;
  onToggleOpen: () => void;
  activeThreadId: string | null;
  actions: ParkActions;
  onOpen: OpenThread;
}) {
  const [expanded, setExpanded] = useState(false);
  if (entries.length === 0) return null;
  const shown = !open ? [] : expanded ? entries : entries.slice(0, PREVIEW);
  const hidden = entries.length - shown.length;
  return (
    <section aria-label={title} className="flex flex-col pt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggleOpen}
        className={cn(
          "group/shelf flex h-6 w-full cursor-pointer items-center gap-2 rounded-md px-2.5 text-left",
          FOCUS_RING,
        )}
      >
        <span className="text-2xs font-medium text-muted-foreground/70 transition-colors group-hover/shelf:text-foreground">
          {title}
        </span>
        <span className="text-2xs tabular-nums text-muted-foreground/50">
          {entries.length}
        </span>
        <span aria-hidden="true" className="h-px flex-1 bg-sidebar-border/70" />
        <Icon
          name="ChevronDown"
          className={cn(
            "size-3 shrink-0 text-muted-foreground/50 transition-transform motion-reduce:transition-none group-hover/shelf:text-foreground",
            !open && "-rotate-90",
          )}
        />
      </button>
      {open ? (
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
      ) : null}
      {open && (hidden > 0 || expanded) ? (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
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
