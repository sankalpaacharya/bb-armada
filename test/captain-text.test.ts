import { describe, expect, it } from "vitest";

import { captainPrompt, captainSlug, captainTitle } from "../lib/captain-text";

describe("captain text", () => {
  it("names the thread by its project alone", () => {
    expect(captainTitle("cops")).toBe("cops");
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

});
