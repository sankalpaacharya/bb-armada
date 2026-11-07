import { describe, expect, it } from "vitest";

import { captainInput, captainSlug, captainTitle } from "../lib/captain-text";

describe("captain text", () => {
  it("names the thread by its project alone", () => {
    expect(captainTitle("cops")).toBe("cops");
  });

  it("makes a file-safe slug from the project name", () => {
    expect(captainSlug("My App (v2)")).toBe("my-app-v2");
    expect(captainSlug("  Ünïcode  ")).toBe("n-code");
    expect(captainSlug("!!!")).toBe("project");
  });

  it("invokes the armada skill as a mention, names the thread the captain, and points it at its home folder", () => {
    const [part] = captainInput("My App");
    expect(part.text.startsWith("/armada ")).toBe(true);
    expect(part.text).toContain('the captain for the bb project "My App"');
    expect(part.text).toContain("~/.bb/captains/my-app/");
    expect(part.text).not.toMatch(/first mate/i);
    expect(part.mentions).toEqual([
      {
        start: 0,
        end: 7,
        resource: expect.objectContaining({
          kind: "command",
          name: "armada",
          source: "skill",
          trigger: "/",
        }),
      },
    ]);
  });
});
