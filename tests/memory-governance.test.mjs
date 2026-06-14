import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function readJson(relativePath) {
  const content = await readFile(new URL(relativePath, projectRoot), "utf8");
  return JSON.parse(content);
}

test("Forge CRM declares project memory governance for Forge Core", async () => {
  const governance = await readJson(".forge/memory-governance.json");

  assert.equal(governance.schema_version, "forge.memory_governance_config.v1");
  assert.equal(governance.status, "memory_governance_configured");
  assert.equal(governance.memory_level, "MEMORY_STANDARD");
  assert.deepEqual(governance.default_scopes, ["organization", "project", "processing"]);
  assert.equal(governance.default_audience, "internal");
  assert.equal(governance.privacy_mode, "private_by_default");
  assert.equal(governance.retention_mode, "processing_auto_archive");
  assert.equal(governance.approval.approved_by, "arthur");
  assert.match(governance.approval.reason, /Forge CRM/);
  assert.match(governance.approval.reason, /memory/i);
});

test("public CI validates Forge CRM memory policy with the real Forge binary", async () => {
  const ci = await readFile(new URL(".github/workflows/ci.yml", projectRoot), "utf8");

  assert.match(ci, /forge-core\/target\/release\/forge memory policy --project-root \. --output json/);
});

test("memory governance is the only tracked Forge project state", async () => {
  const gitignore = await readFile(new URL(".gitignore", projectRoot), "utf8");

  assert.match(gitignore, /^\.forge\/\*$/m);
  assert.match(gitignore, /^!\.forge\/$/m);
  assert.match(gitignore, /^!\.forge\/memory-governance\.json$/m);
  assert.doesNotMatch(gitignore, /^\.forge\/$/m);
});
