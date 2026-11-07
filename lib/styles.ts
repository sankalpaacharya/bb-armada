export const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const ROW_HOVER = "hover:bg-sidebar-accent/60";

export const rowFill = (active: boolean): string =>
  active ? "bg-sidebar-accent" : ROW_HOVER;

export const HEADER_ACTION = `grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-state-hover hover:text-foreground aria-expanded:bg-state-active aria-expanded:text-foreground ${FOCUS_RING}`;

export const LIST_TEXT = "text-[13px]";

export const TILE = {
  badge: "size-3.5 rounded-[4px]",
  row: "size-7 rounded-[8px]",
  preview: "size-10 rounded-[10px]",
} as const;

export const SECTION_TEXT = "text-[12px]";

export const SECTION_TITLE = `${SECTION_TEXT} font-semibold text-foreground/70`;

export const DECK_PANEL = "overflow-hidden rounded-[10px] bg-foreground/5";

export const AGE_TEXT = "shrink-0 tabular-nums text-2xs text-muted-foreground";
