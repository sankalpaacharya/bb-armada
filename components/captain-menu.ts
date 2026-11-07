import {
  experimental_THREAD_ACTION_GROUPS as GROUPS,
  type PluginThreadActionsInlineItem,
} from "@get-bb/plugin-sdk/app";

import { DEFAULT_LOGO, logoIcon } from "@/lib/logos";
import type { CaptainRecord } from "@/lib/captains";

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
