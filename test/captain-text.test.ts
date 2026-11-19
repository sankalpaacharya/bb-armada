import { describe, expect, it } from "vitest";

import {
  adoptedInput,
  captainInput,
  instructionsChangedInput,
} from "../lib/captain-text";

describe("captain text", () => {
  it("invokes the armada skill as a mention, names the thread the captain, and points it at its own home folder", () => {
    const [part] = captainInput("My App", "video-editing");
    expect(part.text.startsWith("/armada ")).toBe(true);
    expect(part.text).toContain('the captain for the bb project "My App"');
    expect(part.text).toContain("~/.bb/captains/video-editing/");
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

  it("tells the captain to spawn on the default tier and use Fast only on an explicit request", () => {
    const [part] = captainInput("My App", "video-editing");
    expect(part.text).toContain("use the default service tier");
    expect(part.text).toContain(
      "use Fast only when the user explicitly asks for it",
    );
    expect(part.text).not.toMatch(/prefer Fast/i);
  });

  it("tells an adopted thread, through the armada skill, which home is now its own", () => {
    const [part] = adoptedInput("forms-2");
    expect(part.text.startsWith("/armada ")).toBe(true);
    expect(part.text).toContain("~/.bb/captains/forms-2/");
    expect(part.mentions).toHaveLength(1);
  });

  it("points the captain at the user's instructions only when there are some, and to re-read them when they change", () => {
    expect(captainInput("My App", "my-app")[0].text).not.toContain(
      "Instructions from the user",
    );
    const [instructed] = captainInput("My App", "my-app", {
      hasInstructions: true,
    });
    expect(instructed.text).toContain(
      'captain.md under "## Instructions from the user"',
    );
    expect(instructionsChangedInput()[0].text).toMatch(/Re-read captain\.md/);
  });
});
