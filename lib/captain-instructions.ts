/** The user's standing instructions for a captain, kept in its `captain.md`. */
export const INSTRUCTIONS_HEADING = "## Instructions from the user";
export const INSTRUCTIONS_MAX = 2000;

const HEADING_LINE = /^## Instructions from the user[ \t]*$/;
/** A section ends at the next heading of its level or above. */
const SECTION_END = /^#{1,2}(?:\s|$)/;

/** Where the section's lines start and end, or null when there is none. */
function sectionOf(
  lines: readonly string[],
): [start: number, end: number] | null {
  const start = lines.findIndex((line) => HEADING_LINE.test(line));
  if (start === -1) return null;
  const next = lines.findIndex(
    (line, index) => index > start && SECTION_END.test(line),
  );
  return [start, next === -1 ? lines.length : next];
}

/**
 * The instructions in a `captain.md`, or "" when it has none. Each line is
 * stored quoted, so a line of the user's own cannot end the section.
 */
export function instructionsOf(captainMd: string): string {
  const lines = captainMd.split("\n");
  const section = sectionOf(lines);
  if (section === null) return "";
  return lines
    .slice(section[0] + 1, section[1])
    .map((line) => line.replace(/^> ?/, ""))
    .join("\n")
    .trim();
}

/**
 * `captain.md` with its instructions section replaced by `instructions`, or
 * removed when they are blank. Every other line stays as it was.
 */
export function withInstructions(
  captainMd: string,
  instructions: string,
): string {
  const text = instructions.trim();
  const block =
    text === ""
      ? []
      : [
          INSTRUCTIONS_HEADING,
          "",
          ...text
            .split(/\r?\n/)
            .map((line) => (line === "" ? ">" : `> ${line}`)),
        ];
  const lines = captainMd === "" ? [] : captainMd.split("\n");
  const section = sectionOf(lines);
  const before = section === null ? lines : lines.slice(0, section[0]);
  const after = section === null ? [] : lines.slice(section[1]);
  const trimEnd = (part: string[]) => {
    const kept = [...part];
    while (kept.length > 0 && kept[kept.length - 1].trim() === "") kept.pop();
    return kept;
  };
  const parts = [trimEnd(before), block, trimEnd(after)].filter(
    (part) => part.length > 0,
  );
  return parts.length === 0
    ? ""
    : `${parts.map((part) => part.join("\n")).join("\n\n")}\n`;
}
