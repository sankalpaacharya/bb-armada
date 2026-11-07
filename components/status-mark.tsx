import { experimental_ThreadStatusGlyph as ThreadStatusGlyph } from "@get-bb/plugin-sdk/app";

import { STATUS, type Status } from "@/lib/status";
import { cn } from "@/lib/utils";
import { Age } from "./age";
import { ShadeGrid } from "./shade-grid";

export type StatusVariant = "card" | "compact";

/**
 * One status, drawn from the status table. "compact" is the glyph alone, for
 * one-line rows; "card" adds the word in the status tone.
 */
function StatusMark({
  status,
  variant,
}: {
  status: Status;
  variant: StatusVariant;
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

/** The row's trailing slot: the status when it has something to say, else the age. */
export function StatusOrAge({
  status,
  activityAt,
  variant,
}: {
  status: Status | null;
  activityAt: number;
  variant: StatusVariant;
}) {
  if (status !== null && (variant === "card" || STATUS[status].live))
    return <StatusMark status={status} variant={variant} />;
  return <Age at={activityAt} />;
}
