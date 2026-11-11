import { INSTRUCTIONS_HEADING } from "./captain-instructions";

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
 * composer does it, followed by what the captain should do first. When the
 * user gave instructions, they are already in `captain.md`, so the message
 * points at them instead of repeating them.
 */
export function captainInput(
  projectName: string,
  { hasInstructions = false }: { hasInstructions?: boolean } = {},
) {
  const text = [
    TRIGGER,
    `You are the captain for the bb project "${projectName}".`,
    `Keep your memory in ~/.bb/captains/${captainSlug(projectName)}/.`,
    "If that folder has no backlog.md yet, set it up from the repo's README, AGENTS.md or CLAUDE.md, and its recent commits.",
    ...(hasInstructions
      ? [
          `The user's instructions for you are in captain.md under "${INSTRUCTIONS_HEADING}"; keep that section as it is and follow it, starting with your hello.`,
        ]
      : []),
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

/** Tells a running captain that the user changed its instructions. */
export function instructionsChangedInput() {
  return [
    {
      type: "text" as const,
      text: `The user changed your instructions in captain.md under "${INSTRUCTIONS_HEADING}". Re-read captain.md now and follow them from this turn on.`,
      mentions: [],
    },
  ];
}
