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
const BACKLOG = /^[^/]+\/backlog\.md$/;

/** What one home's backlog tells the sidebar. */
export type Backlog = {
  home: string;
  supervisorId: string | null;
};

export const supervisorIdsOf = (backlogs: readonly Backlog[]): string[] =>
  [
    ...new Set(
      backlogs.flatMap(({ supervisorId }) =>
        supervisorId === null ? [] : [supervisorId],
      ),
    ),
  ].sort();

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
    const reads = await Promise.all(
      paths
        .map((entry) => entry.path)
        .filter((relative) => homeFilePathSchema.safeParse(relative).success)
        .map(async (relative) => {
          try {
            return [{ relative, file: await read(root, relative) }];
          } catch (cause) {
            bb.log.warn(
              `could not read ${folder}/${relative}: ${cause instanceof Error ? cause.message : String(cause)}`,
            );
            return [];
          }
        }),
    );
    const found = reads.flat();
    return {
      status: "ready",
      folder,
      root,
      files: found.map(
        ({ relative, file }): HomeFile => ({
          path: relative,
          sizeBytes: file.sizeBytes,
          modifiedAt: file.modifiedAtMs ?? null,
        }),
      ),
    };
  };

  /** Every home's backlog, in home order. */
  const backlogs = async (): Promise<Backlog[]> => {
    const { paths } = await bb.sdk.files.listPaths({
      path: HOMES_ROOT,
      includeFiles: true,
      includeDirectories: false,
      includeHidden: false,
      excludeNames: ["tasks"],
    });
    const found = await Promise.all(
      paths
        .filter((entry) => BACKLOG.test(entry.path))
        .map(async (entry): Promise<Backlog> => {
          const text = textOf(await read(HOMES_ROOT, entry.path));
          return {
            home: path.dirname(entry.path),
            supervisorId: supervisorIdOf(text),
          };
        }),
    );
    return found.sort((a, b) => a.home.localeCompare(b.home));
  };

  return { home, backlogs };
}
