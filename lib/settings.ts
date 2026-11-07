import type { PluginSettingDescriptors } from "@get-bb/plugin-sdk";
import { z } from "zod";

import type { AutoSettleSettings } from "./lifecycle";

const HOUR = 3_600_000;

export const SETTINGS = {
  inactiveAfterHours: {
    type: "number",
    label: "Inactive after, hours (0 = never)",
    description:
      "A thread with no activity for this long moves to the Inactive shelf. Pinned and live threads stay active.",
    experimental_schema: z.number().min(0).max(8760),
    default: 6,
  },
  autoSettleAfterDays: {
    type: "number",
    label: "Settle automatically after, days (0 = never)",
    description:
      "A thread quiet this long is settled, unless its pull request is open or a draft. New activity brings it back.",
    experimental_schema: z.number().int().min(0).max(365),
    default: 3,
  },
  autoSettleOnMerge: {
    type: "boolean",
    label: "Settle when the pull request merges",
    description:
      "A closed pull request always settles its thread; this adds merged ones.",
    default: true,
  },
  logoSkipProjects: {
    type: "string",
    label: "Projects to leave alone for logos",
    description:
      "Project names, one per line or comma-separated. Armada never reads these projects' files to find a logo.",
    experimental_multiline: true,
    default: "",
  },
} as const satisfies PluginSettingDescriptors;

/** The project names whose files the logo scan must not read, lowercased. */
export function logoSkipProjects(
  values: Readonly<Record<string, unknown>> | undefined,
): ReadonlySet<string> {
  const raw = values?.logoSkipProjects;
  if (typeof raw !== "string") return new Set();
  return new Set(
    raw
      .split(/[,\n]/)
      .map((name) => name.trim().toLowerCase())
      .filter((name) => name !== ""),
  );
}

export type ShelfSettings = {
  inactiveAfterMs: number | null;
  autoSettle: AutoSettleSettings;
};

const count = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;

/** Whatever bb stored, or nothing while it loads, as typed settings. Zero turns a threshold off. */
export function parseSettings(
  values: Readonly<Record<string, unknown>> | undefined,
): ShelfSettings {
  const source = values ?? {};
  const hours = count(
    source.inactiveAfterHours,
    SETTINGS.inactiveAfterHours.default,
  );
  const days = count(
    source.autoSettleAfterDays,
    SETTINGS.autoSettleAfterDays.default,
  );
  return {
    inactiveAfterMs: hours === 0 ? null : hours * HOUR,
    autoSettle: {
      afterDays: days === 0 ? null : days,
      onMerge:
        typeof source.autoSettleOnMerge === "boolean"
          ? source.autoSettleOnMerge
          : SETTINGS.autoSettleOnMerge.default,
    },
  };
}
