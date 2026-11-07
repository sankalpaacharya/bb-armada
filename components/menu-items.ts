import {
  experimental_THREAD_ACTION_GROUPS as GROUPS,
  type PluginThreadActionsInlineItem,
} from "@get-bb/plugin-sdk/app";

import type { ParkActions } from "@/hooks/use-park-actions";
import type { CaptainRecord } from "@/lib/captains";
import { snoozePresets, type Shelf } from "@/lib/lifecycle";
import { DEFAULT_LOGO, logoIcon } from "@/lib/logos";
import type { ThreadEntry } from "@/lib/model";
import { canPark } from "@/lib/status";

export function makeCaptainItem(
  onSelect: () => void,
): PluginThreadActionsInlineItem {
  return {
    key: "make-captain",
    group: GROUPS.organize,
    action: {
      label: "Make captain…",
      icon: logoIcon(DEFAULT_LOGO),
      run: onSelect,
    },
  };
}

export function captainItems(
  record: CaptainRecord,
  actions: { changeLogo: () => void; remove: () => void },
): PluginThreadActionsInlineItem[] {
  return [
    {
      key: "change-logo",
      group: GROUPS.organize,
      action: {
        label: "Change logo…",
        icon: logoIcon(record.logo),
        run: actions.changeLogo,
      },
    },
    {
      key: "remove-captain",
      group: GROUPS.organize,
      action: { label: "Remove from captains", icon: "X", run: actions.remove },
    },
  ];
}

/** Settle and the snooze presets for a parkable thread; Move to active for a parked one. */
export function parkItems(
  entry: Pick<ThreadEntry, "thread" | "status"> & { shelf: Shelf },
  actions: ParkActions,
): PluginThreadActionsInlineItem[] {
  const { id } = entry.thread;
  if (entry.shelf !== "active") {
    return [
      {
        key: "unpark",
        group: GROUPS.lifecycle,
        action: {
          label: "Move to active",
          icon: "ArrowTurnBackward",
          run: () => actions.unpark(id),
        },
      },
    ];
  }
  if (!canPark(entry.status)) return [];
  const presets = snoozePresets(new Date());
  return [
    {
      key: "settle",
      group: GROUPS.lifecycle,
      action: { label: "Settle", icon: "Check", run: () => actions.settle(id) },
    },
    {
      key: "snooze",
      group: GROUPS.lifecycle,
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
