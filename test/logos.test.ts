import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { COLORS } from "../lib/colors";
import { LOGOS } from "../lib/logos";

const root = join(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  bb: { branding: { icon: string; experimental_icons: Record<string, string> } };
};
const declared = manifest.bb.branding.experimental_icons;

describe("captain logos", () => {
  it("offers exactly the icons the manifest declares", () => {
    expect([...LOGOS].sort()).toEqual(Object.keys(declared).sort());
  });

  it("ships a file for every declared icon", () => {
    for (const [name, path] of Object.entries(declared)) {
      expect(existsSync(join(root, path)), `${name} -> ${path}`).toBe(true);
    }
  });

  it("uses a shipped file as the plugin icon", () => {
    expect(existsSync(join(root, manifest.bb.branding.icon))).toBe(true);
  });

  it("lists each logo once", () => {
    expect(new Set(LOGOS).size).toBe(LOGOS.length);
  });
});

describe("captain colours", () => {
  it("gives every colour a unique id and class", () => {
    expect(new Set(COLORS.map((color) => color.id)).size).toBe(COLORS.length);
    expect(new Set(COLORS.map((color) => color.className)).size).toBe(COLORS.length);
  });
});
