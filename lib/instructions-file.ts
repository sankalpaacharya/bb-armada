import path from "node:path";
import type { BbPluginApi } from "@get-bb/plugin-sdk";

import { instructionsOf, withInstructions } from "./captain-instructions";
import { HOMES_ROOT, textOf } from "./home-reader";

const CAPTAIN_MD = "captain.md";

/**
 * A captain's standing instructions in its home's `captain.md`, read and
 * written through bb's host files inside that home. A write keeps the rest of
 * the file and refuses to land over a version the captain wrote meanwhile.
 */
export function createInstructionsFile(bb: BbPluginApi) {
  const locate = async (home: string) => {
    const root = path.join(HOMES_ROOT, home);
    const file = path.join(root, CAPTAIN_MD);
    const { paths } = await bb.sdk.files.listPaths({
      path: root,
      includeFiles: true,
      includeDirectories: false,
      includeHidden: false,
      excludeNames: ["tasks"],
    });
    const current = paths.some((entry) => entry.path === CAPTAIN_MD)
      ? await bb.sdk.files.read({ path: file, rootPath: root })
      : null;
    return { root, file, current };
  };

  const read = async (home: string): Promise<string> => {
    const { current } = await locate(home);
    return current === null ? "" : instructionsOf(textOf(current));
  };

  /** Writes the instructions, creating the home if needed; blank removes them. */
  const write = async (home: string, instructions: string): Promise<void> => {
    const { root, file, current } = await locate(home);
    const before = current === null ? "" : textOf(current);
    const after = withInstructions(before, instructions);
    if (after === before) return;
    if (current === null)
      await bb.sdk.files.mkdir({ path: root, recursive: true });
    await bb.sdk.files.write({
      path: file,
      rootPath: root,
      content: after,
      createParents: true,
      expectedSha256: current?.sha256 ?? null,
    });
  };

  return { read, write };
}
