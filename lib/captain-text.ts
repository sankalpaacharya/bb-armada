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

const SKILL = "armada";
const TRIGGER = `/${SKILL}`;

/**
 * A new captain's first message: the armada skill, invoked the way bb's
 * composer does it, followed by what the captain should do first.
 */
export function captainInput(projectName: string) {
  const text = [
    TRIGGER,
    `You are the captain for the bb project "${projectName}".`,
    `Keep your memory in ~/.bb/captains/${captainSlug(projectName)}/.`,
    "If that folder does not exist yet, set it up from the repo's README, AGENTS.md or CLAUDE.md, and its recent commits.",
    "Then say hello in three lines: what you think the project is, and that the user can tell you what to work on.",
  ].join(" ");
  return [
    {
      type: "text" as const,
      text,
      mentions: [
        {
          start: 0,
          end: TRIGGER.length,
          resource: {
            kind: "command" as const,
            trigger: "/" as const,
            name: SKILL,
            label: SKILL,
            source: "skill" as const,
            origin: "user" as const,
            argumentHint: null,
          },
        },
      ],
    },
  ];
}
