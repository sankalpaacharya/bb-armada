import { describe, expect, it } from "vitest";

import { preferredServiceTier } from "../lib/service-tier";

const catalog = {
  modelLoadError: null,
  providers: [
    {
      id: "codex",
      capabilities: { supportsServiceTier: true },
      serviceTiers: [{ id: "fast" }],
    },
  ],
  models: [
    {
      id: "gpt-5.5",
      model: "gpt-5.5",
      supportedServiceTiers: [{ id: "fast" }],
    },
  ],
  selectedOnlyModels: [],
} as unknown as Parameters<typeof preferredServiceTier>[0];

describe("preferred service tier", () => {
  it("is the default tier with no choice, even when the provider and model support Fast", () => {
    expect(preferredServiceTier(catalog, "codex", "gpt-5.5", null)).toBe(
      "default",
    );
  });

  it("honours an explicit Fast choice when it is supported", () => {
    expect(preferredServiceTier(catalog, "codex", "gpt-5.5", "fast")).toBe(
      "fast",
    );
  });

  it("falls back to the default tier when the chosen tier is not supported", () => {
    expect(
      preferredServiceTier(catalog, "claude-code", "gpt-5.5", "fast"),
    ).toBe("default");
  });
});
