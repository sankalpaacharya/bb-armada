import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";

import plugin from "../server";

type RepoFile = {
  content: string;
  contentEncoding: "base64" | "utf8";
  mimeType: string;
  sizeBytes: number;
};

type Repo = Record<string, RepoFile>;

const svg = (markup: string): RepoFile => ({
  content: markup,
  contentEncoding: "utf8",
  mimeType: "image/svg+xml",
  sizeBytes: markup.length,
});

const binary = (
  mimeType: string,
  base64: string,
  sizeBytes = 100,
): RepoFile => ({
  content: base64,
  contentEncoding: "base64",
  mimeType,
  sizeBytes,
});

const ICO = binary("image/vnd.microsoft.icon", "AAABAAEA");
const PNG = binary("image/png", "iVBORw0KGgo=");
const README: RepoFile = {
  content: "# readme",
  contentEncoding: "utf8",
  mimeType: "text/markdown",
  sizeBytes: 8,
};

const svgUri = (markup: string) =>
  `data:image/svg+xml;base64,${Buffer.from(markup).toString("base64")}`;

async function load(
  projects: { id: string; kind?: "personal" | "standard"; repo: Repo }[],
  settings?: Record<string, string>,
) {
  let repos = projects;
  const read: string[] = [];
  const repoOf = (projectId: string) => {
    read.push(projectId);
    const found = repos.find((project) => project.id === projectId);
    if (found === undefined) throw new Error(`no project ${projectId}`);
    return found.repo;
  };
  const { bb, harness } = createFakePluginHost({
    pluginId: "armada",
    settings,
    sdk: {
      threads: { list: async () => [] },
      subscribe: () => () => {},
      files: { listPaths: async () => ({ paths: [], truncated: false }) },
      projects: {
        list: async () =>
          repos.map(({ id, kind = "standard" }) => ({
            id,
            name: id,
            kind,
          })) as never,
        paths: async ({ projectId, query }) => ({
          paths: Object.keys(repoOf(projectId))
            .filter((path) => path.includes(query ?? ""))
            .map((path) => ({
              kind: "file" as const,
              name: path.split("/").at(-1)!,
              path,
              positions: [],
              score: 1,
            })),
          truncated: false,
        }),
        fileContent: async ({ projectId, path }) => {
          const file = repoOf(projectId)[path];
          if (file === undefined)
            throw new Error(`HTTP 404: Path does not exist: ${path}`);
          return file;
        },
      },
    },
  });
  await plugin(bb);
  return {
    harness,
    logos: () => harness.callRpc("project_logos", null),
    read,
    setProjects: (next: typeof projects) => {
      repos = next;
    },
  };
}

describe("project logos", () => {
  it("never reads the files of a project the settings leave alone", async () => {
    const { logos, read } = await load(
      [
        { id: "kept", repo: { "favicon.svg": svg("<svg>k</svg>") } },
        { id: "Private", repo: { "favicon.svg": svg("<svg>p</svg>") } },
      ],
      { logoSkipProjects: "private, other" },
    );
    expect(await logos()).toEqual({ kept: svgUri("<svg>k</svg>") });
    expect(read).not.toContain("Private");
  });

  it("finds each project's logo in its repo, root files first and apps/web before other workspaces", async () => {
    const { logos } = await load([
      {
        id: "proj_root",
        repo: { "favicon.ico": ICO, "public/favicon.svg": svg("<svg>p</svg>") },
      },
      {
        id: "proj_mono",
        repo: {
          "apps/admin/public/favicon.svg": svg("<svg>admin</svg>"),
          "apps/web/app/favicon.ico": ICO,
          "apps/web/app/icon.svg": svg("<svg>web</svg>"),
          "apps/web/components/icon.svg": svg("<svg>component</svg>"),
          "packages/ui/public/logo.svg": svg("<svg>ui</svg>"),
        },
      },
      {
        id: "proj_next",
        repo: { "src/app/favicon.ico": ICO, "public/logo.png": PNG },
      },
      { id: "proj_none", repo: { "README.md": README } },
      {
        id: "proj_me",
        kind: "personal",
        repo: { "favicon.svg": svg("<svg/>") },
      },
    ]);
    expect(await logos()).toEqual({
      proj_root: "data:image/vnd.microsoft.icon;base64,AAABAAEA",
      proj_mono: svgUri("<svg>web</svg>"),
      proj_next: "data:image/vnd.microsoft.icon;base64,AAABAAEA",
    });
  });

  it("skips a candidate that is too big or not an image and takes the next one", async () => {
    const { logos } = await load([
      {
        id: "proj_a",
        repo: {
          "favicon.svg": { ...svg("<svg/>"), sizeBytes: 65 * 1024 },
          "favicon.ico": binary(
            "text/plain",
            "dmVyc2lvbiBodHRwczovL2dpdC1sZnM=",
          ),
          "logo.png": PNG,
        },
      },
      {
        id: "proj_b",
        repo: { "favicon.png": binary("image/png", "AAAA", 200_000) },
      },
    ]);
    expect(await logos()).toEqual({
      proj_a: "data:image/png;base64,iVBORw0KGgo=",
    });
  });

  it("keeps the other projects' logos when one project cannot be read, with a log line", async () => {
    const { logos, harness } = await load([
      { id: "proj_ok", repo: { "logo.png": PNG } },
      { id: "proj_gone", repo: {} },
    ]);
    harness.sdk.stub("projects.paths", async (args: { projectId: string }) => {
      if (args.projectId === "proj_gone") throw new Error("host offline");
      return {
        paths: [
          {
            kind: "file",
            name: "logo.png",
            path: "logo.png",
            positions: [],
            score: 1,
          },
        ],
        truncated: false,
      };
    });
    expect(await logos()).toEqual({
      proj_ok: "data:image/png;base64,iVBORw0KGgo=",
    });
    expect(harness.logEntries).toContainEqual({
      level: "warn",
      message: expect.stringContaining("proj_gone"),
    });
  });

  it("keeps the logos it read, and on its schedule reads them again, telling the sidebar only when one changed", async () => {
    const { logos, harness, setProjects } = await load([
      { id: "proj_a", repo: { "logo.png": PNG } },
    ]);
    const refreshes = () =>
      harness.experimental_rpcInvalidations.filter((tags) =>
        tags?.includes("logos"),
      ).length;
    const before = await logos();
    setProjects([
      { id: "proj_a", repo: { "logo.svg": svg("<svg>new</svg>") } },
    ]);
    expect(await logos()).toEqual(before);
    await harness.runSchedule("project-logos");
    expect(refreshes()).toBe(1);
    expect(await logos()).toEqual({ proj_a: svgUri("<svg>new</svg>") });
    await harness.runSchedule("project-logos");
    expect(refreshes()).toBe(1);
  });
});
