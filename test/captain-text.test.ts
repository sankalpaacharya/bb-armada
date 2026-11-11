import { describe, expect, it } from "vitest";

import {
  captainInput,
  captainSlug,
  captainTitle,
  instructionsChangedInput,
} from "../lib/captain-text";

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

describe("a new captain's instructions", () => {
  it("points the captain at its instructions in captain.md only when the user gave some", () => {
    const [plain] = captainInput("My App");
    expect(plain.text).not.toContain("Instructions from the user");
    const [instructed] = captainInput("My App", { hasInstructions: true });
    expect(instructed.text).toContain(
      'captain.md under "## Instructions from the user"',
    );
    expect(instructed.text).toMatch(/follow it, starting with your hello/);
    expect(instructed.text.indexOf("Instructions from the user")).toBeLessThan(
      instructed.text.indexOf("say hello in three lines"),
    );
  });

  it("tells a running captain to re-read its changed instructions", () => {
    const [part] = instructionsChangedInput();
    expect(part.text).toContain("## Instructions from the user");
    expect(part.text).toMatch(/Re-read captain\.md/);
    expect(part.mentions).toEqual([]);
  });
});
