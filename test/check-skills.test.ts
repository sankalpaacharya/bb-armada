import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = join(__dirname, "..", "scripts", "check-skills.mjs");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true });
});

function skills(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "skills-"));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

function check(root: string): { ok: boolean; output: string } {
  try {
    const output = execFileSync("node", [SCRIPT, root], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, output };
  } catch (error) {
    const failed = error as { stdout: string; stderr: string };
    return { ok: false, output: failed.stdout + failed.stderr };
  }
}

const skill = (front: string, body = "Do the thing.\n") =>
  `---\n${front}\n---\n${body}`;

describe("the skill checker", () => {
  it("passes the skills this repo ships", () => {
    expect(check(join(__dirname, "..", "skills")).ok).toBe(true);
  });

  it.each([
    [
      "a missing frontmatter block",
      "x/SKILL.md",
      "# no frontmatter\n",
      "must start with YAML frontmatter",
    ],
    [
      "a name that differs from its folder",
      "folder/SKILL.md",
      skill("name: other\ndescription: Does x."),
      'must match its folder "folder"',
    ],
    [
      "a link to a missing file",
      "x/SKILL.md",
      skill("name: x\ndescription: Does x.", "Read `references/missing.md`.\n"),
      '"references/missing.md" does not exist',
    ],
  ])("fails %s", (_case, path, text, message) => {
    const result = check(skills({ [path]: text }));
    expect(result.ok).toBe(false);
    expect(result.output).toContain(message);
  });
});
