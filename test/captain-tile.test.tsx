// @vitest-environment jsdom
import { cleanup, waitFor } from "@testing-library/react";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { afterEach, describe, expect, it } from "vitest";

import { CaptainTile } from "../components/captain-tile";
import type { Avatar } from "../lib/captains";

const projectLogo =
  "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>";
const customLogo =
  "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'><path d='M0 0h4v4'/></svg>";
afterEach(cleanup);

function renderTile(
  avatar: Avatar,
  providerId?: string,
  status: "loading" | "ready" = "ready",
  appearance: "faces" | "initials" = "faces",
) {
  return renderSlot(
    {
      component: () => (
        <CaptainTile
          avatar={avatar}
          name="Personal"
          projectId="proj_a"
          providerId={providerId}
        />
      ),
    },
    { threadId: null, environment: null, params: null },
    {
      settings: { avatarStyle: appearance },
      rpc: { project_logos: () => ({ proj_a: projectLogo }) } as never,
      providers: {
        status,
        providers:
          status === "loading"
            ? []
            : ([
                { id: "codex", displayName: "Codex", logoUrl: "/native/codex.svg" },
                { id: "claude-code", displayName: "Claude Code", logoUrl: "/native/claude.svg" },
              ] as never),
      },
    },
  );
}

const imageOf = (view: ReturnType<typeof renderTile>) =>
  view.container.querySelector("img")?.getAttribute("src");

describe("captain provider badges", () => {
  it.each([
    ["a custom logo", { style: "logo", seed: "kept", image: customLogo }, customLogo],
    ["the project's logo", { style: "logo", seed: "kept" }, projectLogo],
  ] as const)("badges %s with its provider, keeping the logo", async (_case, avatar, src) => {
    const view = renderTile(avatar, "claude-code");
    await waitFor(() => expect(imageOf(view)).toBe(src));
    expect(view.getByLabelText("Provider: Claude Code")).toBeTruthy();
  });

  it("swaps a face for initials and keeps the badge", () => {
    const view = renderTile({ style: "micah", seed: "kept" }, "codex", "ready", "initials");
    expect(view.getByText("P")).toBeTruthy();
    expect(imageOf(view)).toBeUndefined();
    expect(view.getByLabelText("Provider: Codex")).toBeTruthy();
  });

  it.each(["loading", "ready"] as const)(
    "names an unknown provider by its id while the catalog is %s",
    (status) => {
      const view = renderTile({ style: "micah", seed: "kept" }, "unknown-provider", status);
      expect(view.getByLabelText("Provider: unknown-provider")).toBeTruthy();
    },
  );

  it("leaves a tile without a provider unbadged", async () => {
    const view = renderTile({ style: "logo", seed: "kept" });
    await waitFor(() => expect(imageOf(view)).toBe(projectLogo));
    expect(view.queryByLabelText(/^Provider:/)).toBeNull();
  });
});
