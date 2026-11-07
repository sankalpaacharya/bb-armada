export const FOCUS_RING =
  "outline-none focus-visible:ring-1 focus-visible:ring-ring";

export const rowFill = (active: boolean): string =>
  active ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60";

export const HEADER_ACTION = `grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-state-hover hover:text-foreground aria-expanded:bg-state-active aria-expanded:text-foreground ${FOCUS_RING}`;

export const LIST_TEXT = "text-[13px]";

export const TILE = {
  row: "size-[18px] rounded-[5px]",
  preview: "size-10 rounded-[10px]",
} as const;

export const TILE_COLUMN = "w-[18px]";

export const AGE_TEXT = "shrink-0 tabular-nums text-2xs text-muted-foreground";
