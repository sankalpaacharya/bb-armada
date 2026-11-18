import { describe, expect, it, vi } from "vitest";

import { openPullRequest, type Open } from "../lib/open-pull-request";

const URL = "https://github.com/productstudioinc/cops/pull/1966";

describe("opening a pull request in the default browser", () => {
  it("hands the URL to the system opener as one argument", async () => {
    const open = vi.fn<Open>(async () => undefined);
    expect(await openPullRequest(URL, { platform: "darwin", open })).toBe(true);
    expect(await openPullRequest(URL, { platform: "linux", open })).toBe(true);
    expect(open.mock.calls).toEqual([
      ["open", URL],
      ["xdg-open", URL],
    ]);
  });

  it("opens nothing but a PR's page on GitHub", async () => {
    const open = vi.fn<Open>(async () => undefined);
    for (const url of [
      "https://example.com/pull/1",
      `${URL} --args`,
      "file:///etc/passwd",
    ])
      expect(await openPullRequest(url, { platform: "darwin", open })).toBe(
        false,
      );
    expect(open).not.toHaveBeenCalled();
  });

  it("says it could not, for bb to open it, without an opener or when it fails", async () => {
    const open = vi.fn<Open>(async () => {
      throw new Error("open failed");
    });
    expect(await openPullRequest(URL, { platform: "win32", open })).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(await openPullRequest(URL, { platform: "darwin", open })).toBe(false);
  });
});
