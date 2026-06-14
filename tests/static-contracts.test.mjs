import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildCrmWebAppSnapshot } from "../scripts/crm-web-app-lib.mjs";
import { buildCrmWorkflowPack } from "../scripts/crm-workflow-pack-lib.mjs";

const template = JSON.parse(await readFile(new URL("../workflows/crm-system-template.json", import.meta.url), "utf8"));
const architecture = await readFile(new URL("../docs/architecture.md", import.meta.url), "utf8");
const initialValidation = await readFile(new URL("../docs/initial-validation.md", import.meta.url), "utf8");
const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

test("system template exposes installation authorization as the first CRM operation", () => {
  const installation = template.modules.find((module) => module.id === "installation");

  assert.ok(installation, "missing installation module");
  assert.deepEqual(installation.workflow_extensions, ["crm_installation_authorization"]);
  for (const object of ["installation_authorization", "permission_gate", "tenant_onboarding"]) {
    assert.ok(installation.objects.includes(object), `missing installation object ${object}`);
  }
  for (const requirement of [
    "human permission authorization",
    "no automatic permission mutation",
    "tenant bootstrap blocked until authorization"
  ]) {
    assert.ok(installation.forge_requirements.includes(requirement), `missing Forge requirement ${requirement}`);
  }
  assert.equal(template.core_gap_policy.repository, "forge-core");
});

test("architecture doc stays current with installation authorization runtime", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });

  assert.match(architecture, /forge_crm\.prepare_installation_authorization/);
  assert.match(architecture, new RegExp(`declares ${pack.summary.workflow_count} Forge-owned workflows`));
  assert.match(architecture, /installation authorization workbench/);
});

test("README documents permission preparation before CRM tenant operation", () => {
  assert.match(readme, /installation authorization/i);
  assert.match(readme, /prepare Forge permission authorization commands/i);
  assert.match(readme, /does not grant permissions automatically/i);
  assert.match(readme, /crm\.installation\.authorization\.executor/);
});

test("initial validation report stays aligned with generated CRM evidence counts", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });
  const snapshot = buildCrmWebAppSnapshot({ tenant_id: "demo" });

  assert.match(
    initialValidation,
    new RegExp(`${pack.summary.workflow_count} workflows, ${pack.indexes.object_types.length} object types`)
  );
  assert.match(initialValidation, new RegExp(`${snapshot.workflow_graph.nodes.length} workflow graph nodes`));
  assert.match(initialValidation, new RegExp(`${snapshot.actions.length} Forge command actions`));
  assert.match(initialValidation, new RegExp(`bootstrap_workflow_count=${pack.summary.workflow_count}`));
});
