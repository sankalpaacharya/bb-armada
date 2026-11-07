import type { BbPluginApi } from "@get-bb/plugin-sdk";

/** Each project's logo as an image data URI, for the projects whose repo has one. */
export type ProjectLogos = Record<string, string>;

type FileContent = Awaited<
  ReturnType<BbPluginApi["sdk"]["projects"]["fileContent"]>
>;

const MAX_BYTES = 64 * 1024;

/** The image types a logo may be; anything else is skipped. */
const IMAGE_TYPES = new Set([
  "image/svg+xml",
  "image/png",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "image/webp",
]);

const ROOT_CANDIDATES = [
  "favicon.svg",
  "favicon.ico",
  "favicon.png",
  "icon.svg",
  "icon.png",
  "logo.svg",
  "logo.png",
  "public/favicon.svg",
  "public/favicon.ico",
  "public/favicon.png",
  "public/icon.svg",
  "public/logo.svg",
  "app/icon.svg",
  "app/icon.png",
  "app/favicon.ico",
  "src/app/icon.svg",
  "src/app/favicon.ico",
  "static/favicon.ico",
];

const WORKSPACE_CANDIDATES = ROOT_CANDIDATES.filter((path) =>
  /^(?:public|app)\//.test(path),
);

const WORKSPACE = /^(?:apps|packages)\/[^/]+(?=\/)/;

/** apps/web first, then the other apps, then packages. */
const workspaceOrder = (a: string, b: string) =>
  Number(a !== "apps/web") - Number(b !== "apps/web") || a.localeCompare(b);

/** The listed paths that may be the project's logo, best first. */
function logoCandidates(listed: Iterable<string>): string[] {
  const present = new Set(listed);
  const workspaces = new Set(
    [...present].flatMap((path) => WORKSPACE.exec(path)?.[0] ?? []),
  );
  return [
    ...ROOT_CANDIDATES,
    ...[...workspaces]
      .sort(workspaceOrder)
      .flatMap((root) => WORKSPACE_CANDIDATES.map((path) => `${root}/${path}`)),
  ].filter((path) => present.has(path));
}

/**
 * A file as a data URI, or null when it is too big or not an image. SVGs stay
 * a data URI so they only ever render through <img>, where scripts never run.
 */
function logoDataUri(file: FileContent): string | null {
  const mimeType = file.mimeType.split(";")[0].trim().toLowerCase();
  if (file.sizeBytes > MAX_BYTES || !IMAGE_TYPES.has(mimeType)) return null;
  const base64 =
    file.contentEncoding === "base64"
      ? file.content
      : Buffer.from(file.content, "utf8").toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

/** Fuzzy path queries whose matches include every candidate's file name. */
const QUERIES = ["icon", "logo"];

/**
 * Finds each project's logo the way T3 Code does, from a favicon or logo in
 * its repo. The map is kept for the process; `refresh` reads it afresh.
 */
export function createLogoReader(bb: BbPluginApi) {
  const { projects } = bb.sdk;

  const logoOf = async (projectId: string): Promise<string | null> => {
    const listings = await Promise.all(
      QUERIES.map((query) =>
        projects.paths({
          projectId,
          query,
          includeFiles: "true",
          includeDirectories: "false",
        }),
      ),
    );
    const listed = listings.flatMap(({ paths }) =>
      paths.map((entry) => entry.path),
    );
    for (const path of logoCandidates(listed)) {
      const uri = logoDataUri(await projects.fileContent({ projectId, path }));
      if (uri !== null) return uri;
    }
    return null;
  };

  const read = async (): Promise<ProjectLogos> => {
    const standard = (await projects.list()).filter(
      (project) => project.kind === "standard",
    );
    const found = await Promise.all(
      standard.map(async (project): Promise<[string, string][]> => {
        try {
          const uri = await logoOf(project.id);
          return uri === null ? [] : [[project.id, uri]];
        } catch (cause) {
          bb.log.warn(
            `could not read the logo of project ${project.id}: ${cause instanceof Error ? cause.message : String(cause)}`,
          );
          return [];
        }
      }),
    );
    return Object.fromEntries(found.flat());
  };

  let current: Promise<ProjectLogos> | null = null;
  const load = () => {
    const loading = read();
    current = loading;
    loading.catch(() => {
      if (current === loading) current = null;
    });
    return loading;
  };

  return {
    logos: (): Promise<ProjectLogos> => current ?? load(),
    /** Reads every logo again; true unless the last good read matched it. */
    refresh: async (): Promise<boolean> => {
      const before = (await current?.catch(() => null)) ?? null;
      const after = await load();
      return (
        before === null || JSON.stringify(before) !== JSON.stringify(after)
      );
    },
  };
}
