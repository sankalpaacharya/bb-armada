import { Icon } from "@/components/ui/icon";
import { FOCUS_RING } from "@/lib/styles";
import { cn } from "@/lib/utils";

export type RowAction = { label: string; icon: string; run: () => void };

const CLICKABLE_WHEN_SHOWN =
  "pointer-events-none group-focus-within/row:pointer-events-auto group-hover/row:pointer-events-auto";

/**
 * A row's actions, laid over its right end so they take no width at rest.
 * Hover (Tailwind gates it on hover-capable devices) fades them in; keyboard
 * focus shows them at once. The backdrop is the row's own fill, so whatever
 * sits under it is covered instead of colliding with the buttons.
 */
export function RowActions({ actions }: { actions: readonly RowAction[] }) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute inset-y-0 right-0 flex items-center gap-0.5 bg-(--row-fill) pl-1.5 opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100",
        "transition-opacity duration-[120ms] ease-[cubic-bezier(0.23,1,0.32,1)] group-focus-within/row:duration-0 motion-reduce:transition-none",
      )}
    >
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          aria-label={action.label}
          title={action.label}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            action.run();
          }}
          className={cn(
            CLICKABLE_WHEN_SHOWN,
            "grid size-5 cursor-pointer place-items-center rounded text-muted-foreground hover:bg-state-hover hover:text-foreground",
            FOCUS_RING,
          )}
        >
          <Icon name={action.icon} className="size-3.5" />
        </button>
      ))}
    </span>
  );
}
