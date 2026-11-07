import type { ColorId } from "./colors";
import type { LogoId } from "./logos";

export type CaptainRecord = {
  threadId: string;
  logo: LogoId;
  color: ColorId;
  createdAt: string;
};

export type CaptainRegistry = {
  version: 1;
  captains: Record<string, CaptainRecord>;
};

export const REGISTRY_KEY = "captains";
export const REGISTRY_CHANNEL = "captains";

export const EMPTY_REGISTRY: CaptainRegistry = { version: 1, captains: {} };
