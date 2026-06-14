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
  assert.equal(result.events[0].kind, "crm.tenant.bootstrap_generated");
});

