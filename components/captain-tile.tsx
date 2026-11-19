import {
  experimental_ProviderIcon as ProviderIcon,
  experimental_useProviders,
  useSettings,
} from "@get-bb/plugin-sdk/app";

import { useProjectLogos } from "@/hooks/use-project-logos";
import { avatarDataUri } from "@/lib/avatar";
import type { Avatar } from "@/lib/captains";
import { TILE } from "@/lib/styles";
import { cn } from "@/lib/utils";

function ProviderBadge({ providerId }: { providerId: string }) {
  const { providers } = experimental_useProviders();
  const provider = providers.find((candidate) => candidate.id === providerId);
  return (
    <span
      title={`Provider: ${provider?.displayName ?? providerId}`}
      className="absolute right-px bottom-px grid size-3.5 place-items-center rounded-[5px] border border-black/10 bg-white text-black [color-scheme:light]"
    >
      <ProviderIcon
        providerKind="agent"
        provider={provider ?? { id: providerId }}
        aria-label={`Provider: ${provider?.displayName ?? providerId}`}
        className="size-[11px]"
      />
    </span>
  );
}

/**
 * The one owner of avatar rendering: a decorative image in a rounded-square
 * tile. A logo avatar shows its custom image or project logo, whole and inset on white so a
 * dark or wide logo still reads; until the logo loads, or when the project
 * has none, it shows its face.
 */
export function CaptainTile({
  avatar,
  name,
  projectId,
  providerId,
  size = "row",
  className,
}: {
  avatar: Avatar;
  name: string;
  projectId: string;
  providerId?: string;
  size?: keyof typeof TILE;
  className?: string;
}) {
  const { values } = useSettings();
  const projectLogo = useProjectLogos()[projectId];
  const logo =
    avatar.style === "logo" ? (avatar.image ?? projectLogo) : undefined;
  const showsLogo = avatar.style === "logo" && logo !== undefined;
  const showInitials = !showsLogo && values?.avatarStyle === "initials";
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word.slice(0, 1))
      .join("")
      .toLocaleUpperCase() || "?";
  return (
    <span
      className={cn(
        "relative block shrink-0 overflow-hidden",
        TILE[size],
        showsLogo && "bg-white ring-1 ring-black/10 ring-inset",
        className,
      )}
    >
      {showInitials ? (
        <span
          aria-hidden="true"
          className={cn(
            "grid size-full place-items-center bg-muted font-medium text-foreground/80",
            size === "preview" ? "text-sm" : "text-2xs",
            providerId !== undefined && "pb-1 pr-1",
          )}
        >
          {initials}
        </span>
      ) : (
        <img
          alt=""
          src={showsLogo ? logo : avatarDataUri(avatar)}
          className={cn("size-full", showsLogo && "object-contain p-[14%]")}
        />
      )}
      {providerId === undefined ? null : (
        <ProviderBadge providerId={providerId} />
      )}
    </span>
  );
}
