import { useLayoutEffect, useRef } from "react";
import {
  experimental_useRpcMutation,
  useBbNavigate,
} from "@get-bb/plugin-sdk/app";

import type { PullRequestRow as Row } from "@/lib/crew-pull-requests";
import { useNow } from "@/lib/clock";
import { rpcContract } from "@/lib/rpc";
import { FOCUS_RING } from "@/lib/styles";
import { formatAge } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Age } from "./age";
import { ShelfHeading } from "./shelf-section";
import { Icon } from "./ui/icon";

/**
 * A row's fill as an opaque colour in `--row-bg`, so the pinned parts cover
 * what slides under them: the panel's own colour at rest, and lit like a
 * thread row while hovered or focused.
 */
const ROW_FILL =
  "[--row-bg:var(--sidebar)] hover:bg-(--row-bg) hover:[--row-bg:color-mix(in_oklab,var(--accent)_60%,var(--sidebar))] has-[button:focus-visible]:bg-(--row-bg) has-[button:focus-visible]:[--row-bg:color-mix(in_oklab,var(--accent)_60%,var(--sidebar))]";

/** Opens a PR in the default browser through the plugin server; bb's own opener is the fallback. */
function useOpenPullRequest(): (url: string) => void {
  const navigate = useBbNavigate();
  const { mutate } = experimental_useRpcMutation({
    contract: rpcContract,
    method: "open_pull_request",
  });
  return (url) => {
    mutate({ url }).then(
      (opened) => opened || navigate.openUrl(url),
      () => navigate.openUrl(url),
    );
  };
}

/** Fades a scroller's top and bottom edges only while there is more that way. */
function setEdgeFades(el: HTMLElement) {
  el.toggleAttribute("data-more-above", el.scrollTop > 1);
  el.toggleAttribute(
    "data-more-below",
    el.scrollTop + el.clientHeight < el.scrollHeight - 1,
  );
}

/**
 * One pull request: its state pinned at the left and lines changed pinned at
 * the right, both opaque, so the title and its quiet line slide under them
 * when the list scrolls sideways. The tooltip has the rest. The row opens the
 * PR; the worker's name opens the worker. The pinned parts sit above the
 * worker's name, so they open the PR themselves rather than whatever slid
 * under them.
 */
function PullRequestRow({
  row,
  onOpen,
  onOpenWorker,
}: {
  row: Row;
  onOpen: (url: string) => void;
  onOpenWorker: (threadId: string) => void;
}) {
  const { via } = row;
  return (
    <li
      className={cn(
        "relative flex list-none items-stretch rounded-md py-1 whitespace-nowrap",
        ROW_FILL,
      )}
    >
      <span
        role="img"
        aria-label={row.state.word}
        onClick={() => onOpen(row.url)}
        className="sticky left-0 z-[4] -my-1 shrink-0 cursor-pointer rounded-l-md bg-(--row-bg) py-1 pr-2 pl-2"
      >
        <span className="flex h-7 items-center">
          <Icon name={row.state.icon} className={cn("size-4", row.state.tone)} />
        </span>
      </span>
      <span className="flex flex-1 flex-col">
        <button
          type="button"
          title={row.details}
          onClick={() => onOpen(row.url)}
          className={cn(
            "h-7 cursor-pointer text-left text-sm after:absolute after:inset-0 after:z-[2] after:rounded-md",
            row.draft ? "text-muted-foreground" : "text-foreground",
            FOCUS_RING,
          )}
        >
          {row.title}
        </button>
        <span className="flex h-4 items-center gap-1 text-2xs text-muted-foreground tabular-nums">
          <span>#{row.number}</span>
          <span aria-hidden="true">·</span>
          <Age at={row.updatedAt} />
          {via === null ? null : (
            <>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                title={`Open ${via.title}`}
                onClick={() => onOpenWorker(via.threadId)}
                className={cn(
                  "relative z-[3] cursor-pointer rounded-sm hover:text-foreground hover:underline",
                  FOCUS_RING,
                )}
              >
                via {via.title}
              </button>
            </>
          )}
        </span>
      </span>
      <span
        aria-label={`${row.additions} lines added, ${row.deletions} removed`}
        onClick={() => onOpen(row.url)}
        className="sticky right-0 z-[4] -my-1 shrink-0 cursor-pointer rounded-r-md bg-[linear-gradient(to_right,transparent,var(--row-bg)_0.625rem)] py-1 pr-2 pl-3.5 text-2xs tabular-nums"
      >
        <span className="flex h-7 items-center gap-1">
          <span className="text-diff-added">+{row.additions}</span>
          <span className="text-diff-removed">−{row.deletions}</span>
        </span>
      </span>
    </li>
  );
}

