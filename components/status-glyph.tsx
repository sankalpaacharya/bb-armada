import { experimental_ThreadStatusGlyph as ThreadStatusGlyph } from "@get-bb/plugin-sdk/app";

import type { Status } from "@/lib/status";
import { cn } from "@/lib/utils";
import { SquareGrid } from "./square-grid";

const WORDS: Record<Status, { word: string; className: string }> = {
  working: { word: "Working", className: "text-timeline-accent" },
  queued: { word: "Queued", className: "text-muted-foreground" },
  "needs-you": { word: "Needs you", className: "text-attention" },
  failed: { word: "Failed", className: "text-destructive-text" },
  done: { word: "Done", className: "text-muted-foreground" },
};

export function StatusWord({ status }: { status: Status }) {
  const { word, className } = WORDS[status];
  return (
    <span
      data-status={status}
      className={cn("flex shrink-0 items-center gap-1.5 text-2xs", className)}
    >
      {status === "working" ? <SquareGrid /> : null}
      {status === "done" ? (
        <ThreadStatusGlyph indicator="unread-success" size="compact" />
      ) : null}
      {word}
    </span>
  );
}

export function StatusGlyph({ status }: { status: Status }) {
  switch (status) {
    case "working":
    case "queued":
      return (
        <SquareGrid
          label={WORDS[status].word}
          className="text-timeline-accent"
        />
      );
    case "needs-you":
      return <ThreadStatusGlyph indicator="waiting-for-input" size="compact" />;
    case "failed":
      return <ThreadStatusGlyph indicator="unread-error" size="compact" />;
    case "done":
      return null;
  }
}
