import { cn } from "@/lib/utils";
import { Icon } from "./ui/icon";

export const EASE_OUT = "duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]";

/** The chevron of a row that opens, turned down while open. */
export function Disclosure({ open }: { open: boolean }) {
  return (
    <Icon
      name="ChevronRight"
      className={cn(
        "size-3.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
        EASE_OUT,
        open && "rotate-90",
      )}
      aria-hidden
    />
  );
}
