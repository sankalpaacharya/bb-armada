import { useEffect, useState } from "react";
import {
  useSdk,
  type ExperimentalProviderModelPickerRouting,
  type ExperimentalProviderModelPickerValue,
} from "@get-bb/plugin-sdk/app";

import type { CaptainDialogState } from "@/components/captain-dialog";

type Selection = ExperimentalProviderModelPickerValue;
type Execution = {
  initial: Selection;
  value: Selection;
  routing?: ExperimentalProviderModelPickerRouting;
};
type Load =
  | { key: string; kind: "ready"; execution: Execution }
  | { key: string; kind: "error" }
  | { key: string; kind: "loading" };

export function useCaptainExecution(
  state: CaptainDialogState,
  projectId: string,
) {
  const sdk = useSdk();
  const thread = state.kind === "edit" ? state.thread : null;
  const providerId = thread?.providerId;
  const environmentId = thread?.environment?.id;
  const hostId = thread?.host?.id;
  const key = state.kind === "create" ? projectId : (thread?.id ?? "");
  const enabled = state.kind !== "adopt" && key !== "";
  const [load, setLoad] = useState<Load>({ key, kind: "loading" });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoad({ key, kind: "loading" });
    const read = async (): Promise<Execution> => {
      if (providerId !== undefined) {
        const defaults = await sdk.threads.defaultExecutionOptions({
          threadId: key,
        });
        if (defaults === null)
          throw new Error("Thread execution options unavailable");
        const initial: Selection = {
          providerId,
          model: defaults.model,
          reasoningLevel: defaults.reasoningLevel,
          serviceTier: defaults.serviceTier,
        };
        const routing: ExperimentalProviderModelPickerRouting | undefined =
          environmentId
            ? { kind: "environment", environmentId }
            : hostId
              ? { kind: "host", hostId }
              : undefined;
        return { initial, value: initial, routing };
      }
      const [project, defaults, config] = await Promise.all([
        sdk.projects.get({ projectId }),
        sdk.projects.defaultExecutionOptions({ projectId }),
        sdk.system.config(),
      ]);
      let source = project.sources.find(
        (candidate) => candidate.hostId === config.primaryHostId,
      );
      if (source === undefined && project.sources.length > 0) {
        const hosts = await sdk.hosts.list();
        const persistent = new Set(
          hosts
            .filter((host) => host.type === "persistent")
            .map((host) => host.id),
        );
        source = project.sources
          .filter((candidate) => persistent.has(candidate.hostId))
          .sort(
            (a, b) =>
              Number(b.isDefault) - Number(a.isDefault) ||
              a.createdAt - b.createdAt ||
              a.id.localeCompare(b.id),
          )[0];
      }
      const initial: Selection =
        defaults === null
          ? {
              providerId: config.generalSettings.defaultProviderId ?? "",
              model: "",
              reasoningLevel: "medium",
            }
          : {
              providerId: defaults.providerId,
              model: defaults.model,
              reasoningLevel: defaults.reasoningLevel,
              serviceTier: defaults.serviceTier,
            };
      return {
        initial,
        value: initial,
        ...(source === undefined
          ? {}
          : { routing: { kind: "host", hostId: source.hostId } }),
      };
    };
    void read().then(
      (execution) => {
        if (!cancelled) setLoad({ key, kind: "ready", execution });
      },
      () => {
        if (!cancelled) setLoad({ key, kind: "error" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [sdk, key, enabled, projectId, providerId, environmentId, hostId]);

  const execution =
    load.key === key && load.kind === "ready" ? load.execution : null;
  const setValue = (value: Selection) => {
    setLoad((current) => {
      if (current.key !== key || current.kind !== "ready") return current;
      if (thread !== null && value.providerId !== thread.providerId)
        return current;
      const next =
        thread === null
          ? value
          : {
              ...value,
              serviceTier: current.execution.initial.serviceTier,
            };
      const previous = current.execution.value;
      if (
        previous.providerId === next.providerId &&
        previous.model === next.model &&
        previous.reasoningLevel === next.reasoningLevel &&
        previous.serviceTier === next.serviceTier
      )
        return current;
      return { ...current, execution: { ...current.execution, value: next } };
    });
  };
  const changed =
    execution !== null &&
    (execution.value.model !== execution.initial.model ||
      execution.value.reasoningLevel !== execution.initial.reasoningLevel);
  return {
    execution,
    setValue,
    changed,
    error: load.key === key && load.kind === "error",
  };
}
