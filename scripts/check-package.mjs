#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createFakePluginHost,
  makePluginAgentConfigurationContext,
} from "@get-bb/plugin-sdk/testing";
import { parse } from "yaml";

const root = fileURLToPath(new URL("../", import.meta.url));
const keep = process.argv.includes("--keep");
const temporary = await mkdtemp(join(tmpdir(), "armada-package-"));
let active;

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await files(path)));
    else if (entry.isFile()) result.push(path);
  }
  return result.sort();
}

try {
  const packageJson = JSON.parse(
    await readFile(join(root, "package.json"), "utf8"),
  );
  const packed = JSON.parse(
    execFileSync(
      "npm",
      [
        "pack",
        "--json",
        "--ignore-scripts",
        "--cache",
        join(temporary, "cache"),
        "--pack-destination",
        temporary,
      ],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  );
  assert.equal(packed.length, 1);
  execFileSync("tar", [
    "-xzf",
    join(temporary, packed[0].filename),
    "-C",
    temporary,
  ]);
  const extracted = join(temporary, "package");
  const manifest = JSON.parse(
    await readFile(join(extracted, "package.json"), "utf8"),
  );
  assert.equal(manifest.name, packageJson.name);
  assert.deepEqual(manifest.bb.skills, ["skills"]);
  for (const artifact of [
    "server.js",
    "server.meta.json",
    "app.js",
    "app.css",
    "app.meta.json",
  ]) {
    assert.ok(
      (await readFile(join(extracted, "dist", artifact))).length > 0,
      `Missing built artifact ${artifact}`,
    );
  }
  const sourceSkillFiles = await files(join(root, "skills"));
  for (const source of sourceSkillFiles) {
    const name = relative(root, source);
    assert.deepEqual(
      await readFile(join(extracted, name)),
      await readFile(source),
      `Package lost ${name}`,
    );
  }
  const skillIds = [];
  for (const directory of manifest.bb.skills) {
    for (const file of await files(join(extracted, directory))) {
      if (basename(file) !== "SKILL.md") continue;
      const text = await readFile(file, "utf8");
      const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
      assert.ok(frontmatter, `Missing skill frontmatter in ${file}`);
      skillIds.push(parse(frontmatter[1]).name);
    }
  }
  assert.deepEqual(skillIds, ["armada"]);
  await symlink(
    join(root, "node_modules"),
    join(extracted, "node_modules"),
    "junction",
  );
  const { default: plugin } = await import(
    pathToFileURL(join(extracted, "dist", "server.js")).href
  );
  assert.equal(typeof plugin, "function");
  active = createFakePluginHost({
    pluginId: "armada",
    agentSkillIds: skillIds,
    sdk: {
      threads: { list: async () => [] },
      projects: { list: async () => [] },
      files: { listPaths: async () => ({ paths: [], truncated: false }) },
    },
  });
  await plugin(active.bb);
  for (const providerId of ["codex", "claude-code", "pi", "custom-provider"]) {
    const context = makePluginAgentConfigurationContext({
      provider: { id: providerId },
      host: { id: "remote-machine", name: "Remote machine" },
      environment: { path: "/remote/workspace" },
    });
    assert.deepEqual(
      (await active.harness.behavior.resolveAgentConfiguration(context)).skills,
      ["armada"],
    );
  }
  active = await active.harness.lifecycle.reload(plugin);
  assert.deepEqual(
    (
      await active.harness.behavior.resolveAgentConfiguration(
        makePluginAgentConfigurationContext(),
      )
    ).skills,
    ["armada"],
  );
  for (const source of sourceSkillFiles) {
    const name = relative(root, source);
    const file = join(extracted, name);
    await rename(file, `${file}.held`);
    try {
      await assert.rejects(
        () => active.harness.lifecycle.reload(plugin),
        (error) =>
          error.message.includes(file) &&
          error.message.includes("Reinstall Armada"),
      );
      const incomplete = createFakePluginHost({
        pluginId: "armada",
        agentSkillIds: skillIds,
      });
      try {
        await incomplete.bb.storage.kv.set("captains", { captains: {} });
        await assert.rejects(
          () => plugin(incomplete.bb),
          (error) => error.message.includes(file),
        );
        assert.deepEqual(await incomplete.bb.storage.kv.get("captains"), {
          captains: {},
        });
        assert.equal(
          await incomplete.bb.storage.kv.get("legacy-captains-backup"),
          undefined,
        );
      } finally {
        await incomplete.harness.lifecycle.dispose();
      }
    } finally {
      await rename(`${file}.held`, file);
    }
    assert.deepEqual(await active.harness.callRpc("captains_list", null), []);
  }
  console.log(
    `Verified npm artifact, ${sourceSkillFiles.length} skill assets, native default selection in SDK host contexts, reload, and missing-asset startup failures.`,
  );
} finally {
  await active?.harness.lifecycle.dispose();
  await rm(join(temporary, "package", "node_modules"), { force: true });
  if (keep) console.log(`Package verification artifact: ${temporary}`);
  else await rm(temporary, { recursive: true, force: true });
}
