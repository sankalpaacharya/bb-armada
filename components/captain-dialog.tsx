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
import { captainTitle, withoutLeadingEmoji } from "@/lib/captain-text";
import type { CaptainRecord } from "@/lib/captains";
import { COLORS, DEFAULT_COLOR, type ColorId } from "@/lib/colors";
import { DEFAULT_LOGO, LOGOS, logoIcon, type LogoId } from "@/lib/logos";
import { rpcContract } from "@/lib/rpc";
import { toastFailure } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { CaptainTile } from "./captain-tile";

export type CaptainDialogState =
  | { kind: "create" }
  | { kind: "adopt"; thread: PluginSidebarThread }
  | { kind: "edit"; thread: PluginSidebarThread; record: CaptainRecord };

type CaptainDialogProps = {
  state: CaptainDialogState;
  projects: readonly PluginSidebarProject[];
  activeProjectId: string | null;
  onClose: () => void;
  onNavigate: () => void;
};

function startingProject(
  projects: readonly PluginSidebarProject[],
  activeProjectId: string | null,
): string {
  const active = projects.find((project) => project.id === activeProjectId);
  return (active ?? projects[0])?.id ?? "";
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function ProjectPicker({
  projects,
  value,
  onChange,
}: {
  projects: readonly PluginSidebarProject[];
  value: string;
  onChange: (projectId: string) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Project"
      className="grid max-h-36 gap-px overflow-y-auto rounded-lg border border-border p-1"
    >
      {projects.map((project) => (
        <button
          key={project.id}
          type="button"
          role="radio"
          aria-checked={project.id === value}
          onClick={() => onChange(project.id)}
          className={cn(
            "flex h-7 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring",
            project.id === value
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
          )}
        >
          <span className="min-w-0 flex-1 truncate">{project.name}</span>
          {project.id === value ? (
            <Icon name="Check" className="size-3.5 shrink-0" />
          ) : null}
        </button>
      ))}
    </div>
  );
}

function LogoGrid({
  value,
  onChange,
}: {
  value: LogoId;
  onChange: (logo: LogoId) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Logo" className="grid grid-cols-8 gap-1">
      {LOGOS.map((logo) => (
        <button
          key={logo}
          type="button"
          role="radio"
          aria-checked={logo === value}
          aria-label={logo.replace("-", " ")}
          title={logo.replace("-", " ")}
          onClick={() => onChange(logo)}
          className={cn(
            "grid aspect-square cursor-pointer place-items-center rounded-[7px] outline-none focus-visible:ring-2 focus-visible:ring-ring",
            logo === value
              ? "bg-accent text-foreground ring-1 ring-foreground/40"
              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
          )}
        >
          <Icon name={logoIcon(logo)} className="size-[18px]" />
        </button>
      ))}
    </div>
  );
}

function ColorSwatches({
  value,
  onChange,
}: {
  value: ColorId;
  onChange: (color: ColorId) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-2">
      {COLORS.map((color) => (
        <button
          key={color.id}
          type="button"
          role="radio"
          aria-checked={color.id === value}
          aria-label={color.label}
          title={color.label}
          onClick={() => onChange(color.id)}
          className={cn(
            "grid size-6 cursor-pointer place-items-center rounded-md text-white outline-none focus-visible:ring-2 focus-visible:ring-ring",
            color.className,
            color.id === value &&
              "ring-2 ring-foreground/70 ring-offset-2 ring-offset-background",
          )}
        >
          {color.id === value ? (
            <Icon name="Check" className="size-3.5" />
          ) : null}
        </button>
      ))}
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
    title: "Change logo",
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
}: CaptainDialogProps) {
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
            ? {
                ...record,
                logo: input.logo ?? record.logo,
                color: input.color ?? record.color,
              }
            : record,
        ),
      ),
  });
  const navigate = useBbNavigate();
  const initial = state.kind === "edit" ? state.record : null;
  const [logo, setLogo] = useState<LogoId>(initial?.logo ?? DEFAULT_LOGO);
  const [color, setColor] = useState<ColorId>(initial?.color ?? DEFAULT_COLOR);
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
        : withoutLeadingEmoji(captainTitle(project.name))
      : withoutLeadingEmoji(state.thread.displayTitle);

  const submit = async () => {
    if (pending || !canSubmit) return;
    setPending(true);
    try {
      if (state.kind === "create" && project !== undefined) {
        const created = await create.mutate({
          projectId: project.id,
          projectName: project.name,
          logo,
          color,
        });
        navigate.toThread(created.threadId);
        onNavigate();
      } else if (state.kind === "adopt") {
        await adopt.mutate({ threadId: state.thread.id, logo, color });
      } else if (state.kind === "edit") {
        await update.mutate({ threadId: state.thread.id, logo, color });
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
          <CaptainTile logo={logo} color={color} size="preview" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {previewTitle}
          </span>
        </div>
        {state.kind === "create" ? (
          <Field label="Project">
            <ProjectPicker
              projects={projects}
              value={projectId}
              onChange={setProjectId}
            />
          </Field>
        ) : null}
        <Field label="Logo">
          <LogoGrid value={logo} onChange={setLogo} />
        </Field>
        <Field label="Colour">
          <ColorSwatches value={color} onChange={setColor} />
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
