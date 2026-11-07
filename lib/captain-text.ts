/** A captain is named by its project; the Captains section says what it is. */
export function captainTitle(projectName: string): string {
  return projectName;
}

export function captainSlug(projectName: string): string {
  const slug = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "project" : slug;
}

export function captainPrompt(projectName: string): string {
  return [
    `You are the first mate for the bb project "${projectName}".`,
    "Use the armada skill (/armada) and follow it for this whole thread.",
    `Your home is ~/.bb/captains/${captainSlug(projectName)}/.`,
    "If it does not exist, create it as the skill describes, using what you can learn quickly from the repo's README, CLAUDE.md/AGENTS.md and recent commits.",
    "Then reply with a 3-line hello: what you understood the project to be, and that the user can now tell you what they need.",
  ].join(" ");
}
