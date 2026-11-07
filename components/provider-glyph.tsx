import {
  experimental_ProviderIcon as ProviderIcon,
  experimental_useProviders,
} from "@get-bb/plugin-sdk/app";

export function ProviderGlyph({ providerId }: { providerId: string }) {
  const { providers } = experimental_useProviders();
  const provider = providers.find((candidate) => candidate.id === providerId);
  return (
    <span className="flex size-4 shrink-0 items-center justify-center opacity-60 grayscale">
      <ProviderIcon
        providerKind="agent"
        provider={provider ?? { id: providerId }}
        aria-label={provider?.displayName ?? providerId}
        className="size-3 text-muted-foreground/70"
      />
    </span>
  );
}
