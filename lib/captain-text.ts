import { homeFolder } from "./captain-home";
import { INSTRUCTIONS_HEADING } from "./captain-instructions";

/** A captain is named by its project; the Captains section says what it is. */
export function captainTitle(projectName: string): string {
  return projectName;
}

const SKILL = "armada";
const TRIGGER = `/${SKILL}`;

/** A message that invokes the armada skill the way bb's composer does. */
function skillInput(text: string) {
  return [
    {
      type: "text" as const,
      text: `${TRIGGER} ${text}`,
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

/**
 * A new captain's first message: the armada skill, invoked the way bb's
 * composer does it, followed by what the captain should do first. When the
 * user gave instructions, they are already in `captain.md`, so the message
 * points at them instead of repeating them.
 */
export function captainInput(
  projectName: string,
  home: string,
  { hasInstructions = false }: { hasInstructions?: boolean } = {},
) {
  return skillInput(
    [
      `You are the captain for the bb project "${projectName}".`,
      `Keep your memory in ${homeFolder(home)}/, a folder of your own that no other captain uses.`,
      "If that folder has no backlog.md yet, set it up from the repo's README, AGENTS.md or CLAUDE.md, and its recent commits.",
      ...(hasInstructions
        ? [
            `The user's instructions for you are in captain.md under "${INSTRUCTIONS_HEADING}"; keep that section as it is and follow it, starting with your hello.`,
          ]
        : []),
      "Then say hello in three lines: what you think the project is, and that the user can tell you what to work on.",
    ].join(" "),
  );
}

/** Tells a thread the user just made a captain where its own memory lives. */
export function adoptedInput(home: string) {
  return skillInput(
    [
      `You are now a captain, and your memory folder is ${homeFolder(home)}/, a folder of your own that no other captain uses.`,
      "Set it up there now, starting with backlog.md, and keep all your memory in it from now on.",
    ].join(" "),
  );
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
