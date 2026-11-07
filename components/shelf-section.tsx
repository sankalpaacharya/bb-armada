import { Icon } from "@/components/ui/icon";
import type { ParkActions } from "@/hooks/use-park-actions";
import type { ThreadEntry } from "@/lib/model";
import { FOCUS_RING } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { ShelfRow } from "./shelf-row";
import type { OpenThread } from "./thread-link";

/** A quiet, collapsible shelf under the active list. Renders nothing while it is empty. */
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
  expanded: boolean;
  onToggle: () => void;
  activeThreadId: string | null;
  actions: ParkActions;
  onOpen: OpenThread;
}) {
  if (entries.length === 0) return null;
  return (
    <section aria-label={title} className="flex flex-col">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className={cn(
          "flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-left text-2xs text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground",
          FOCUS_RING,
        )}
      >
        <Icon
          name="ChevronRight"
          className={cn(
            "size-3 shrink-0 transition-transform motion-reduce:transition-none",
            expanded && "rotate-90",
          )}
        />
        <span>{title}</span>
        <span className="tabular-nums text-muted-foreground/60">
          {entries.length}
        </span>
      </button>
      {expanded ? (
        <ul aria-label={title} className="m-0 flex flex-col gap-px p-0">
          {entries.map((entry) => (
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
    </section>
  );
}
