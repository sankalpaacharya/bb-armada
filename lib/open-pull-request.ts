import { experimental_execHostFile } from "@get-bb/plugin-sdk/process";

import { PULL_REQUEST_URL } from "./crew-pull-requests";

/** The system's own opener, which hands a URL to the default browser. */
const OPENER: Partial<Record<NodeJS.Platform, string>> = {
  darwin: "open",
  linux: "xdg-open",
};

export type Open = (opener: string, url: string) => Promise<void>;

const openWith: Open = async (opener, url) => {
  await experimental_execHostFile(opener, [url], { timeout: 10_000 });
};

/**
 * Opens a GitHub pull request in the user's default browser rather than bb's.
 * False when the URL is not a PR's page, the platform has no opener, or it
 * failed, so the app can fall back to bb's own.
 */
export async function openPullRequest(
  url: string,
  options: { platform?: NodeJS.Platform; open?: Open } = {},
): Promise<boolean> {
  const opener = OPENER[options.platform ?? process.platform];
  if (opener === undefined || !PULL_REQUEST_URL.test(url)) return false;
  try {
    await (options.open ?? openWith)(opener, url);
    return true;
  } catch {
    return false;
  }
}
