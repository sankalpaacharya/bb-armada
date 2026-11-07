import { Icon } from "@/components/ui/icon";
import type { ParkActions } from "@/hooks/use-park-actions";
import type { ThreadEntry } from "@/lib/model";
import { HEADER_ACTION } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./section";
import { ShelfRow } from "./shelf-row";
import type { OpenThread } from "./thread-link";

/** A collapsible shelf of threads off the active list. Renders nothing while it is empty. */
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
  const label = expanded
    ? `Hide ${title.toLowerCase()}`
    : `Show ${title.toLowerCase()}`;
  return (
    <section className="flex flex-col gap-1">
      <SectionHeader
        title={title}
        count={entries.length}
        actions={
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={label}
            title={label}
            onClick={onToggle}
            className={HEADER_ACTION}
          >
            <Icon
              name="ChevronDown"
              className={cn(
                "size-3.5 transition-transform",
                expanded && "rotate-180",
              )}
            />
          </button>
        }
      />
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
