import {
  experimental_ProviderIcon as ProviderIcon,
  experimental_useProviders,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";

import { Icon } from "@/components/ui/icon";
import { PullRequestNumber } from "./pull-request-number";

function ProviderGlyph({ providerId }: { providerId: string }) {
  const { providers } = experimental_useProviders();
  const provider = providers.find((candidate) => candidate.id === providerId);
  return (
    <span className="flex size-3.5 shrink-0 items-center justify-center opacity-60 grayscale">
      <ProviderIcon
        providerKind="agent"
        provider={provider ?? { id: providerId }}
        aria-label={provider?.displayName ?? providerId}
        className="size-3 text-muted-foreground/70"
      />
    </span>
  );
}

function ActivityCount({ label, count }: { label: string; count: number }) {
  return (
    <span
      aria-label={`${count} ${label}`}
      className="shrink-0 rounded bg-muted px-1 font-mono text-2xs text-muted-foreground"
    >
      {count}
    </span>
  );
}

/** A card's third line: where the thread runs, its activity, PR and harness. */
export function PlaceLine({ thread }: { thread: PluginSidebarThread }) {
  const environment = thread.environment;
  const branch = environment?.branchName ?? null;
  const placeIcon =
    branch !== null
      ? environment?.isWorktree === true
        ? { name: "FolderGit", label: "Worktree" }
        : { name: "GitBranch", label: "Branch" }
      : thread.host !== null
        ? { name: "Laptop", label: "Machine" }
        : null;
  return (
    <div className="pointer-events-none relative mt-0.5 flex h-4 items-center gap-1.5 text-2xs text-muted-foreground">
      {placeIcon === null ? null : (
        <Icon
          name={placeIcon.name}
          aria-label={placeIcon.label}
          className="size-3 shrink-0 text-muted-foreground"
        />
      )}
      {branch !== null ? (
        <span className="min-w-0 flex-1 truncate font-mono">{branch}</span>
      ) : thread.host !== null ? (
        <span className="min-w-0 flex-1 truncate">{thread.host.name}</span>
      ) : (
        <span className="flex-1" />
      )}
      {thread.activity.workflows > 0 ? (
        <ActivityCount label="workflows" count={thread.activity.workflows} />
      ) : null}
      {thread.activity.backgroundAgents > 0 ? (
        <ActivityCount
          label="background agents"
          count={thread.activity.backgroundAgents}
        />
      ) : null}
      <PullRequestNumber environmentId={environment?.id ?? null} />
      <ProviderGlyph providerId={thread.providerId} />
    </div>
  );
}
