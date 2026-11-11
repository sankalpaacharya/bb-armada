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
      [
        "## Instructions from the user",
        "",
        "> Act as a senior engineer.",
        ">",
        "> Ask first.",
        "",
      ].join("\n"),
    );
    expect(instructionsOf(written)).toBe(
      "Act as a senior engineer.\n\nAsk first.",
    );
  });

  it("appends the section after what the captain wrote", () => {
    const written = withInstructions(
      "# Captain\n- Small PRs.\n\n\n",
      "Be brief.",
    );
    expect(written).toBe(
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
      [
        "# Captain",
        "",
        "## Preferences",
        "- Small PRs.",
        "",
        "## Authority",
        "- Never deploy on Fridays.",
        "",
      ].join("\n"),
    );
    expect(withInstructions("", "")).toBe("");
    expect(withInstructions("# Captain\n", "")).toBe("# Captain\n");
  });

  it("keeps a heading the user typed inside the section", () => {
    const written = withInstructions(
      captainMd,
      "## Not a section\nStill mine.",
    );
    expect(instructionsOf(written)).toBe("## Not a section\nStill mine.");
    expect(withInstructions(written, "")).not.toContain("Still mine.");
    expect(withInstructions(written, "")).toContain("## Authority");
  });

  it("reads lines a person wrote unquoted, and none from a file without the section", () => {
    expect(
      instructionsOf(
        "## Instructions from the user\nPlain line.\n### Detail\nMore.\n# Next\nx",
      ),
    ).toBe("Plain line.\n### Detail\nMore.");
    expect(instructionsOf("# Captain\n- Small PRs.\n")).toBe("");
  });
});
