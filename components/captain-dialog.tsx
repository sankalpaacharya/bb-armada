import { useId, useState, type ReactNode } from "react";
import {
  experimental_useRpcMutation,
  experimental_useRpcQuery,
  useBbNavigate,
  useSdk,
  type PluginSidebarProject,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { randomAvatar } from "@/lib/avatar";
import { INSTRUCTIONS_MAX } from "@/lib/captain-instructions";
import { captainTitle } from "@/lib/captain-text";
import type { Avatar, CaptainRecord } from "@/lib/captains";
import { rpcContract } from "@/lib/rpc";
import { FOCUS_RING } from "@/lib/styles";
import { toastFailure } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { CaptainTile } from "./captain-tile";
import { Dropdown } from "./dropdown";

export type CaptainDialogState =
  | { kind: "create" }
  | { kind: "adopt"; thread: PluginSidebarThread }
  | { kind: "edit"; thread: PluginSidebarThread; record: CaptainRecord };

const NAME_MAX = 80;
/** The counter shows once this few characters are left. */
const INSTRUCTIONS_WARN = 300;

/** The open project, captained or not, since a project can have several captains. */
export function startingProject(
  projects: readonly PluginSidebarProject[],
  activeProjectId: string | null,
): string {
  const active = projects.find((project) => project.id === activeProjectId);
  return (active ?? projects[0])?.id ?? "";
}

const captainsLabel = (count: number): string | undefined =>
  count === 0 ? undefined : count === 1 ? "1 captain" : `${count} captains`;

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  const Label = htmlFor === undefined ? "span" : "label";
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor} className="text-sm text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

const COPY = {
  create: {
    title: "New captain",
    action: "Create captain",
    description:
      "A long-lived thread that keeps notes for a project and hands work to worker threads.",
  },
  adopt: {
    title: "Make captain",
    action: "Make captain",
    description: "Pin this thread to the top as the captain of its project.",
  },
  unrecorded: {
    title: "New captain",
    action: "Record captain",
    description:
      "The captain's thread started, but it could not be recorded. Record it now; no second thread is started.",
  },
  edit: {
    title: "Edit captain",
    action: "Save changes",
    description:
      "Rename this captain, change how it looks in the sidebar, or change how it works.",
  },
} as const;

