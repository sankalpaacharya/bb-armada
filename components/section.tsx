import type { ReactNode } from "react";

import { SECTION_TITLE } from "@/lib/styles";
import { cn } from "@/lib/utils";

/** A section heading with its actions beside it, never inside it. */
export function SectionHeader({
  title,
  count,
  actions,
}: {
  title: string;
  count?: number;
  actions?: ReactNode;
}) {
  return (
    <div className="relative flex h-8 items-center justify-between gap-2 px-2.5">
      <h2 className={cn("flex items-baseline gap-1.5", SECTION_TITLE)}>
        {title}
        {count === undefined ? null : (
          <span
            aria-hidden="true"
            className="text-2xs font-normal tabular-nums text-muted-foreground"
          >
            {count}
          </span>
        )}
      </h2>
      {actions}
    </div>
  );
}

export function Note({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("px-2.5 py-1.5 text-sm text-muted-foreground", className)}>
      {children}
    </p>
  );
}
