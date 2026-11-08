#!/usr/bin/env node
// Checks every skills/<name>/SKILL.md against the Agent Skills specification,
// https://agentskills.io/specification, and its best practices.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS = resolve(ROOT, process.argv[2] ?? "skills");

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const KNOWN = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
]);
const MAX_BODY_LINES = 500;
const LINK = /\]\(([^)\s]+)\)|`((?:references|scripts|assets)\/[^`\s]+)`/g;

const problems = [];
const fail = (file, message) =>
  problems.push(`${relative(ROOT, file)}: ${message}`);

function frontmatter(file, text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (match === null) {
    fail(file, "must start with YAML frontmatter between --- lines");
    return null;
  }
  try {
    const data = parse(match[1]);
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      fail(file, "frontmatter must be a YAML mapping");
      return null;
    }
    return { data, body: match[2] };
  } catch (error) {
    fail(file, `frontmatter is not valid YAML: ${error.message.split("\n")[0]}`);
    return null;
  }
}

function checkFields(file, folder, data) {
  for (const key of Object.keys(data))
    if (!KNOWN.has(key)) fail(file, `unknown frontmatter field "${key}"`);

  const { name, description, license, compatibility, metadata } = data;
  if (typeof name !== "string" || name.length === 0)
    fail(file, "name is required");
  else {
    if (name.length > 64) fail(file, "name must be at most 64 characters");
    if (!NAME.test(name))
      fail(
        file,
        "name may only use a-z, 0-9 and single hyphens, and must not start or end with a hyphen",
      );
    if (name !== folder)
      fail(file, `name "${name}" must match its folder "${folder}"`);
  }

  if (typeof description !== "string" || description.trim().length === 0)
    fail(file, "description is required");
  else if (description.length > 1024)
    fail(file, "description must be at most 1024 characters");

  if (license !== undefined && typeof license !== "string")
    fail(file, "license must be a string");
  if (compatibility !== undefined) {
    if (typeof compatibility !== "string" || compatibility.length === 0)
      fail(file, "compatibility must be a non-empty string");
    else if (compatibility.length > 500)
      fail(file, "compatibility must be at most 500 characters");
  }
  if (metadata !== undefined) {
    if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata))
      fail(file, "metadata must be a map of string keys to string values");
    else
      for (const [key, value] of Object.entries(metadata))
        if (typeof value !== "string")
          fail(file, `metadata.${key} must be a string`);
  }
  if (data["allowed-tools"] !== undefined && typeof data["allowed-tools"] !== "string")
    fail(file, "allowed-tools must be a space-separated string");
}

function checkLinks(file, skillDir, text) {
  for (const match of text.matchAll(LINK)) {
    const target = (match[1] ?? match[2]).split("#")[0];
    if (target === "" || /^[a-z]+:/i.test(target) || target.startsWith("/"))
      continue;
    if (!/^(references|scripts|assets)\//.test(target)) continue;
    if (target.split("/").length > 2)
      fail(file, `"${target}" is nested deeper than one folder below the skill`);
    if (!existsSync(join(skillDir, target)))
      fail(file, `"${target}" does not exist`);
  }
}

if (!existsSync(SKILLS)) {
  console.log(`No ${relative(ROOT, SKILLS)}/ folder, nothing to check.`);
  process.exit(0);
}

const folders = readdirSync(SKILLS).filter((entry) =>
  statSync(join(SKILLS, entry)).isDirectory(),
);
for (const folder of folders) {
  const skillDir = join(SKILLS, folder);
  const file = join(skillDir, "SKILL.md");
  if (!existsSync(file)) {
    fail(skillDir, "has no SKILL.md");
    continue;
  }
  const parsed = frontmatter(file, readFileSync(file, "utf8"));
  if (parsed === null) continue;
  checkFields(file, folder, parsed.data);
  const lines = parsed.body.trimEnd().split("\n").length;
  if (lines > MAX_BODY_LINES)
    fail(file, `body is ${lines} lines; keep it under ${MAX_BODY_LINES}`);
  checkLinks(file, skillDir, parsed.body);
  const refs = join(skillDir, "references");
  if (existsSync(refs))
    for (const entry of readdirSync(refs).filter((e) => e.endsWith(".md")))
      checkLinks(join(refs, entry), skillDir, readFileSync(join(refs, entry), "utf8"));
}

if (problems.length > 0) {
  console.error(problems.map((problem) => `✗ ${problem}`).join("\n"));
  console.error(`\n${problems.length} problem(s) in ${folders.length} skill(s).`);
  process.exit(1);
}
console.log(`✓ ${folders.length} skill(s) follow the Agent Skills spec.`);
