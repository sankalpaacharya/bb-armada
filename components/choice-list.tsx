import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

import { Icon } from "@/components/ui/icon";
import { FOCUS_RING, LIST_TEXT } from "@/lib/styles";
import { cn } from "@/lib/utils";

export type Choice<Id extends string | null> = {
  id: Id;
  label: string;
  icon?: string;
  count?: number;
};

const keyOf = (id: string | null) => id ?? "\u0000";

/**
 * A single-select list with listbox semantics: one tab stop on the selected
 * option, arrow keys move focus, Enter or Space pick, Escape asks to close.
 * `renderChoice` replaces the default icon, label and count row, for a grid
 * of pictures; the label still names the option for assistive tech.
 */
export function ChoiceList<Id extends string | null>({
  id,
  label,
  choices,
  value,
  onChange,
  onClose,
  autoFocus = false,
  className,
  renderChoice,
}: {
  id?: string;
  label: string;
  choices: readonly Choice<Id>[];
  value: Id;
  onChange: (id: Id) => void;
  onClose?: () => void;
  autoFocus?: boolean;
  className?: string;
  renderChoice?: (choice: Choice<Id>, selected: boolean) => ReactNode;
}) {
  const ref = useRef<HTMLUListElement>(null);
  const options = () =>
    Array.from(ref.current?.querySelectorAll<HTMLElement>("[role=option]") ?? []);

  useEffect(() => {
    if (!autoFocus) return;
    const selected = options().find(
      (option) => option.getAttribute("aria-selected") === "true",
    );
    (selected ?? options()[0])?.focus();
  }, [autoFocus]);

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const all = options();
    const index = all.findIndex((option) => option === document.activeElement);
    const moves: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowRight: index + 1,
      ArrowUp: index - 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: all.length - 1,
    };
    const next = moves[event.key];
    if (next !== undefined) {
      event.preventDefault();
      all[Math.min(all.length - 1, Math.max(0, next))]?.focus();
    } else if (event.key === "Escape" && onClose !== undefined) {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <ul
      ref={ref}
      id={id}
      role="listbox"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        "m-0 list-none p-0",
        renderChoice === undefined && "flex flex-col gap-px",
        className,
      )}
    >
      {choices.map((choice) => {
        const selected = choice.id === value;
        return (
          <li key={keyOf(choice.id)} className="contents">
            <button
              type="button"
              role="option"
              aria-selected={selected}
              aria-label={renderChoice === undefined ? undefined : choice.label}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(choice.id)}
              className={cn(
                "cursor-pointer rounded-md text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                FOCUS_RING,
                renderChoice === undefined &&
                  "flex h-7 w-full items-center gap-2 px-2.5 text-left",
                renderChoice === undefined && LIST_TEXT,
                renderChoice === undefined &&
                  selected &&
                  "bg-sidebar-accent text-foreground hover:bg-sidebar-accent",
              )}
            >
              {renderChoice === undefined ? (
                <>
                  {choice.icon === undefined ? null : (
                    <Icon
                      name={choice.icon}
                      className="size-3.5 shrink-0 text-muted-foreground"
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate">{choice.label}</span>
                  {choice.count === undefined || choice.count === 0 ? null : (
                    <span
                      aria-hidden="true"
                      className="shrink-0 text-2xs tabular-nums text-muted-foreground/70"
                    >
                      {choice.count}
                    </span>
                  )}
                  {selected && choice.count === undefined ? (
                    <Icon name="Check" className="size-3.5 shrink-0" />
                  ) : null}
                </>
              ) : (
                renderChoice(choice, selected)
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
