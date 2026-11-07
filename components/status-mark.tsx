import { experimental_ThreadStatusGlyph as ThreadStatusGlyph } from "@get-bb/plugin-sdk/app";

import { STATUS, type Status } from "@/lib/status";
import { cn } from "@/lib/utils";
import { ShadeGrid } from "./shade-grid";

/**
 * One status, drawn from the status table. "compact" is the glyph alone, for
 * one-line rows; "card" adds the word in the status tone.
 */
export function StatusMark({
  status,
  variant,
}: {
  status: Status;
  variant: "card" | "compact";
}) {
  const row = STATUS[status];
  const glyph =
    row.glyph.kind === "grid" ? (
      <ShadeGrid label={row.word} className={row.tone} />
    ) : (
      <ThreadStatusGlyph indicator={row.glyph.indicator} size="compact" />
    );
  if (variant === "compact") return glyph;
  return (
    <span className={cn("flex shrink-0 items-center gap-1.5 text-2xs", row.tone)}>
      {glyph}
      {row.wordOnCard ? row.word : null}
    </span>
  );
}
