import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const REQUIRED_SKILL_FILES = [
  "SKILL.md",
  "references/afk.md",
  "references/captain-calls.md",
  "references/crew-captain.md",
  "references/crew-questions.md",
  "references/diagnostic-reasoning.md",
  "references/outbox.md",
  "references/ownership.md",
] as const;

export async function assertArmadaSkillAssets(
  root = new URL("../skills/armada/", import.meta.url),
): Promise<void> {
  for (const name of REQUIRED_SKILL_FILES) {
    const file = new URL(name, root);
    const content = await readFile(file, "utf8").catch(() => null);
    if (content !== null && content.trim() !== "") continue;
    throw new Error(
      `Armada skill asset missing, empty, or unreadable: ${fileURLToPath(file)}. Reinstall Armada from a complete package or restore its skills/ directory and rebuild.`,
    );
  }
}
