import { describe, expect, it } from "vitest";

import {
  adoptedInput,
  captainInput,
  captainTitle,
  instructionsChangedInput,
} from "../lib/captain-text";

describe("captain text", () => {
  it("names the thread by its project alone", () => {
    expect(captainTitle("cops")).toBe("cops");
  });

  it("invokes the armada skill as a mention, names the thread the captain, and points it at its own home folder", () => {
    const [part] = captainInput("My App", "video-editing");
    expect(part.text.startsWith("/armada ")).toBe(true);
    expect(part.text).toContain('the captain for the bb project "My App"');
    expect(part.text).toContain("~/.bb/captains/video-editing/");
    expect(part.text).not.toContain("~/.bb/captains/my-app");
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

describe("a thread made a captain", () => {
  it("is told, through the armada skill, which home is now its own", () => {
    const [part] = adoptedInput("forms-2");
    expect(part.text.startsWith("/armada ")).toBe(true);
    expect(part.text).toContain("~/.bb/captains/forms-2/");
    expect(part.mentions).toHaveLength(1);
  });
});

describe("a new captain's instructions", () => {
  it("points the captain at its instructions in captain.md only when the user gave some", () => {
    const [plain] = captainInput("My App", "my-app");
    expect(plain.text).not.toContain("Instructions from the user");
    const [instructed] = captainInput("My App", "my-app", {
      hasInstructions: true,
    });
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