/** Rows older than this get their age beside the heading. */
const STALE_MS = 10 * 60_000;

/**
 * How old the rows are, beside the heading, when they are older than a
 * refresh or a failed read is backing off; the tooltip says when it retries.
 */
function Staleness({
  fetchedAt,
  retryAt,
}: {
  fetchedAt: number | null;
  retryAt: number | null;
}) {
  const now = useNow();
  if (retryAt === null && (fetchedAt === null || now - fetchedAt < STALE_MS))
    return null;
  const updated =
    fetchedAt === null ? "Not read yet" : `Updated ${formatAge(fetchedAt, now)} ago`;
  const retry =
    retryAt === null
      ? ""
      : `. GitHub is not answering; retrying at ${new Date(retryAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  return (
    <span
      title={`${updated}${retry}`}
      className="flex items-center gap-0.5 text-2xs tabular-nums text-muted-foreground/50"
    >
      <Icon name="Clock" aria-label={`${updated}${retry}`} className="size-3" />
      {fetchedAt === null ? null : formatAge(fetchedAt, now)}
    </span>
  );
}

/**
 * The user's open pull requests, a Crew group like the others. Its list holds
 * about five rows and scrolls both ways by itself, so the rest of the Crew tab
 * stays put and full titles can be read.
 */
export function PullRequestSection({
  rows,
  fetchedAt,
  retryAt,
  open,
  onToggle,
  onOpenWorker,
}: {
  rows: readonly Row[];
  fetchedAt: number | null;
  retryAt: number | null;
  open: boolean;
  onToggle: () => void;
  onOpenWorker: (threadId: string) => void;
}) {
  const openPullRequest = useOpenPullRequest();
  const list = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (list.current !== null) setEdgeFades(list.current);
  });
  if (rows.length === 0) return null;
  return (
    <section aria-label="Pull requests" className="flex flex-col gap-1">
      <ShelfHeading
        title="Pull requests"
        count={rows.length}
        open={open}
        onToggle={onToggle}
        note={<Staleness fetchedAt={fetchedAt} retryAt={retryAt} />}
        className="px-2"
      />
      {open ? (
        <div
          ref={list}
          data-testid="pull-request-list"
          onScroll={(event) => setEdgeFades(event.currentTarget)}
          className="max-h-[calc(5.5*3.3125rem)] overflow-auto overscroll-contain [scrollbar-color:color-mix(in_oklch,var(--foreground)_22%,transparent)_transparent] [scrollbar-width:thin] [--fade-bottom:black] [--fade-top:black] [mask-image:linear-gradient(to_bottom,var(--fade-top),black_1.25rem,black_calc(100%-1.25rem),var(--fade-bottom))] data-more-above:[--fade-top:transparent] data-more-below:[--fade-bottom:transparent]"
        >
          <ul className="m-0 flex w-max min-w-full flex-col gap-px p-0">
            {rows.map((row) => (
              <PullRequestRow
                key={row.key}
                row={row}
                onOpen={openPullRequest}
                onOpenWorker={onOpenWorker}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
