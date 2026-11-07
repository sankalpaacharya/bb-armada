export const LOGOS = [
  "compass",
  "rocket",
  "flag",
  "crown",
  "trophy",
  "diamond",
  "fire",
  "idea",
  "map",
  "mountain",
  "airplane",
  "train",
  "tent",
  "sun",
  "plant",
  "heart",
  "briefcase",
  "chart-line",
  "coins",
  "gamepad",
  "music",
  "paint",
  "camera",
  "book",
] as const;

export type LogoId = (typeof LOGOS)[number];

export const DEFAULT_LOGO: LogoId = "compass";

export const logoIcon = (logo: LogoId) => `armada/${logo}`;
