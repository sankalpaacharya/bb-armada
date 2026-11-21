import { useEffect, useState } from "react";
import {
  useSdk,
  type ExperimentalProviderModelPickerRouting,
  type ExperimentalProviderModelPickerValue,
} from "@get-bb/plugin-sdk/app";

import { preferredServiceTier } from "@/lib/service-tier";

import type { CaptainDialogState } from "@/components/captain-dialog";

type Selection = ExperimentalProviderModelPickerValue;
type Execution = {
  tierReady: boolean;
  tierOverride: string | null;
  initial: Selection;
  value: Selection;
  routing?: ExperimentalProviderModelPickerRouting;
};
/** New and adopted Claude Code captains start on Opus 5.5 at medium effort. */
const CLAUDE_CAPTAIN = { model: "claude-opus-5-5", reasoningLevel: "medium" };
const captainDefaults = (selection: Selection): Selection =>
  selection.providerId === "claude-code"
    ? { ...selection, ...CLAUDE_CAPTAIN }
    : selection;

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
  const adopting = state.kind === "adopt";
  const enabled = key !== "";
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
        return {
          initial,
          value: adopting ? captainDefaults(initial) : initial,
          routing,
          tierReady: true,
          tierOverride: null,
        };
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
          ? captainDefaults({
              providerId: config.generalSettings.defaultProviderId ?? "",
              model: "",
              reasoningLevel: "medium",
            })
          : captainDefaults({
              providerId: defaults.providerId,
              model: defaults.model,
              reasoningLevel: defaults.reasoningLevel,
              serviceTier: defaults.serviceTier,
            });
      return {
        initial,
        value: initial,
        tierReady: false,
        tierOverride: null,
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
  }, [
    sdk,
    key,
    enabled,
    adopting,
    projectId,
    providerId,
    environmentId,
    hostId,
  ]);

  const execution =
    load.key === key && load.kind === "ready" ? load.execution : null;
  const tierProviderId = execution?.value.providerId;
  const tierModel = execution?.value.model;
  const tierRouting = execution?.routing;
  const tierReady = execution?.tierReady;
  const tierOverride = execution?.tierOverride;
  useEffect(() => {
    if (
      state.kind !== "create" ||
      tierReady !== false ||
      !tierProviderId ||
      !tierModel
    )
      return;
    let cancelled = false;
    const routing =
      tierRouting === undefined
        ? { projectId }
        : tierRouting.kind === "host"
          ? { hostId: tierRouting.hostId, projectId }
          : { environmentId: tierRouting.environmentId };
    const resolved = (serviceTier: string) => {
      if (cancelled) return;
      setLoad((current) => {
        if (
          current.kind !== "ready" ||
          current.key !== key ||
          current.execution.value.providerId !== tierProviderId ||
          current.execution.value.model !== tierModel
        )
          return current;
        return {
          ...current,
          execution: {
            ...current.execution,
            tierReady: true,
            value: { ...current.execution.value, serviceTier },
          },
        };
      });
    };
    const request = {
      ...routing,
      providerId: tierProviderId,
      selectedModel: tierModel,
    };
    void sdk.providers.models(request).then(
      (catalog) =>
        resolved(
          preferredServiceTier(
            catalog,
            tierProviderId,
            tierModel,
            tierOverride ?? null,
          ),
        ),
      () => resolved("default"),
    );
    return () => {
      cancelled = true;
    };
  }, [
    sdk,
    state.kind,
    key,
    tierProviderId,
    tierModel,
    tierRouting,
    tierReady,
    tierOverride,
    projectId,
  ]);

  const setValue = (value: Selection) => {
    setLoad((current) => {
      if (current.key !== key || current.kind !== "ready") return current;
      if (thread !== null && value.providerId !== thread.providerId)
        return current;
      const previous = current.execution.value;
      const sameModel =
        previous.providerId === value.providerId &&
        previous.model === value.model;
      const explicitTier =
        thread === null &&
        sameModel &&
        current.execution.tierReady &&
        previous.reasoningLevel === value.reasoningLevel &&
        (previous.serviceTier ?? "default") !==
          (value.serviceTier ?? "default");
      const next =
        thread === null
          ? value
          : {
              ...value,
              serviceTier: current.execution.initial.serviceTier,
            };
      if (
        previous.providerId === next.providerId &&
        previous.model === next.model &&
        previous.reasoningLevel === next.reasoningLevel &&
        (previous.serviceTier ?? "default") === (next.serviceTier ?? "default")
      )
        return current;
      return {
        ...current,
        execution: {
          ...current.execution,
          value: next,
          tierReady:
            thread !== null ||
            (sameModel && current.execution.tierReady && !explicitTier),
          tierOverride: explicitTier
            ? (value.serviceTier ?? "default")
            : current.execution.tierOverride,
        },
      };
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
