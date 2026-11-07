import { useState, type ReactNode } from "react";
import {
  experimental_useRpcMutation,
  useBbNavigate,
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
import { captainTitle } from "@/lib/captain-text";
import type { Avatar, CaptainRecord } from "@/lib/captains";
import { rpcContract } from "@/lib/rpc";
import { toastFailure } from "@/lib/toast";
import { CaptainTile } from "./captain-tile";
import { ChoiceList } from "./choice-list";

export type CaptainDialogState =
  | { kind: "create" }
  | { kind: "adopt"; thread: PluginSidebarThread }
  | { kind: "edit"; thread: PluginSidebarThread; record: CaptainRecord };

const OFFERED = 12;

function startingProject(
  projects: readonly PluginSidebarProject[],
  activeProjectId: string | null,
): string {
  const active = projects.find((project) => project.id === activeProjectId);
  return (active ?? projects[0])?.id ?? "";
}

/** A fresh set of offers, with the current avatar kept first so it can be picked again. */
function offerAvatars(keep: Avatar | null): Avatar[] {
  const offers = Array.from({ length: OFFERED }, randomAvatar);
  if (keep !== null) offers[0] = keep;
  return offers;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
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
  edit: {
    title: "Change avatar",
    action: "Save",
    description: "Pick how this captain looks in the sidebar.",
  },
} as const;

export function CaptainDialog({
  state,
  projects,
  activeProjectId,
  onClose,
  onNavigate,
}: {
  state: CaptainDialogState;
  projects: readonly PluginSidebarProject[];
  activeProjectId: string | null;
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
  const navigate = useBbNavigate();
  const [offers, setOffers] = useState(() =>
    offerAvatars(state.kind === "edit" ? state.record.avatar : null),
  );
  const [avatar, setAvatar] = useState<Avatar>(() => offers[0]!);
  const [projectId, setProjectId] = useState(() =>
    startingProject(projects, activeProjectId),
  );
  const [pending, setPending] = useState(false);
  const project = projects.find((candidate) => candidate.id === projectId);
  const copy = COPY[state.kind];
  const canSubmit = state.kind !== "create" || project !== undefined;
  const previewTitle =
    state.kind === "create"
      ? project === undefined
        ? "Choose a project"
        : captainTitle(project.name)
      : state.thread.displayTitle;

  const shuffle = () => {
    const next = offerAvatars(null);
    setOffers(next);
    setAvatar(next[0]!);
  };

  const submit = async () => {
    if (pending || !canSubmit) return;
    setPending(true);
    try {
      if (state.kind === "create" && project !== undefined) {
        const created = await create.mutate({
          projectId: project.id,
          projectName: project.name,
          avatar,
        });
        navigate.toThread(created.threadId);
        onNavigate();
      } else if (state.kind === "adopt") {
        await adopt.mutate({ threadId: state.thread.id, avatar });
      } else if (state.kind === "edit") {
        await update.mutate({ threadId: state.thread.id, avatar });
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
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3 rounded-lg bg-accent/50 p-3">
          <CaptainTile avatar={avatar} size="preview" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {previewTitle}
          </span>
        </div>
        {state.kind === "create" ? (
          <Field label="Project">
            <ChoiceList
              label="Project"
              choices={projects.map((candidate) => ({
                id: candidate.id,
                label: candidate.name,
              }))}
              value={projectId}
              onChange={setProjectId}
              className="max-h-36 overflow-y-auto rounded-lg border border-border p-1"
            />
          </Field>
        ) : null}
        <Field label="Avatar">
          <ChoiceList
            label="Avatar"
            choices={offers.map((offer, index) => ({
              id: offer.seed,
              label: `Avatar ${index + 1}`,
            }))}
            value={avatar.seed}
            onChange={(seed) =>
              setAvatar(offers.find((offer) => offer.seed === seed) ?? avatar)
            }
            className="grid grid-cols-6 gap-1"
            renderChoice={(choice, selected) => (
              <CaptainTile
                avatar={{ style: "adventurer", seed: choice.id }}
                size="preview"
                className={selected ? "ring-2 ring-ring" : undefined}
              />
            )}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-self-start"
            onClick={shuffle}
          >
            <Icon name="Shuffle" />
            Shuffle
          </Button>
        </Field>
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
