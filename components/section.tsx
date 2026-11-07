import type { ReactNode } from "react";

import { LIST_TEXT } from "@/lib/styles";
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
    <div className="mt-3 flex h-8 items-center justify-between gap-2 px-2.5 first:mt-0">
      <h2
        className={cn(
          "flex items-baseline gap-1.5 font-normal text-muted-foreground",
          LIST_TEXT,
        )}
      >
        {title}
        {count === undefined ? null : (
          <span aria-hidden="true" className="text-2xs tabular-nums">
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
