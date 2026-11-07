import os from "node:os";
import path from "node:path";
import type { BbPluginApi } from "@get-bb/plugin-sdk";

import {
  homeFilePathSchema,
  homeFolder,
  supervisorIdOf,
  type CaptainHome,
  type HomeFile,
} from "./captain-home";
import { captainSlug } from "./captain-text";

type ReadFile = Awaited<ReturnType<BbPluginApi["sdk"]["files"]["read"]>>;

const HOMES_ROOT = path.join(os.homedir(), ".bb", "captains");
const MAX_CONTENT = 200_000;
const BACKLOG = /^[^/]+\/backlog\.md$/;

const textOf = (file: ReadFile): string =>
  file.contentEncoding === "base64"
    ? Buffer.from(file.content, "base64").toString("utf8")
    : file.content;

/**
 * Captain homes under `~/.bb/captains`, read through bb's host files so every
 * read stays inside its home. A missing folder lists as empty, not an error.
 */
export function createHomeReader(bb: BbPluginApi) {
  const rootOf = (project: string) =>
    path.join(HOMES_ROOT, captainSlug(project));
  const read = (root: string, relative: string) =>
    bb.sdk.files.read({ path: path.join(root, relative), rootPath: root });

  const home = async (project: string): Promise<CaptainHome> => {
    const root = rootOf(project);
    const folder = homeFolder(project);
    const { paths } = await bb.sdk.files.listPaths({
      path: root,
      includeFiles: true,
      includeDirectories: false,
      includeHidden: false,
    });
    if (paths.length === 0) return { status: "missing", folder };
    const listed = await Promise.all(
      paths
        .map((entry) => entry.path)
        .filter((relative) => homeFilePathSchema.safeParse(relative).success)
        .map(async (relative): Promise<HomeFile[]> => {
          try {
            const file = await read(root, relative);
            return [
              {
                path: relative,
                sizeBytes: file.sizeBytes,
                modifiedAt: file.modifiedAtMs ?? null,
              },
            ];
          } catch (cause) {
            bb.log.warn(
              `could not read ${folder}/${relative}: ${cause instanceof Error ? cause.message : String(cause)}`,
            );
            return [];
          }
        }),
    );
    return { status: "ready", folder, files: listed.flat() };
  };

  const file = async (project: string, relative: string) => {
    const text = textOf(await read(rootOf(project), relative));
    return {
      content: text.slice(0, MAX_CONTENT),
      truncated: text.length > MAX_CONTENT,
    };
  };

  /** Every home's supervisor, from the `Supervisor:` line of its backlog. */
  const supervisors = async (): Promise<string[]> => {
    const { paths } = await bb.sdk.files.listPaths({
      path: HOMES_ROOT,
      includeFiles: true,
      includeDirectories: false,
      includeHidden: false,
      excludeNames: ["tasks"],
    });
    const ids = await Promise.all(
      paths
        .filter((entry) => BACKLOG.test(entry.path))
        .map(async (entry) =>
          supervisorIdOf(textOf(await read(HOMES_ROOT, entry.path))),
        ),
    );
    return [...new Set(ids.filter((id) => id !== null))].sort();
  };

  return { home, file, supervisors };
}
