import { describe, expect, it, vi } from "vitest";

import { openPullRequest, type Open } from "../lib/open-pull-request";

const URL = "https://github.com/productstudioinc/cops/pull/1966";

describe("opening a pull request in the default browser", () => {
  it("hands the URL to the system opener as one argument", async () => {
    const open = vi.fn<Open>(async () => undefined);
    const dotted = "https://github.com/acme/my.app/pull/7";
    expect(await openPullRequest(URL, { platform: "darwin", open })).toBe(true);
    expect(await openPullRequest(dotted, { platform: "linux", open })).toBe(true);
    expect(open.mock.calls).toEqual([
      ["open", URL],
      ["xdg-open", dotted],
    ]);
  });

  it("opens nothing but a PR's page on GitHub", async () => {
    const open = vi.fn<Open>(async () => undefined);
    for (const url of [
      "https://example.com/pull/1",
      "https://github.com/acme/app/issues/7",
      "http://github.com/acme/app/pull/7",
      "https://github.com.evil.dev/acme/app/pull/7",
      `${URL}; rm -rf ~`,
      `${URL}\n`,
      `${URL} --args`,
      "file:///etc/passwd",
    ])
      expect(await openPullRequest(url, { platform: "darwin", open })).toBe(
        false,
      );
    expect(open).not.toHaveBeenCalled();
  });
});
