import { useMemo } from "react";
import {
  experimental_useSidebarThreads,
  useSettings,
} from "@get-bb/plugin-sdk/app";

import type { CaptainRecord } from "@/lib/captains";
import { useWakeTime } from "@/lib/clock";
import { inactiveWakesOf, wakesOf } from "@/lib/lifecycle";
import { buildArmada } from "@/lib/model";
import { parseSettings } from "@/lib/settings";
import { useCaptains } from "./use-captains";
import { useParks } from "./use-parks";
import { useProjectLogos } from "./use-project-logos";
import { useSupervisors } from "./use-supervisors";

const NO_CAPTAINS: readonly CaptainRecord[] = [];

/** Threads, captains and parks folded into the view model the sidebar and the Crew tab share. */
export function useArmadaModel() {
  const { status, threads, projects } = experimental_useSidebarThreads();
  const captains = useCaptains();
  const parks = useParks();
  const logos = useProjectLogos();
  const supervisors = useSupervisors();
  const { inactiveAfterMs } = parseSettings(useSettings().values);
  const records = captains.status === "ready" ? captains.records : NO_CAPTAINS;
  const wakeTime = useWakeTime([
    ...wakesOf(parks),
    ...inactiveWakesOf(threads, inactiveAfterMs),
  ]);
  const model = useMemo(
    () =>
      buildArmada(
        threads,
        projects,
        logos,
        records,
        parks,
        supervisors,
        wakeTime,
        inactiveAfterMs,
      ),
    [
      threads,
      projects,
      logos,
      records,
      parks,
      supervisors,
      wakeTime,
      inactiveAfterMs,
    ],
  );
  return { status, threads, projects, captains, model };
}
