import { useEffect, useRef, type KeyboardEvent } from "react";

import { Icon } from "@/components/ui/icon";
import { FOCUS_RING, LIST_TEXT, rowFill } from "@/lib/styles";
import { cn } from "@/lib/utils";

export type Choice<Id extends string | null> = {
  id: Id;
  label: string;
  icon?: string;
  count?: number;
  /** A short muted note after the label, read with it. */
  detail?: string;
};

const keyOf = (id: string | null) => id ?? "\u0000";

/**
 * A list with listbox semantics: one tab stop on the first selected option,
 * arrow keys move focus, Enter or Space pick, Escape asks to close. With
 * `multiselectable`, every selected option carries a check.
 */
export function ChoiceList<Id extends string | null>({
  id,
  label,
  choices,
  isSelected,
  onPick,
  multiselectable = false,
  onClose,
  autoFocus = false,
  className,
}: {
  id?: string;
  label: string;
  choices: readonly Choice<Id>[];
  isSelected: (id: Id) => boolean;
  onPick: (id: Id) => void;
  multiselectable?: boolean;
  onClose?: () => void;
  autoFocus?: boolean;
  className?: string;
}) {
  const firstSelected = choices.find((choice) => isSelected(choice.id))?.id;
  const ref = useRef<HTMLUListElement>(null);
  const options = () =>
    Array.from(
      ref.current?.querySelectorAll<HTMLElement>("[role=option]") ?? [],
    );

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
      aria-multiselectable={multiselectable || undefined}
      onKeyDown={onKeyDown}
      className={cn("m-0 flex list-none flex-col gap-px p-0", className)}
    >
      {choices.map((choice) => {
        const selected = isSelected(choice.id);
        return (
          <li key={keyOf(choice.id)} role="none" className="contents">
            <button
              type="button"
              role="option"
              aria-selected={selected}
              tabIndex={choice.id === firstSelected ? 0 : -1}
              onClick={() => onPick(choice.id)}
              className={cn(
                "flex h-7 w-full cursor-pointer items-center gap-2 rounded-md px-2.5 text-left text-muted-foreground hover:text-foreground",
                LIST_TEXT,
                FOCUS_RING,
                rowFill(selected),
                selected && "text-foreground",
              )}
            >
              {choice.icon === undefined ? null : (
                <Icon
                  name={choice.icon}
                  className="size-3.5 shrink-0 text-muted-foreground"
                />
              )}
              <span className="min-w-0 flex-1 truncate">
                {choice.label}
                {choice.detail === undefined ? null : (
                  <span className="text-muted-foreground">
                    {" "}
                    · {choice.detail}
                  </span>
                )}
              </span>
              {choice.count === undefined || choice.count === 0 ? null : (
                <span
                  aria-hidden="true"
                  className="shrink-0 text-2xs tabular-nums text-muted-foreground/70"
                >
                  {choice.count}
                </span>
              )}
              {selected && (multiselectable || choice.count === undefined) ? (
                <Icon name="Check" className="size-3.5 shrink-0" />
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
