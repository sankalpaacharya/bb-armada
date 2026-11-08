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

  it("passes a minimal valid skill with optional fields", () => {
    const root = skills({
      "pdf-tools/SKILL.md": skill(
        'name: pdf-tools\ndescription: Fill PDF forms. Use when the user has a PDF.\nlicense: MIT\ncompatibility: Needs python3\nmetadata:\n  version: "1.0"\nallowed-tools: Read Bash(jq:*)',
        "See [the guide](references/guide.md) and `scripts/run.py`.\n",
      ),
      "pdf-tools/references/guide.md": "# Guide\n",
      "pdf-tools/scripts/run.py": "print(1)\n",
    });
    const result = check(root);
    expect(result.output).toContain("1 skill(s) follow");
    expect(result.ok).toBe(true);
  });

  it.each([
    ["a missing frontmatter block", "x/SKILL.md", "# no frontmatter\n", "must start with YAML frontmatter"],
    ["unparseable YAML", "x/SKILL.md", skill("name: x\ndescription: Use when: the user asks"), "not valid YAML"],
    ["a missing name", "x/SKILL.md", skill("description: Does x."), "name is required"],
    ["uppercase in the name", "Bad/SKILL.md", skill("name: Bad\ndescription: Does x."), "may only use a-z"],
    ["a leading hyphen", "-x/SKILL.md", skill("name: -x\ndescription: Does x."), "may only use a-z"],
    ["consecutive hyphens", "a--b/SKILL.md", skill("name: a--b\ndescription: Does x."), "may only use a-z"],
    ["a name over 64 characters", `${"a".repeat(65)}/SKILL.md`, skill(`name: ${"a".repeat(65)}\ndescription: Does x.`), "at most 64"],
    ["a name that differs from its folder", "folder/SKILL.md", skill("name: other\ndescription: Does x."), 'must match its folder "folder"'],
    ["a missing description", "x/SKILL.md", skill("name: x"), "description is required"],
    ["a description over 1024 characters", "x/SKILL.md", skill(`name: x\ndescription: ${"d".repeat(1025)}`), "at most 1024"],
    ["a compatibility over 500 characters", "x/SKILL.md", skill(`name: x\ndescription: Does x.\ncompatibility: ${"c".repeat(501)}`), "at most 500"],
    ["a non-string metadata value", "x/SKILL.md", skill("name: x\ndescription: Does x.\nmetadata:\n  version: 1"), "metadata.version must be a string"],
    ["an unknown field", "x/SKILL.md", skill("name: x\ndescription: Does x.\nauthor: me"), 'unknown frontmatter field "author"'],
    ["a body over 500 lines", "x/SKILL.md", skill("name: x\ndescription: Does x.", "line\n".repeat(501)), "keep it under 500"],
    ["a link to a missing file", "x/SKILL.md", skill("name: x\ndescription: Does x.", "Read `references/missing.md`.\n"), '"references/missing.md" does not exist'],
    ["a reference nested two folders deep", "x/SKILL.md", skill("name: x\ndescription: Does x.", "Read [it](references/deep/a.md).\n"), "nested deeper than one folder"],
  ])("fails %s", (_case, path, text, message) => {
    const result = check(skills({ [path]: text }));
    expect(result.ok).toBe(false);
    expect(result.output).toContain(message);
  });

  it("fails a skill folder without a SKILL.md", () => {
    const result = check(skills({ "x/README.md": "# x\n" }));
    expect(result.ok).toBe(false);
    expect(result.output).toContain("has no SKILL.md");
  });
});
