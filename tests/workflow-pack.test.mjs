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

test("relationship and pipeline workflows route timeline updates through Forge", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });

  for (const workflowId of ["crm.lead.lifecycle", "crm.opportunity.pipeline"]) {
    const workflow = pack.workflows.find((candidate) => candidate.id === workflowId);
    assert.ok(workflow, `missing workflow ${workflowId}`);
    assert.ok(workflow.runtime_contracts.includes("crm.relationship.timeline.executor"), `${workflowId} must record relationship timeline through Forge`);
    assert.ok(workflow.artifacts.includes("crm_timeline_snapshot"), `${workflowId} must attach timeline artifacts`);
  }

  assert.ok(pack.indexes.runtime_contracts.includes("crm.relationship.timeline.executor"));
});

test("document workflows route draft generation through a Forge runtime contract", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });

  for (const workflowId of ["crm.contract.signature", "crm.campaign.lifecycle", "crm.document.approval"]) {
    const workflow = pack.workflows.find((candidate) => candidate.id === workflowId);
    assert.ok(workflow, `missing workflow ${workflowId}`);
    assert.ok(workflow.runtime_contracts.includes("crm.document.generator.executor"), `${workflowId} must generate documents through Forge`);
    assert.ok(workflow.runtime_contracts.includes("crm.document.validator"), `${workflowId} must validate generated documents`);
  }

  assert.ok(pack.indexes.runtime_contracts.includes("crm.document.generator.executor"));
});

test("commercial follow-up workflow routes forecast, goals and commission through Forge", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });
  const workflow = pack.workflows.find((candidate) => candidate.id === "crm.followup.forecast");

  assert.ok(workflow);
  assert.ok(workflow.runtime_contracts.includes("crm.commercial.followup_forecast.executor"));
  assert.ok(workflow.artifacts.includes("crm_followup_plan"));
  assert.ok(workflow.artifacts.includes("crm_forecast_report"));
  assert.ok(workflow.artifacts.includes("crm_commission_record"));
  assert.ok(workflow.events.includes("crm.goal.progress_reviewed"));
  assert.ok(workflow.events.includes("crm.commission.accrued"));
  assert.ok(pack.indexes.runtime_contracts.includes("crm.commercial.followup_forecast.executor"));
});

test("commercial account workflow routes health, renewal and expansion through Forge", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });
  const workflow = pack.workflows.find((candidate) => candidate.id === "crm.account.management");

  assert.ok(workflow);
  assert.ok(workflow.runtime_contracts.includes("crm.commercial.account_management.executor"));
  assert.ok(workflow.object_types.includes("account_management"));
  assert.ok(workflow.artifacts.includes("crm_account_plan"));
  assert.ok(workflow.artifacts.includes("crm_health_report"));
  assert.ok(workflow.artifacts.includes("crm_forecast_report"));
  assert.ok(workflow.artifacts.includes("crm_task_plan"));
  assert.ok(workflow.events.includes("crm.account.health_reviewed"));
  assert.ok(workflow.events.includes("crm.account.renewal_planned"));
  assert.ok(workflow.events.includes("crm.account.expansion_identified"));
  assert.ok(workflow.events.includes("crm.task.created"));
  assert.ok(pack.indexes.runtime_contracts.includes("crm.commercial.account_management.executor"));
});

test("commercial contract workflow routes signature and renewal through Forge", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });
  const workflow = pack.workflows.find((candidate) => candidate.id === "crm.contract.signature");

  assert.ok(workflow);
  assert.ok(workflow.runtime_contracts.includes("crm.commercial.contract_signature.executor"));
  assert.ok(workflow.artifacts.includes("crm_contract"));
  assert.ok(workflow.artifacts.includes("crm_signature_receipt"));
  assert.ok(workflow.artifacts.includes("crm_renewal_plan"));
  assert.ok(workflow.events.includes("crm.contract.reviewed"));
  assert.ok(workflow.events.includes("crm.contract.signed"));
  assert.ok(workflow.events.includes("crm.contract.renewal_scheduled"));
  assert.ok(pack.indexes.runtime_contracts.includes("crm.commercial.contract_signature.executor"));
});

test("support workflow routes ticket SLA triage through Forge", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });
  const workflow = pack.workflows.find((candidate) => candidate.id === "crm.ticket.sla");

  assert.ok(workflow);
  assert.ok(workflow.runtime_contracts.includes("crm.support.ticket_sla.executor"));
  assert.ok(workflow.runtime_contracts.includes("crm.omnichannel.handoff"));
  assert.ok(workflow.artifacts.includes("crm_support_summary"));
  assert.ok(workflow.events.includes("crm.sla.escalated"));
  assert.ok(pack.indexes.runtime_contracts.includes("crm.support.ticket_sla.executor"));
});

test("marketing workflows route campaign automation and nurture through Forge", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });

  for (const workflowId of ["crm.campaign.lifecycle", "crm.lead.nurture"]) {
    const workflow = pack.workflows.find((candidate) => candidate.id === workflowId);
    assert.ok(workflow, `missing workflow ${workflowId}`);
    assert.ok(
      workflow.runtime_contracts.includes("crm.marketing.campaign_automation.executor"),
      `${workflowId} must route campaign automation through Forge`
    );
  }

  const campaignWorkflow = pack.workflows.find((candidate) => candidate.id === "crm.campaign.lifecycle");
  assert.ok(campaignWorkflow.artifacts.includes("crm_segment"));
  assert.ok(campaignWorkflow.artifacts.includes("crm_automation_plan"));
  assert.ok(campaignWorkflow.events.includes("crm.campaign.scheduled"));
  assert.ok(pack.indexes.runtime_contracts.includes("crm.marketing.campaign_automation.executor"));
});

test("operations workflow routes project handoff and task planning through Forge", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });
  const workflow = pack.workflows.find((candidate) => candidate.id === "crm.project.handoff");

  assert.ok(workflow);
  assert.ok(workflow.runtime_contracts.includes("crm.operations.project_handoff.executor"));
  assert.ok(workflow.artifacts.includes("crm_project_plan"));
  assert.ok(workflow.artifacts.includes("crm_task_plan"));
  assert.ok(workflow.artifacts.includes("crm_handoff_record"));
  assert.ok(workflow.events.includes("crm.task.created"));
  assert.ok(workflow.events.includes("crm.task.blocked"));
  assert.ok(pack.indexes.runtime_contracts.includes("crm.operations.project_handoff.executor"));
});
