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
                {
                  id: "codex",
                  displayName: "Codex",
                  logoUrl: "/native/codex.svg",
                },
                {
                  id: "claude-code",
                  displayName: "Claude Code",
                  logoUrl: "/native/claude.svg",
                  strings: { iconTint: { light: "#D97757", dark: "#D97757" } },
                },
                {
                  id: "other-provider",
                  displayName: "Other provider",
                  logoUrl: "/native/other.svg",
                },
              ] as never),
      },
    },
  );
}

describe("captain provider badges", () => {
  it("replaces faces with initials and keeps the provider badge", () => {
    const view = renderTile({ style: "micah", seed: "kept" }, "codex", "ready", "initials");
    expect(view.getByText("P")).not.toBeNull();
    expect(view.container.querySelector("img")).toBeNull();
    expect(view.container.querySelector('[data-provider-id="codex"]')).not.toBeNull();
  });

  it("keeps a custom logo when initials are selected", async () => {
    const view = renderTile({ style: "logo", seed: "kept", image: customLogo }, "codex", "ready", "initials");
    await waitFor(() => expect(view.container.querySelector("img")?.getAttribute("src")).toBe(customLogo));
    expect(view.queryByText("P")).toBeNull();
  });

  it.each(["codex", "claude-code", "other-provider"])(
    "uses the native %s metadata without changing the primary custom logo",
    async (providerId) => {
      const view = renderTile(
        { style: "logo", seed: "kept", image: customLogo },
        providerId,
      );
      await waitFor(() =>
        expect(view.container.querySelector("img")?.getAttribute("src")).toBe(
          customLogo,
        ),
      );
      const mark = view.container.querySelector(
        `[data-provider-id="${providerId}"]`,
      );
      expect(mark?.getAttribute("data-provider-kind")).toBe("agent");
      expect(mark?.getAttribute("data-provider-logo")).toContain("/native/");
      expect(mark?.getAttribute("aria-label")).toMatch(/^Provider: /);
      expect(mark?.parentElement?.getAttribute("title")).toBe(
        mark?.getAttribute("aria-label"),
      );
      expect(mark?.parentElement?.className).toContain("[color-scheme:light]");
    },
  );

  it("badges seeded faces as well as shared project logos", async () => {
    const face = renderTile({ style: "micah", seed: "kept" }, "codex");
    expect(
      face.container.querySelector('[data-provider-id="codex"]'),
    ).not.toBeNull();
    const logo = renderTile({ style: "logo", seed: "kept" }, "claude-code");
    await waitFor(() =>
      expect(logo.container.querySelector("img")?.getAttribute("src")).toBe(
        projectLogo,
      ),
    );
    expect(
      logo.container.querySelector('[data-provider-id="claude-code"]'),
    ).not.toBeNull();
  });

  it.each(["loading", "ready"] as const)(
    "keeps an unknown provider accessible while the catalog is %s",
    (status) => {
      const view = renderTile(
        { style: "micah", seed: "kept" },
        "unknown-provider",
        status,
      );
      const mark = view.container.querySelector(
        '[data-provider-id="unknown-provider"]',
      );
      expect(mark?.getAttribute("aria-label")).toBe(
        "Provider: unknown-provider",
      );
      expect(mark?.parentElement?.getAttribute("title")).toBe(
        "Provider: unknown-provider",
      );
    },
  );

  it("leaves primary-only previews unbadged", async () => {
    const view = renderTile({ style: "logo", seed: "kept" });
    await waitFor(() =>
      expect(view.container.querySelector("img")?.getAttribute("src")).toBe(
        projectLogo,
      ),
    );
    expect(view.container.querySelector("[data-provider-id]")).toBeNull();
  });
});
