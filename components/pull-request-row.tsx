import { useBbNavigate } from "@get-bb/plugin-sdk/app";

import type { PullRequestRow as Row } from "@/lib/crew-pull-requests";
import { FOCUS_RING } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { Icon } from "./ui/icon";

const MARK = "size-3.5 shrink-0";

/**
 * One of the user's open pull requests: `repo#number` and its title, then
 * its branches and size, and the crew worker on its branch. The row opens the
 * PR in the browser; the worker's name opens the worker.
 */
export function PullRequestRow({
  row,
  onOpenWorker,
}: {
  row: Row;
  onOpenWorker: (threadId: string) => void;
}) {
  const navigate = useBbNavigate();
  const { via } = row;
  return (
    <li className="relative flex list-none flex-col rounded-md px-2 py-1 hover:bg-accent/60 has-[button:focus-visible]:bg-accent/60">
      <span className="flex h-7 items-center gap-2">
        <Icon
          name={row.draft ? "GitPullRequestDraft" : "GitPullRequest"}
          aria-label={row.draft ? "Draft pull request" : "Pull request"}
          className="size-4 shrink-0 text-muted-foreground"
        />
        <button
          type="button"
          title={`${row.label} ${row.title}`}
          onClick={() => navigate.openUrl(row.url)}
          className={cn(
            "min-w-0 flex-1 cursor-pointer truncate text-left text-sm text-foreground after:absolute after:inset-0 after:rounded-md",
            FOCUS_RING,
          )}
        >
          <span className="font-mono text-2xs text-muted-foreground">
            {row.label}
          </span>{" "}
          {row.title}
        </button>
        {[...row.markers, ...(row.checks === null ? [] : [row.checks])].map(
          (mark) => (
            <span
              key={mark.word}
              title={mark.word}
              className="grid size-4 shrink-0 place-items-center"
            >
              <Icon
                name={mark.icon}
                aria-label={mark.word}
                className={cn(MARK, mark.tone)}
              />
            </span>
          ),
        )}
      </span>
      <span className="flex h-4 min-w-0 items-center gap-1.5 pl-6 text-2xs text-muted-foreground">
        <span className="min-w-0 truncate font-mono">
          {row.base} ← {row.head}
        </span>
        <span className="shrink-0 tabular-nums">
          +{row.additions} −{row.deletions}
        </span>
        {via === null ? null : (
          <>
            <span aria-hidden="true" className="shrink-0">
              ·
            </span>
            <button
              type="button"
              title={`Open ${via.title}`}
              onClick={() => onOpenWorker(via.threadId)}
              className={cn(
                "relative z-10 max-w-[50%] shrink-0 cursor-pointer truncate rounded-sm hover:text-foreground hover:underline",
                FOCUS_RING,
              )}
            >
              via {via.title}
            </button>
          </>
        )}
      </span>
    </li>
  );
}
