import { expect, it } from "vitest";
import { adoptedInput, captainInput } from "../lib/captain-text";

it("starts both captain prompts in poteto-mode and preserves the Armada mention", () => {
  for (const [{ text, mentions }] of [
    captainInput("project", "home"),
    adoptedInput("home"),
  ]) {
    expect(text.split("\n")[0]).toBe("/pstack:poteto-mode");
    expect(mentions).toHaveLength(1);
    const [{ start, end, resource }] = mentions;
    expect(resource.name).toBe("armada");
    expect(text.slice(start, end)).toBe("/armada");
  }
});
