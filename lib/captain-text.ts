export function captainTitle(projectName: string): string {
  return `🧭 Captain · ${projectName}`;
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
    `You are the captain for the bb project "${projectName}".`,
    "Use the captain skill (/captain) and follow it for this whole thread.",
    `Your notes file is ~/.bb/captains/${captainSlug(projectName)}.md.`,
    "If it does not exist, create it from the skill's template using what you can learn quickly from the repo's README, CLAUDE.md/AGENTS.md and recent commits.",
    'Then reply with a 3-line hello: what you understood the project to be, and that the user can now say "hey captain, ..." to give you work.',
  ].join(" ");
}
