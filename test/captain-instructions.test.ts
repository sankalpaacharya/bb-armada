import { describe, expect, it } from "vitest";

import { instructionsOf, withInstructions } from "../lib/captain-instructions";

const captainMd = [
  "# Captain",
  "",
  "## Preferences",
  "- Small PRs.",
  "",
  "## Instructions from the user",
  "",
  "> Be brief.",
  "",
  "## Authority",
  "- Never deploy on Fridays.",
  "",
].join("\n");

describe("captain instructions in captain.md", () => {
  it("adds the section to a missing file, one quoted line each", () => {
    const written = withInstructions(
      "",
      "Act as a senior engineer.\n\nAsk first.",
    );
    expect(written).toBe(
      "## Instructions from the user\n\n> Act as a senior engineer.\n>\n> Ask first.\n",
    );
    expect(instructionsOf(written)).toBe(
      "Act as a senior engineer.\n\nAsk first.",
    );
  });

  it("appends the section after what the captain wrote", () => {
    expect(withInstructions("# Captain\n- Small PRs.\n\n\n", "Be brief.")).toBe(
      "# Captain\n- Small PRs.\n\n## Instructions from the user\n\n> Be brief.\n",
    );
  });

  it("replaces only the section, keeping every other line", () => {
    const written = withInstructions(captainMd, "Ship daily.");
    expect(written).toBe(captainMd.replace("> Be brief.", "> Ship daily."));
    expect(instructionsOf(written)).toBe("Ship daily.");
  });

  it("removes the section on blank instructions and keeps the rest", () => {
    expect(withInstructions(captainMd, "  \n ")).toBe(
      captainMd.replace("## Instructions from the user\n\n> Be brief.\n\n", ""),
    );
  });
});
