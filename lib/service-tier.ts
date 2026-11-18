import type { useSdk } from "@get-bb/plugin-sdk/app";

type Catalog = Awaited<
  ReturnType<ReturnType<typeof useSdk>["providers"]["models"]>
>;

export function preferredServiceTier(
  catalog: Catalog,
  providerId: string,
  modelId: string,
  override: string | null,
): string {
  if (catalog.modelLoadError !== null) return "default";
  const provider = catalog.providers.find(
    (candidate) => candidate.id === providerId,
  );
  const model = [...catalog.models, ...catalog.selectedOnlyModels].find(
    (candidate) => candidate.model === modelId || candidate.id === modelId,
  );
  if (!provider?.capabilities.supportsServiceTier || model === undefined)
    return "default";
  const tiers = (provider.serviceTiers ?? []).filter(
    (tier) =>
      model.supportedServiceTiers === undefined ||
      model.supportedServiceTiers.some((supported) => supported.id === tier.id),
  );
  const preferred = override ?? "default";
  return tiers.some((tier) => tier.id === preferred) ? preferred : "default";
}
