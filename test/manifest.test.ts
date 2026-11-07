import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const manifest = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
) as { bb: { branding: { icon: string; experimental_icons?: unknown } } };

describe("manifest", () => {
  it("ships the file it names as the plugin icon, and nothing else under branding", () => {
    expect(existsSync(join(root, manifest.bb.branding.icon))).toBe(true);
    expect(manifest.bb.branding.experimental_icons).toBeUndefined();
  });
});
