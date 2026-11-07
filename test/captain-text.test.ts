import { describe, expect, it } from "vitest";

import {
  captainPrompt,
  captainSlug,
  captainTitle,
  withoutLeadingEmoji,
} from "../lib/captain-text";

describe("captain text", () => {
  it("titles the thread after the project", () => {
    expect(captainTitle("Cops")).toBe("🧭 Captain · Cops");
  });

  it("makes a file-safe slug from the project name", () => {
    expect(captainSlug("My App (v2)")).toBe("my-app-v2");
    expect(captainSlug("  Ünïcode  ")).toBe("n-code");
    expect(captainSlug("!!!")).toBe("project");
  });

  it("points the captain at its own notes file and the captain skill", () => {
    const prompt = captainPrompt("My App");
    expect(prompt).toContain('captain for the bb project "My App"');
    expect(prompt).toContain("/captain");
    expect(prompt).toContain("~/.bb/captains/my-app.md");
  });

  it("drops the leading emoji the sidebar avatar already stands for", () => {
    expect(withoutLeadingEmoji(captainTitle("Cops"))).toBe("Captain · Cops");
    expect(withoutLeadingEmoji("👩🏽‍💻 Pairing")).toBe("Pairing");
    expect(withoutLeadingEmoji("Fix 🐛 in parser")).toBe("Fix 🐛 in parser");
    expect(withoutLeadingEmoji("🧭")).toBe("🧭");
  });
});
