import assert from "node:assert/strict";
import test from "node:test";
import { buildCrmWorkflowPack, buildTenantBootstrapResult, REQUIRED_SCOPE } from "../scripts/crm-workflow-pack-lib.mjs";

test("workflow pack covers the full enterprise CRM scope", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "acme" });

  assert.equal(pack.schema_version, "forge.crm_workflow_pack.v1");
  assert.equal(pack.tenant_id, "acme");
  assert.ok(pack.summary.workflow_count >= 10);
  assert.equal(pack.summary.complete_scope, true);

  for (const [domain, scopeItems] of Object.entries(REQUIRED_SCOPE)) {
    assert.equal(pack.coverage[domain].complete, true, `${domain} coverage incomplete`);
    for (const item of scopeItems) {
      assert.ok(pack.coverage[domain].covered.includes(item), `${domain} missing ${item}`);
    }
  }
});

test("every CRM workflow is owned and mutated by Forge runtime", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "acme" });

  for (const workflow of pack.workflows) {
    assert.equal(workflow.forge_state_owner, "forge_workflow");
    assert.equal(workflow.record_identity.primary, "workflow_id");
    assert.equal(workflow.record_identity.external_primary_key_allowed, false);
    assert.equal(workflow.mutation_policy.requires_forge_command, true);
    assert.equal(workflow.mutation_policy.direct_external_persistence, false);
    assert.ok(workflow.states.length >= 4, `${workflow.id} needs explicit states`);
    assert.ok(workflow.transitions.length >= 3, `${workflow.id} needs auditable transitions`);
    assert.ok(workflow.validation_gates.length > 0, `${workflow.id} needs validation gates`);
    assert.equal(workflow.observability.lineage_required, true);
  }
});

test("tenant bootstrap result returns Forge executor artifacts and events", () => {
  const result = buildTenantBootstrapResult({
    input: {
      task_ref: "bootstrap-test",
      input: {
        tenant_context: { tenant_id: "acme" }
      },
      context: {
        provided_context: { tenant: "acme" }
      }
    }
  });

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.tenant_id, "acme");
  assert.equal(result.outputs.complete_scope, true);
  assert.equal(result.outputs.external_database_required, false);
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_workflow_pack"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_system_blueprint"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_operating_model"));
  assert.equal(result.events[0].kind, "crm.tenant.bootstrap_generated");
});

test("workflow pack includes a Forge-owned operating model for business surfaces", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "acme" });
  const model = pack.operating_model;

  assert.equal(model.schema_version, "forge.crm_operating_model.v1");
  assert.equal(model.tenant_id, "acme");
  assert.equal(model.state_owner, "forge_workflow_runtime");
  assert.equal(model.external_database_required, false);
  assert.equal(model.mutation_policy.requires_forge_workflow, true);

  for (const surface of [
    "relationship_graph",
    "pipeline_kanban",
    "commercial_command",
    "support_queue",
    "marketing_calendar",
    "document_queue",
    "ai_workbench"
  ]) {
    assert.ok(model.operator_surfaces[surface], `missing operating surface ${surface}`);
    assert.ok(model.operator_surfaces[surface].workflow_ids.length > 0, `${surface} needs workflow lineage`);
  }

  for (const domain of Object.keys(REQUIRED_SCOPE)) {
    assert.equal(model.business_modules[domain].complete, true, `${domain} operating module incomplete`);
    assert.ok(model.business_modules[domain].workflow_ids.length > 0, `${domain} needs workflow ids`);
  }
});

test("AI automation workflow routes operating copilot through a runtime contract", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });
  const aiWorkflow = pack.workflows.find((workflow) => workflow.id === "crm.ai.copilot.recommendation");

  assert.ok(aiWorkflow);
  assert.ok(aiWorkflow.runtime_contracts.includes("crm.ai.operating_copilot.executor"));
  assert.ok(pack.indexes.runtime_contracts.includes("crm.ai.operating_copilot.executor"));
});
