import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifest = JSON.parse(await readFile(new URL("../addons/forge-crm.json", import.meta.url), "utf8"));

test("manifest declares Forge CRM as an enabled Addon", () => {
  assert.equal(manifest.schema_version, "forge.addon_manifest.v1");
  assert.equal(manifest.id, "forge.addon.crm");
  assert.equal(manifest.lifecycle, "enabled");
  assert.equal(manifest.dependencies[0].id, "forge.core.kernel");
});

test("manifest keeps CRM automation behind Forge capabilities and permissions", () => {
  const capabilityIds = new Set(manifest.capabilities.map((capability) => capability.id));
  for (const required of [
    "crm_workflow_factory",
    "crm_relationship_management",
    "crm_commercial_operations",
    "crm_support_omnichannel",
    "crm_marketing_automation",
    "crm_internal_operations",
    "crm_ai_automation"
  ]) {
    assert.ok(capabilityIds.has(required), `missing capability ${required}`);
  }

  const highRisk = manifest.permissions.filter((permission) => permission.risk === "high");
  assert.ok(highRisk.length > 0);
  assert.ok(highRisk.every((permission) => permission.requires_human_approval));
});

test("runtime contracts use Forge-supported external API runtime", () => {
  assert.ok(manifest.runtime_contracts.length >= 6);
  assert.ok(manifest.runtime_contracts.every((contract) => contract.runtime === "external_api"));
  assert.ok(manifest.compatibility.runtimes.includes("external_api"));
});

test("manifest exposes tenant bootstrap as a Forge runtime contract", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.tenant.bootstrap.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.entrypoint, "forge_crm.bootstrap_tenant");
  assert.deepEqual(contract.permissions, ["crm.workflow.mutate"]);

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  assert.ok(artifactTypes.has("crm_workflow_pack"));
  assert.ok(artifactTypes.has("crm_system_blueprint"));
});

test("manifest exposes CRM operating snapshot as a Forge runtime contract", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.operating.snapshot.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.entrypoint, "forge_crm.operating_snapshot");
  assert.deepEqual(contract.permissions, ["crm.workflow.mutate"]);

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  assert.ok(artifactTypes.has("crm_operating_model"));
  assert.ok(artifactTypes.has("crm_operating_snapshot"));
});

test("manifest exposes CRM operating copilot as a recommendation-only executor", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.ai.operating_copilot.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_ai_automation");
  assert.equal(contract.entrypoint, "forge_crm.operating_copilot");
  assert.deepEqual(contract.permissions, ["crm.ai.recommend"]);
  assert.ok(contract.outputs.includes("crm_ai_recommendation"));
  assert.ok(contract.outputs.includes("crm_risk_analysis"));
  assert.ok(contract.outputs.includes("crm_report"));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not mutate")));
});

test("manifest exposes CRM document generation as a Forge-gated executor", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.document.generator.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_internal_operations");
  assert.equal(contract.entrypoint, "forge_crm.generate_document");
  assert.deepEqual(contract.permissions, ["crm.document.generate"]);

  for (const output of [
    "crm_document",
    "crm_contract",
    "crm_report",
    "crm_email",
    "crm_campaign",
    "crm_landing_page",
    "crm_presentation"
  ]) {
    assert.ok(contract.outputs.includes(output), `missing document generator output ${output}`);
  }

  assert.ok(contract.constraints.some((constraint) => constraint.includes("approval is required")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("must not deliver externally")));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  assert.ok(artifactTypes.has("crm_presentation"));
});

test("manifest declares the CRM web application entrypoint as an Addon view asset", () => {
  const systemMap = manifest.views.find((view) => view.id === "crm.system-map");
  assert.ok(systemMap);
  assert.equal(systemMap.surface, "web");
  assert.equal(systemMap.props.web_app.entrypoint, "web/index.html");
  assert.equal(systemMap.props.web_app.snapshot_path, "web/data/operating-snapshot.json");
  assert.equal(systemMap.props.web_app.snapshot_script, "npm run web:snapshot");

  const webIntegration = manifest.integrations.find((integration) => integration.id === "crm.web");
  assert.ok(webIntegration);
  assert.equal(webIntegration.integration_type, "ui");
});

test("CRM scope is workflow-backed across core business areas", () => {
  const workflowIds = new Set(manifest.workflows.map((workflow) => workflow.id));
  for (const workflowId of [
    "crm_entity_lifecycle",
    "crm_pipeline_kanban",
    "crm_proposal_generation",
    "crm_contract_lifecycle",
    "crm_ticket_sla",
    "crm_campaign_lifecycle",
    "crm_project_handoff",
    "crm_document_approval",
    "crm_ai_copilot_recommendation"
  ]) {
    assert.ok(workflowIds.has(workflowId), `missing workflow ${workflowId}`);
  }
});
