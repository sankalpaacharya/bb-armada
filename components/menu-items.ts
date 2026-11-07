import {
  experimental_THREAD_ACTION_GROUPS as GROUPS,
  type PluginSidebarThread,
  type PluginThreadActionsInlineItem,
} from "@get-bb/plugin-sdk/app";

import type { ParkActions } from "@/hooks/use-park-actions";
import { snoozePresets } from "@/lib/lifecycle";
import type { CaptainEntry, ThreadEntry } from "@/lib/model";

export function makeCaptainItem(
  onSelect: () => void,
): PluginThreadActionsInlineItem {
  return {
    key: "make-captain",
    group: GROUPS.organize,
    action: { label: "Make captain…", icon: "Star", run: onSelect },
  };
}

export function captainItems(actions: {
  edit: () => void;
  remove: () => void;
}): PluginThreadActionsInlineItem[] {
  return [
    {
      key: "edit-captain",
      group: GROUPS.organize,
      action: { label: "Edit captain…", icon: "Edit", run: actions.edit },
    },
    {
      key: "remove-captain",
      group: GROUPS.organize,
      action: { label: "Remove from captains", icon: "X", run: actions.remove },
    },
  ];
}

/** A crew thread must be in its captain's project, so only those captains are offered. */
export function addToCaptainItems(
  entry: Pick<ThreadEntry, "thread" | "captain">,
  captains: readonly CaptainEntry[],
  onPick: (captainId: string) => void,
): PluginThreadActionsInlineItem[] {
  if (entry.captain !== null) return [];
  const offered = captains.filter(
    (captain) =>
      captain.thread.projectId === entry.thread.projectId &&
      captain.thread.id !== entry.thread.id,
  );
  if (offered.length === 0) return [];
  return [
    {
      key: "add-to-captain",
      group: GROUPS.organize,
      action: {
        label: "Add to captain",
        icon: "Layers",
        choices: {
          items: offered.map((captain) => ({
            id: captain.thread.id,
            label: captain.thread.displayTitle,
          })),
        },
        run: ({ value }) => {
          const captain = offered.find(
            (candidate) => candidate.thread.id === value,
          );
          if (captain !== undefined) onPick(captain.thread.id);
        },
      },
    },
  ];
}

/**
 * Clearing the parent link takes a worker out of its captain's crew only when
 * no lifecycle owner would hold it there instead.
 */
export function removeFromCrewItems(
  thread: Pick<PluginSidebarThread, "parentThreadId" | "lifecycleOwnerThreadId">,
  onRemove: () => void,
): PluginThreadActionsInlineItem[] {
  if (thread.parentThreadId === null || thread.lifecycleOwnerThreadId !== null)
    return [];
  return [
    {
      key: "remove-from-crew",
      group: GROUPS.organize,
      action: { label: "Remove from crew", icon: "X", run: onRemove },
    },
  ];
}

/** Its own section after bb's organize items, so Archive and Delete stay last. */
const PARK_GROUP = "3_park";

/**
 * Settle and the snooze presets for a parkable thread, inactive ones
 * included; Move to active for a snoozed or settled one.
 */
export function parkItems(
  entry: Pick<ThreadEntry, "thread" | "parkable" | "shelf">,
  actions: ParkActions,
): PluginThreadActionsInlineItem[] {
  const { id } = entry.thread;
  if (entry.shelf === "snoozed" || entry.shelf === "settled") {
    return [
      {
        key: "keep",
        group: PARK_GROUP,
        action: {
          label: "Move to active",
          icon: "ArrowTurnBackward",
          run: () => actions.keep(id),
        },
      },
    ];
  }
  if (!entry.parkable) return [];
  const presets = snoozePresets(new Date());
  return [
    {
      key: "settle",
      group: PARK_GROUP,
      action: { label: "Settle", icon: "Check", run: () => actions.settle(id) },
    },
    {
      key: "snooze",
      group: PARK_GROUP,
      action: {
        label: "Snooze",
        icon: "Clock",
        choices: {
          items: presets.map((preset) => ({
            id: preset.id,
            label: preset.label,
          })),
        },
        run: ({ value }) => {
          const preset = presets.find((candidate) => candidate.id === value);
          if (preset !== undefined) actions.snooze(id, preset.until);
        },
      },
    },
  ];
}