export function CaptainDialog({
  state,
  projects,
  activeProjectId,
  captainCounts,
  onClose,
  onNavigate,
}: {
  state: CaptainDialogState;
  projects: readonly PluginSidebarProject[];
  activeProjectId: string | null;
  /** How many captains each project already has. */
  captainCounts: ReadonlyMap<string, number>;
  onClose: () => void;
  onNavigate: () => void;
}) {
  const create = experimental_useRpcMutation({
    contract: rpcContract,
    method: "captains_create",
  });
  const adopt = experimental_useRpcMutation({
    contract: rpcContract,
    method: "captains_adopt",
    optimistic: ({ threadId, avatar, createdAt }, cache) => {
      cache.update("captains_list", null, (current) => {
        const kept = current.find((record) => record.threadId === threadId);
        return [
          ...current.filter((record) => record.threadId !== threadId),
          { threadId, avatar, createdAt: kept?.createdAt ?? createdAt },
        ];
      });
      cache.update("parks_list", null, (current) =>
        current.filter((park) => park.threadId !== threadId),
      );
    },
  });
  const update = experimental_useRpcMutation({
    contract: rpcContract,
    method: "captains_update",
    optimistic: (input, cache) =>
      cache.update("captains_list", null, (current) =>
        current.map((record) =>
          record.threadId === input.threadId
            ? { ...record, avatar: input.avatar }
            : record,
        ),
      ),
  });
  const saveInstructions = experimental_useRpcMutation({
    contract: rpcContract,
    method: "captain_instructions_save",
  });
  const navigate = useBbNavigate();
  const sdk = useSdk();
  const nameId = useId();
  const instructionsId = useId();
  const [avatar, setAvatar] = useState<Avatar>(() =>
    state.kind === "edit" ? state.record.avatar : randomAvatar(),
  );
  const [projectId, setProjectId] = useState(() =>
    startingProject(projects, activeProjectId),
  );
  const [typedName, setTypedName] = useState<string | null>(null);
  const [typedInstructions, setTypedInstructions] = useState<string | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  /** The thread a create spawned but could not record, and its home; a retry records them. */
  const [spawned, setSpawned] = useState<{
    threadId: string;
    home: string;
  } | null>(null);
  const project = projects.find((candidate) => candidate.id === projectId);
  const projectCaptains =
    project === undefined
      ? undefined
      : captainsLabel(captainCounts.get(project.id) ?? 0);
  const copy = COPY[spawned === null ? state.kind : "unrecorded"];
  const currentTitle =
    state.kind === "create"
      ? null
      : (state.thread.title ?? state.thread.displayTitle);
  const defaultName =
    currentTitle ?? (project === undefined ? "" : captainTitle(project.name));
  const name = typedName ?? defaultName;
  const trimmedName = name.trim();
  const renamed = currentTitle !== null && trimmedName !== currentTitle;
  const avatarChanged =
    state.kind === "edit" && avatar.seed !== state.record.avatar.seed;
  const editedProject =
    state.kind === "edit"
      ? projects.find((candidate) => candidate.id === state.thread.projectId)
      : undefined;
  const edited = {
    threadId: state.kind === "edit" ? state.thread.id : "",
    project: editedProject?.name ?? "",
  };
  const saved = experimental_useRpcQuery({
    contract: rpcContract,
    method: "captain_instructions",
    input: edited,
    enabled: editedProject !== undefined,
  });
  const home = experimental_useRpcQuery({
    contract: rpcContract,
    method: "captain_home",
    input: edited,
    enabled: editedProject !== undefined,
  });
  /** Instructions are asked for on a new captain and changed on an edit, never on an adopt or a retry. */
  const asksInstructions =
    state.kind === "create" ? spawned === null : editedProject !== undefined;
  const loadingInstructions = state.kind === "edit" && saved.data === undefined;
  const instructions = typedInstructions ?? saved.data ?? "";
  const trimmedInstructions = instructions.trim();
  const instructionsChanged =
    state.kind === "edit" &&
    saved.data !== undefined &&
    trimmedInstructions !== saved.data.trim();
  const canSubmit =
    trimmedName !== "" &&
    (state.kind === "create"
      ? project !== undefined
      : state.kind === "adopt" ||
        renamed ||
        avatarChanged ||
        instructionsChanged);

  /** The recorded captain's thread, or null when it started but is not recorded yet. */
  const recordCreated = async (
    project: PluginSidebarProject,
  ): Promise<string | null> => {
    if (spawned !== null) {
      await adopt.mutate({
        threadId: spawned.threadId,
        avatar,
        createdAt: new Date().toISOString(),
        name: trimmedName,
        home: spawned.home,
      });
      return spawned.threadId;
    }
    const created = await create.mutate({
      projectId: project.id,
      projectName: project.name,
      name: trimmedName,
      avatar,
      ...(trimmedInstructions === ""
        ? {}
        : { instructions: trimmedInstructions }),
    });
    if (created.outcome === "recorded") return created.record.threadId;
    setSpawned({ threadId: created.threadId, home: created.home });
    toastFailure("Started the captain but could not record it", created.reason);
    return null;
  };

  const submit = async () => {
    if (pending || !canSubmit) return;
    setPending(true);
    try {
      if (state.kind === "create" && project !== undefined) {
        const threadId = await recordCreated(project);
        if (threadId === null) {
          setPending(false);
          return;
        }
        navigate.toThread(threadId);
        onNavigate();
      } else if (state.kind !== "create") {
        const threadId = state.thread.id;
        const [, , saving] = await Promise.all([
          renamed ? sdk.threads.update({ threadId, title: trimmedName }) : null,
          state.kind === "adopt"
            ? adopt.mutate({
                threadId,
                avatar,
                createdAt: new Date().toISOString(),
                name: trimmedName,
              })
            : avatarChanged
              ? update.mutate({ threadId, avatar })
              : null,
          instructionsChanged && editedProject !== undefined
            ? saveInstructions.mutate({
                project: editedProject.name,
                instructions: trimmedInstructions,
                threadId,
              })
            : null,
        ]);
        if (saving?.told === false)
          toastFailure(
            "Saved the instructions but could not tell the captain",
            "It reads them again at the start of its next turn.",
          );
      }
      onClose();
    } catch (cause) {
      setPending(false);
      toastFailure(
        `Could not ${state.kind === "create" ? "create the captain" : "save the captain"}`,
        cause,
      );
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent
        className="max-w-sm"
        // Escape inside the project list closes the list, not the dialog.
        onEscapeKeyDown={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest("[role=listbox]")
          )
            event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3 rounded-lg bg-accent/50 p-3">
          <button
            type="button"
            aria-label="New avatar"
            title="New avatar"
            onClick={() => setAvatar(randomAvatar())}
            className={cn(
              "group/avatar relative shrink-0 cursor-pointer rounded-[10px]",
              FOCUS_RING,
            )}
          >
            <CaptainTile avatar={avatar} size="preview" />
            <span
              aria-hidden="true"
              className="absolute -right-1.5 -bottom-1.5 grid size-5 place-items-center rounded-full border border-border bg-popover text-muted-foreground shadow-sm transition-colors group-hover/avatar:text-foreground"
            >
              <Icon name="RotateCcw" className="size-3" />
            </span>
          </button>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {name}
          </span>
        </div>
        <Field label="Name" htmlFor={nameId}>
          <input
            id={nameId}
            value={name}
            maxLength={NAME_MAX}
            readOnly={spawned !== null}
            autoComplete="off"
            onChange={(event) => setTypedName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submit();
              }
            }}
            className={`h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm text-foreground ${FOCUS_RING}`}
          />
        </Field>
        {editedProject === undefined ? null : (
          <>
            <Field label="Project">
              <span className="text-sm">{editedProject.name}</span>
            </Field>
            <Field label="Memory">
              <span className="truncate text-sm">
                {home.data?.folder ??
                  (home.error === null ? "Loading…" : "Could not load")}
              </span>
            </Field>
          </>
        )}
        {state.kind === "create" && spawned !== null ? (
          <Field label="Project">
            <span className="text-sm">{project?.name}</span>
          </Field>
        ) : state.kind === "create" ? (
          <Field label="Project">
            <Dropdown
              label="Project"
              triggerLabel={
                project === undefined ? "Project" : `Project: ${project.name}`
              }
              choices={projects.map((candidate) => ({
                id: candidate.id,
                label: candidate.name,
                detail: captainsLabel(captainCounts.get(candidate.id) ?? 0),
              }))}
              isSelected={(id) => id === projectId}
              onPick={setProjectId}
              align="stretch"
              triggerClassName={`flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm text-foreground ${FOCUS_RING}`}
              listClassName="max-h-48 overflow-y-auto"
            >
              <span className="min-w-0 flex-1 truncate">
                {project?.name}
                {projectCaptains === undefined ? null : (
                  <span className="text-muted-foreground">
                    {" "}
                    · {projectCaptains}
                  </span>
                )}
              </span>
            </Dropdown>
          </Field>
        ) : null}
        {asksInstructions ? (
          <Field label="Instructions" htmlFor={instructionsId}>
            <textarea
              id={instructionsId}
              value={instructions}
              maxLength={INSTRUCTIONS_MAX}
              rows={4}
              disabled={loadingInstructions}
              placeholder={
                loadingInstructions
                  ? saved.error === null
                    ? "Loading…"
                    : "Could not load the instructions"
                  : "How should this captain work? e.g. Act as a senior engineer, keep replies short, always ask before touching prod."
              }
              onChange={(event) => setTypedInstructions(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void submit();
                }
              }}
              className={`max-h-48 min-h-20 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground disabled:opacity-50 ${FOCUS_RING}`}
            />
            {instructions.length > INSTRUCTIONS_MAX - INSTRUCTIONS_WARN ? (
              <span className="text-right text-xs text-muted-foreground tabular-nums">
                {instructions.length} / {INSTRUCTIONS_MAX}
              </span>
            ) : null}
          </Field>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={pending || !canSubmit}
            onClick={() => void submit()}
          >
            {pending ? "Working…" : copy.action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
