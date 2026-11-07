import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { ChoiceList, type Choice } from "./choice-list";

const ALIGN = {
  end: { root: "contents", panel: "right-1 origin-top-right" },
  stretch: { root: "relative", panel: "inset-x-0 origin-top" },
} as const;

/**
 * A single-select dropdown: a trigger that opens a listbox panel below it.
 * `stretch` makes the panel as wide as the trigger. `end` hangs it from the
 * right edge of the nearest positioned ancestor, which the caller sizes with
 * `panelClassName`.
 */
export function Dropdown<Id extends string | null>({
  label,
  triggerLabel,
  choices,
  value,
  onChange,
  align,
  triggerClassName,
  panelClassName,
  listClassName,
  children,
}: {
  /** Names the listbox. */
  label: string;
  /** Names the trigger when its content alone would not. */
  triggerLabel?: string;
  choices: readonly Choice<Id>[];
  value: Id;
  onChange: (id: Id) => void;
  align: keyof typeof ALIGN;
  triggerClassName?: string;
  panelClassName?: string;
  listClassName?: string;
  /** What the trigger shows; a chevron follows it. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className={ALIGN[align].root}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={triggerLabel}
        onClick={() => setOpen((current) => !current)}
        className={triggerClassName}
      >
        {children}
        <Icon
          name="ChevronDown"
          className={cn(
            "size-3.5 shrink-0 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div
          className={cn(
            "absolute top-full z-20 mt-1 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none starting:scale-95 starting:opacity-0",
            ALIGN[align].panel,
            panelClassName,
          )}
        >
          <ChoiceList
            id={listId}
            label={label}
            choices={choices}
            value={value}
            onChange={(next) => {
              onChange(next);
              close();
            }}
            onClose={close}
            autoFocus
            className={listClassName}
          />
        </div>
      ) : null}
    </div>
  );
}
