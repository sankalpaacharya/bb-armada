import type { PluginSettingDescriptors } from "@get-bb/plugin-sdk";
import { z } from "zod";

import type { AutoSettleSettings } from "./lifecycle";

const HOUR = 3_600_000;

export const SETTINGS = {
  avatarStyle: {
    type: "select",
    label: "Captain avatars",
    description: "Choose initials or illustrated faces for captains without a logo.",
    options: ["faces", "initials"],
    experimental_optionLabels: { faces: "Illustrated faces", initials: "Initials" },
    default: "faces",
  },
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
  autoCompactProjects: {
    type: "string",
    label: "Auto-compact projects",
    description:
      "Project ids whose captains, crew captains and workers Armada compacts when idle past the thresholds below. Turn a project on from its captain's Edit dialog.",
    experimental_multiline: true,
    default: "proj_try5hy6jg4",
  },
  autoCompactCoordinatorK: {
    type: "number",
    label: "Compact captains past, K tokens (0 = never)",
    description:
      "A captain or crew captain this far into its context is compacted when it next goes idle.",
    experimental_schema: z.number().int().min(0).max(1000),
    default: 200,
  },
  autoCompactWorkerK: {
    type: "number",
    label: "Compact workers past, K tokens (0 = never)",
    description:
      "A worker this far into its context is compacted when it next goes idle.",
    experimental_schema: z.number().int().min(0).max(1000),
    default: 300,
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

export type AutoCompactSettings = {
  projects: ReadonlySet<string>;
  /** Thresholds in K tokens; 0 never compacts that role. */
  coordinatorK: number;
  workerK: number;
};

const projectIds = (raw: unknown): string[] =>
  typeof raw !== "string"
    ? []
    : raw
        .split(/[,\n]/)
        .map((id) => id.trim())
        .filter((id) => id !== "");

export function parseAutoCompact(
  values: Readonly<Record<string, unknown>> | undefined,
): AutoCompactSettings {
  const source = values ?? {};
  return {
    projects: new Set(
      projectIds(
        source.autoCompactProjects ?? SETTINGS.autoCompactProjects.default,
      ),
    ),
    coordinatorK: count(
      source.autoCompactCoordinatorK,
      SETTINGS.autoCompactCoordinatorK.default,
    ),
    workerK: count(
      source.autoCompactWorkerK,
      SETTINGS.autoCompactWorkerK.default,
    ),
  };
}

/** The stored project list with `projectId` added or removed, one id per line. */
export function withAutoCompactProject(
  values: Readonly<Record<string, unknown>> | undefined,
  projectId: string,
  on: boolean,
): string {
  const kept = [...parseAutoCompact(values).projects].filter(
    (id) => id !== projectId,
  );
  return (on ? [...kept, projectId] : kept).join("\n");
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
