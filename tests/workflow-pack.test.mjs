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

test("workflow pack includes cross-domain work queue orchestration through Forge", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });
  const workflow = pack.workflows.find((candidate) => candidate.id === "crm.work.queue.orchestration");

  assert.ok(workflow);
  assert.equal(workflow.domain, "operations");
  assert.ok(workflow.runtime_contracts.includes("crm.queue.orchestrator.executor"));
  assert.ok(workflow.depends_on_workflows.includes("crm.ticket.sla"));
  assert.ok(workflow.depends_on_workflows.includes("crm.document.approval"));
  assert.ok(workflow.depends_on_workflows.includes("crm.project.handoff"));

  for (const artifact of ["crm_work_queue_snapshot", "crm_queue_assignment_plan", "crm_queue_sla_risk_report"]) {
    assert.ok(workflow.artifacts.includes(artifact), `missing queue artifact ${artifact}`);
    assert.ok(pack.indexes.artifact_types.includes(artifact), `missing indexed queue artifact ${artifact}`);
  }

  assert.ok(workflow.events.includes("crm.queue.snapshot_generated"));
  assert.ok(workflow.events.includes("crm.queue.assignment_planned"));
  assert.ok(workflow.events.includes("crm.queue.risk_flagged"));
  assert.ok(workflow.validation_gates.includes("queue actions require Forge workflow approval before mutation"));
  assert.ok(pack.indexes.runtime_contracts.includes("crm.queue.orchestrator.executor"));
});

test("workflow pack includes Forge-owned design system generation", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });
  const workflow = pack.workflows.find((candidate) => candidate.id === "crm.design.system");

  assert.ok(workflow);
  assert.equal(workflow.domain, "user_experience");
  assert.ok(workflow.runtime_contracts.includes("crm.design_system.executor"));
  assert.ok(workflow.object_types.includes("design_system"));
  assert.ok(workflow.object_types.includes("design_tokens"));
  assert.ok(workflow.object_types.includes("ui_component_catalog"));

  for (const artifact of ["crm_design_system", "crm_design_token_manifest", "crm_ui_component_catalog"]) {
    assert.ok(workflow.artifacts.includes(artifact), `missing design artifact ${artifact}`);
    assert.ok(pack.indexes.artifact_types.includes(artifact), `missing indexed design artifact ${artifact}`);
  }

  assert.ok(workflow.events.includes("crm.design.system_generated"));
  assert.ok(workflow.events.includes("crm.design.tokens_published"));
  assert.ok(workflow.validation_gates.includes("design tokens are published as Forge artifacts before UI consumption"));
  assert.ok(pack.indexes.runtime_contracts.includes("crm.design_system.executor"));
});

test("AI automation workflow routes operating copilot through a runtime contract", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });
  const aiWorkflow = pack.workflows.find((workflow) => workflow.id === "crm.ai.copilot.recommendation");

  assert.ok(aiWorkflow);
  assert.ok(aiWorkflow.runtime_contracts.includes("crm.ai.operating_copilot.executor"));
  assert.ok(pack.indexes.runtime_contracts.includes("crm.ai.operating_copilot.executor"));
});

test("AI automation workflow routes specialized area copilots through Forge", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });
  const workflow = pack.workflows.find((candidate) => candidate.id === "crm.ai.copilot.recommendation");

  assert.ok(workflow);
  assert.ok(workflow.runtime_contracts.includes("crm.ai.area_copilot.executor"));
  assert.ok(workflow.artifacts.includes("crm_area_copilot_brief"));
  assert.ok(workflow.artifacts.includes("crm_ai_recommendation"));
  assert.ok(workflow.events.includes("crm.ai.area_copilot_generated"));
  assert.ok(workflow.validation_gates.includes("specialized copilot recommendations are scoped by area and cite Forge evidence"));
  assert.ok(pack.indexes.runtime_contracts.includes("crm.ai.area_copilot.executor"));
  assert.ok(pack.indexes.artifact_types.includes("crm_area_copilot_brief"));
});

test("AI automation workflow prepares governed memory promotion through Forge", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });
  const workflow = pack.workflows.find((candidate) => candidate.id === "crm.ai.copilot.recommendation");

  assert.ok(workflow);
  assert.ok(workflow.runtime_contracts.includes("crm.memory.promotion.executor"));
  assert.ok(workflow.artifacts.includes("crm_knowledge_summary"));
  assert.ok(workflow.artifacts.includes("crm_memory_promotion_request"));
  assert.ok(workflow.events.includes("crm.memory.knowledge_curated"));
  assert.ok(workflow.events.includes("crm.memory.promotion_requested"));
  assert.ok(workflow.memory_scopes.includes("organization"));
  assert.ok(workflow.memory_scopes.includes("project"));
  assert.ok(workflow.memory_scopes.includes("processing"));
  assert.ok(pack.indexes.runtime_contracts.includes("crm.memory.promotion.executor"));
});

test("operational observability workflow inspects audit lineage cost metrics and logs through Forge", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });
  const workflow = pack.workflows.find((candidate) => candidate.id === "crm.operational.observability");

  assert.ok(workflow);
  assert.equal(workflow.domain, "operations");
  assert.ok(workflow.runtime_contracts.includes("crm.observability.inspector.executor"));

  for (const artifact of ["crm_audit_report", "crm_lineage_map", "crm_cost_report", "crm_metric_snapshot"]) {
    assert.ok(workflow.artifacts.includes(artifact), `missing observability artifact ${artifact}`);
  }

  for (const event of ["crm.observability.inspected", "crm.audit.reported", "crm.cost.reviewed", "crm.metric.reviewed"]) {
    assert.ok(workflow.events.includes(event), `missing observability event ${event}`);
  }

  assert.ok(workflow.validation_gates.includes("audit lineage cost metrics and logs sourced from Forge"));
  assert.ok(pack.indexes.runtime_contracts.includes("crm.observability.inspector.executor"));
});

test("executive reporting workflow summarizes CRM KPIs through Forge evidence", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });
  const workflow = pack.workflows.find((candidate) => candidate.id === "crm.executive.reporting");
  const observabilityWorkflow = pack.workflows.find((candidate) => candidate.id === "crm.operational.observability");
  const readinessWorkflow = pack.workflows.find((candidate) => candidate.id === "crm.enterprise.readiness");

  assert.ok(workflow);
  assert.equal(workflow.domain, "operations");
  assert.equal(workflow.workflow_extension_id, "crm_executive_reporting");
  assert.ok(workflow.runtime_contracts.includes("crm.analytics.executive_report.executor"));

  for (const dependency of [
    "crm.operational.observability",
    "crm.followup.forecast",
    "crm.goal.commission",
    "crm.ticket.sla",
    "crm.campaign.lifecycle",
    "crm.work.queue.orchestration"
  ]) {
    assert.ok(workflow.depends_on_workflows.includes(dependency), `missing reporting dependency ${dependency}`);
  }

  for (const objectType of ["executive_summary", "kpi_dashboard", "risk", "revenue", "support", "marketing", "workflow"]) {
    assert.ok(workflow.object_types.includes(objectType), `missing executive reporting object ${objectType}`);
  }
  for (const artifact of ["crm_executive_summary", "crm_kpi_dashboard", "crm_business_review_report"]) {
    assert.ok(workflow.artifacts.includes(artifact), `missing executive reporting artifact ${artifact}`);
    assert.ok(pack.indexes.artifact_types.includes(artifact), `missing indexed executive reporting artifact ${artifact}`);
  }
  for (const event of ["crm.executive.summary_generated", "crm.kpi.dashboard_generated", "crm.risk.reviewed"]) {
    assert.ok(workflow.events.includes(event), `missing executive reporting event ${event}`);
  }

  assert.ok(workflow.validation_gates.includes("executive KPIs are derived from Forge workflow artifacts and events"));
  assert.ok(workflow.validation_gates.includes("recommended decisions remain advisory until Forge approval"));
  assert.ok(pack.indexes.runtime_contracts.includes("crm.analytics.executive_report.executor"));
  assert.ok(observabilityWorkflow.runtime_contracts.includes("crm.analytics.executive_report.executor"));
  assert.ok(readinessWorkflow.runtime_contracts.includes("crm.analytics.executive_report.executor"));
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

test("relationship workflow enriches contact and company profiles through Forge", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });
  const workflow = pack.workflows.find((candidate) => candidate.id === "crm.relationship.profile_enrichment");
  const leadLifecycle = pack.workflows.find((candidate) => candidate.id === "crm.lead.lifecycle");

  assert.ok(workflow);
  assert.equal(workflow.domain, "relationship");
  assert.equal(workflow.workflow_extension_id, "crm_relationship_profile_enrichment");
  assert.ok(workflow.runtime_contracts.includes("crm.relationship.profile_enrichment.executor"));
  assert.ok(workflow.depends_on_workflows.includes("crm.lead.lifecycle"));
  assert.ok(workflow.object_types.includes("contact"));
  assert.ok(workflow.object_types.includes("company"));
  assert.ok(workflow.object_types.includes("complete_history"));
  assert.ok(workflow.object_types.includes("unified_timeline"));

  for (const artifact of ["crm_relationship_profile", "crm_enrichment_record", "crm_timeline_snapshot"]) {
    assert.ok(workflow.artifacts.includes(artifact), `missing relationship enrichment artifact ${artifact}`);
    assert.ok(pack.indexes.artifact_types.includes(artifact), `missing indexed enrichment artifact ${artifact}`);
  }
  for (const event of ["crm.contact.enriched", "crm.company.enriched", "crm.relationship.profile_updated"]) {
    assert.ok(workflow.events.includes(event), `missing relationship enrichment event ${event}`);
  }

  assert.ok(workflow.validation_gates.includes("enrichment sources are attached as Forge artifacts"));
  assert.ok(workflow.validation_gates.includes("profile changes require Forge workflow approval before promotion"));
  assert.ok(leadLifecycle.runtime_contracts.includes("crm.relationship.profile_enrichment.executor"));
  assert.ok(pack.indexes.runtime_contracts.includes("crm.relationship.profile_enrichment.executor"));
});

test("pipeline workflow moves opportunities across multiple funnels through Forge", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });
  const workflow = pack.workflows.find((candidate) => candidate.id === "crm.opportunity.pipeline");

  assert.ok(workflow);
  assert.ok(workflow.runtime_contracts.includes("crm.pipeline.stage_move.executor"));
  assert.ok(workflow.artifacts.includes("crm_pipeline_board"));
  assert.ok(workflow.artifacts.includes("crm_stage_change"));
  assert.ok(workflow.artifacts.includes("crm_forecast_report"));
  assert.ok(workflow.events.includes("crm.opportunity.stage_changed"));
  assert.ok(workflow.events.includes("crm.forecast.updated"));
  assert.ok(pack.indexes.runtime_contracts.includes("crm.pipeline.stage_move.executor"));
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

test("document approval workflow records approval decisions through Forge", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });
  const workflow = pack.workflows.find((candidate) => candidate.id === "crm.document.approval");

  assert.ok(workflow);
  assert.ok(workflow.runtime_contracts.includes("crm.document.approval.executor"));
  assert.ok(workflow.artifacts.includes("crm_approval_record"));
  assert.ok(workflow.events.includes("crm.document.approved"));
  assert.ok(workflow.events.includes("crm.document.rework_required"));
  assert.ok(pack.indexes.runtime_contracts.includes("crm.document.approval.executor"));
});

test("document library workflow versions files through Forge artifact lineage", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });
  const workflow = pack.workflows.find((candidate) => candidate.id === "crm.document.library");
  const documentApproval = pack.workflows.find((candidate) => candidate.id === "crm.document.approval");

  assert.ok(workflow);
  assert.ok(documentApproval);
  assert.equal(workflow.domain, "operations");
  assert.equal(workflow.workflow_extension_id, "crm_document_library");
  assert.ok(workflow.runtime_contracts.includes("crm.document.library.executor"));
  assert.ok(workflow.depends_on_workflows.includes("crm.document.approval"));
  assert.ok(workflow.object_types.includes("file"));
  assert.ok(workflow.object_types.includes("document"));
  assert.ok(workflow.object_types.includes("version"));
  assert.ok(workflow.object_types.includes("document_management"));

  for (const artifact of ["crm_file_record", "crm_document_version", "crm_document_collection", "crm_approval_record"]) {
    assert.ok(workflow.artifacts.includes(artifact), `missing document library artifact ${artifact}`);
    assert.ok(pack.indexes.artifact_types.includes(artifact), `missing indexed document library artifact ${artifact}`);
  }
  for (const event of ["crm.file.recorded", "crm.document.versioned", "crm.document.collection_updated"]) {
    assert.ok(workflow.events.includes(event), `missing document library event ${event}`);
  }

  assert.ok(workflow.validation_gates.includes("document versions require Forge artifact lineage before promotion"));
  assert.ok(documentApproval.runtime_contracts.includes("crm.document.library.executor"));
  assert.ok(pack.indexes.runtime_contracts.includes("crm.document.library.executor"));
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

test("commercial goal commission workflow settles targets and commissions through Forge evidence", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });
  const workflow = pack.workflows.find((candidate) => candidate.id === "crm.goal.commission");
  const followupWorkflow = pack.workflows.find((candidate) => candidate.id === "crm.followup.forecast");
  const contractWorkflow = pack.workflows.find((candidate) => candidate.id === "crm.contract.signature");

  assert.ok(workflow);
  assert.equal(workflow.domain, "commercial");
  assert.equal(workflow.workflow_extension_id, "crm_goal_commission_settlement");
  assert.ok(workflow.depends_on_workflows.includes("crm.followup.forecast"));
  assert.ok(workflow.depends_on_workflows.includes("crm.contract.signature"));
  assert.ok(workflow.runtime_contracts.includes("crm.commercial.goal_commission.executor"));

  for (const objectType of ["goal", "commission", "forecast", "contract", "account"]) {
    assert.ok(workflow.object_types.includes(objectType), `missing goal commission object ${objectType}`);
  }
  for (const artifact of ["crm_goal_scorecard", "crm_commission_statement", "crm_compensation_audit_report"]) {
    assert.ok(workflow.artifacts.includes(artifact), `missing goal commission artifact ${artifact}`);
    assert.ok(pack.indexes.artifact_types.includes(artifact), `missing indexed goal commission artifact ${artifact}`);
  }
  for (const event of ["crm.goal.target_set", "crm.goal.attainment_reviewed", "crm.commission.statement_generated"]) {
    assert.ok(workflow.events.includes(event), `missing goal commission event ${event}`);
  }

  assert.ok(workflow.validation_gates.includes("goal attainment and commission settlement require revenue event lineage"));
  assert.ok(workflow.validation_gates.includes("commission payout remains blocked until Forge approval"));
  assert.ok(pack.indexes.runtime_contracts.includes("crm.commercial.goal_commission.executor"));
  assert.ok(followupWorkflow.runtime_contracts.includes("crm.commercial.goal_commission.executor"));
  assert.ok(contractWorkflow.runtime_contracts.includes("crm.commercial.goal_commission.executor"));
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

test("support workflow ingests omnichannel messages before ticket SLA and handoff", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });
  const workflow = pack.workflows.find((candidate) => candidate.id === "crm.omnichannel.message");
  const ticketWorkflow = pack.workflows.find((candidate) => candidate.id === "crm.ticket.sla");

  assert.ok(workflow);
  assert.equal(workflow.domain, "support");
  assert.equal(workflow.workflow_extension_id, "crm_omnichannel_message");
  assert.ok(workflow.runtime_contracts.includes("crm.support.omnichannel_message.executor"));
  assert.ok(workflow.runtime_contracts.includes("crm.omnichannel.handoff"));
  assert.ok(workflow.depends_on_workflows.includes("crm.omnichannel.channel_intake"));
  assert.ok(workflow.object_types.includes("message_thread"));
  assert.ok(workflow.object_types.includes("channel_receipt"));
  for (const channel of ["chat", "whatsapp", "telegram", "email"]) {
    assert.ok(workflow.object_types.includes(channel), `missing omnichannel object ${channel}`);
  }
  assert.ok(workflow.artifacts.includes("crm_message_thread"));
  assert.ok(workflow.artifacts.includes("crm_channel_receipt"));
  assert.ok(workflow.events.includes("crm.message.received"));
  assert.ok(workflow.events.includes("crm.ticket.created"));
  assert.ok(pack.indexes.runtime_contracts.includes("crm.support.omnichannel_message.executor"));
  assert.ok(ticketWorkflow.depends_on_workflows.includes("crm.omnichannel.message"));
});

test("support channel intake normalizes approved adapters before ticket SLA", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });
  const intakeWorkflow = pack.workflows.find((candidate) => candidate.id === "crm.omnichannel.channel_intake");
  const ticketWorkflow = pack.workflows.find((candidate) => candidate.id === "crm.ticket.sla");

  assert.ok(intakeWorkflow);
  assert.ok(ticketWorkflow);
  assert.equal(intakeWorkflow.domain, "support");
  assert.ok(intakeWorkflow.runtime_contracts.includes("crm.support.channel_intake.executor"));
  assert.ok(intakeWorkflow.artifacts.includes("crm_channel_intake"));
  assert.ok(intakeWorkflow.artifacts.includes("crm_channel_receipt"));
  assert.ok(intakeWorkflow.events.includes("crm.channel.authorized"));
  assert.ok(intakeWorkflow.events.includes("crm.message.normalized"));
  assert.ok(intakeWorkflow.validation_gates.includes("approved channel adapter required before ticket creation"));
  assert.ok(ticketWorkflow.depends_on_workflows.includes("crm.omnichannel.channel_intake"));
  assert.ok(pack.indexes.runtime_contracts.includes("crm.support.channel_intake.executor"));
  assert.ok(pack.indexes.artifact_types.includes("crm_channel_intake"));
});

test("support omnichannel center unifies conversations and channel identities through Forge", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });
  const workflow = pack.workflows.find((candidate) => candidate.id === "crm.omnichannel.center");
  const ticketWorkflow = pack.workflows.find((candidate) => candidate.id === "crm.ticket.sla");

  assert.ok(workflow);
  assert.ok(ticketWorkflow);
  assert.equal(workflow.domain, "support");
  assert.equal(workflow.workflow_extension_id, "crm_omnichannel_center");
  assert.ok(workflow.runtime_contracts.includes("crm.support.omnichannel_center.executor"));
  assert.ok(workflow.runtime_contracts.includes("crm.support.channel_intake.executor"));
  assert.ok(workflow.runtime_contracts.includes("crm.support.omnichannel_message.executor"));
  assert.ok(workflow.depends_on_workflows.includes("crm.omnichannel.channel_intake"));
  assert.ok(workflow.object_types.includes("omnichannel_center"));
  assert.ok(workflow.object_types.includes("unified_conversation"));
  assert.ok(workflow.object_types.includes("channel_identity"));

  for (const artifact of ["crm_omnichannel_center_snapshot", "crm_unified_conversation", "crm_channel_identity_map", "crm_support_queue_snapshot"]) {
    assert.ok(workflow.artifacts.includes(artifact), `missing omnichannel center artifact ${artifact}`);
    assert.ok(pack.indexes.artifact_types.includes(artifact), `missing indexed omnichannel center artifact ${artifact}`);
  }
  for (const event of ["crm.omnichannel.center_snapshot", "crm.conversation.unified", "crm.channel.identity_mapped"]) {
    assert.ok(workflow.events.includes(event), `missing omnichannel center event ${event}`);
  }

  assert.ok(workflow.validation_gates.includes("omnichannel center state is sourced from Forge artifacts and events"));
  assert.ok(ticketWorkflow.depends_on_workflows.includes("crm.omnichannel.center"));
  assert.ok(ticketWorkflow.runtime_contracts.includes("crm.support.omnichannel_center.executor"));
  assert.ok(pack.indexes.runtime_contracts.includes("crm.support.omnichannel_center.executor"));
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

test("marketing segment builder creates Forge-owned segment definitions and audiences", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });
  const workflow = pack.workflows.find((candidate) => candidate.id === "crm.marketing.segment_builder");
  const campaignWorkflow = pack.workflows.find((candidate) => candidate.id === "crm.campaign.lifecycle");

  assert.ok(workflow);
  assert.equal(workflow.domain, "marketing");
  assert.equal(workflow.workflow_extension_id, "crm_marketing_segment_builder");
  assert.ok(workflow.runtime_contracts.includes("crm.marketing.segment_builder.executor"));
  assert.ok(workflow.depends_on_workflows.includes("crm.lead.lifecycle"));
  assert.ok(workflow.depends_on_workflows.includes("crm.relationship.profile_enrichment"));
  assert.ok(workflow.object_types.includes("segment"));
  assert.ok(workflow.object_types.includes("audience"));
  assert.ok(workflow.object_types.includes("lead"));

  for (const artifact of ["crm_segment_definition", "crm_segment_audience", "crm_segment", "crm_automation_plan"]) {
    assert.ok(workflow.artifacts.includes(artifact), `missing segment builder artifact ${artifact}`);
    assert.ok(pack.indexes.artifact_types.includes(artifact), `missing indexed segment builder artifact ${artifact}`);
  }
  for (const event of ["crm.segment.defined", "crm.segment.audience_selected", "crm.segment.ready_for_campaign"]) {
    assert.ok(workflow.events.includes(event), `missing segment builder event ${event}`);
  }

  assert.ok(workflow.validation_gates.includes("segment membership changes require Forge workflow approval before campaign use"));
  assert.ok(campaignWorkflow.depends_on_workflows.includes("crm.marketing.segment_builder"));
  assert.ok(campaignWorkflow.runtime_contracts.includes("crm.marketing.segment_builder.executor"));
  assert.ok(pack.indexes.runtime_contracts.includes("crm.marketing.segment_builder.executor"));
});

test("marketing form workflow routes form submissions into Forge lead lifecycle", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });
  const campaignWorkflow = pack.workflows.find((candidate) => candidate.id === "crm.campaign.lifecycle");
  const leadWorkflow = pack.workflows.find((candidate) => candidate.id === "crm.lead.lifecycle");

  assert.ok(campaignWorkflow);
  assert.ok(leadWorkflow);
  assert.ok(campaignWorkflow.runtime_contracts.includes("crm.marketing.form_capture.executor"));
  assert.ok(leadWorkflow.runtime_contracts.includes("crm.marketing.form_capture.executor"));
  assert.ok(campaignWorkflow.artifacts.includes("crm_form_submission"));
  assert.ok(campaignWorkflow.artifacts.includes("crm_consent_record"));
  assert.ok(leadWorkflow.artifacts.includes("crm_lead_capture"));
  assert.ok(campaignWorkflow.events.includes("crm.form.submitted"));
  assert.ok(leadWorkflow.events.includes("crm.lead.created"));
  assert.ok(pack.indexes.runtime_contracts.includes("crm.marketing.form_capture.executor"));
});

test("marketing landing page workflow publishes pages and form schemas through Forge", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });
  const workflow = pack.workflows.find((candidate) => candidate.id === "crm.marketing.landing_page");
  const campaignWorkflow = pack.workflows.find((candidate) => candidate.id === "crm.campaign.lifecycle");

  assert.ok(workflow);
  assert.equal(workflow.domain, "marketing");
  assert.ok(workflow.runtime_contracts.includes("crm.marketing.landing_page.executor"));
  assert.ok(workflow.object_types.includes("landing_page"));
  assert.ok(workflow.object_types.includes("form_schema"));
  assert.ok(workflow.artifacts.includes("crm_landing_page"));
  assert.ok(workflow.artifacts.includes("crm_form_schema"));
  assert.ok(workflow.artifacts.includes("crm_automation_plan"));
  assert.ok(workflow.events.includes("crm.landing_page.composed"));
  assert.ok(workflow.events.includes("crm.landing_page.approval_requested"));
  assert.ok(workflow.events.includes("crm.form.schema_published"));
  assert.ok(workflow.validation_gates.includes("external publication blocked until Forge approval is recorded"));
  assert.ok(workflow.depends_on_workflows.includes("crm.campaign.lifecycle"));
  assert.ok(workflow.depends_on_workflows.includes("crm.lead.nurture"));
  assert.ok(campaignWorkflow.runtime_contracts.includes("crm.marketing.landing_page.executor"));
  assert.ok(pack.indexes.runtime_contracts.includes("crm.marketing.landing_page.executor"));
  assert.ok(pack.indexes.artifact_types.includes("crm_form_schema"));
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

test("enterprise readiness workflow maps success criteria to user-facing deliverables", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });
  const workflow = pack.workflows.find((candidate) => candidate.id === "crm.enterprise.readiness");

  assert.ok(workflow);
  assert.equal(workflow.workflow_extension_id, "crm_enterprise_readiness");
  assert.equal(workflow.domain, "operations");
  assert.ok(workflow.object_types.includes("enterprise_readiness"));
  assert.ok(workflow.object_types.includes("user_outcome"));
  assert.ok(workflow.runtime_contracts.includes("crm.operating.readiness.executor"));
  assert.ok(workflow.artifacts.includes("crm_operating_readiness_report"));
  assert.ok(workflow.artifacts.includes("crm_user_outcome_manifest"));
  assert.ok(workflow.artifacts.includes("crm_domain_coverage_matrix"));
  assert.ok(workflow.artifacts.includes("crm_business_runbook"));
  assert.ok(workflow.events.includes("crm.operating.readiness_reported"));
  assert.ok(workflow.events.includes("crm.outcome.deliverables_mapped"));
  assert.ok(workflow.validation_gates.includes("success criteria mapped to user-facing deliverables"));
  assert.ok(pack.indexes.runtime_contracts.includes("crm.operating.readiness.executor"));
});

test("workflow evolution loop turns CRM bottlenecks into governed Forge experiments", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });
  const workflow = pack.workflows.find((candidate) => candidate.id === "crm.workflow.evolution");

  assert.ok(workflow);
  assert.equal(workflow.workflow_extension_id, "crm_workflow_evolution");
  assert.equal(workflow.domain, "ai_automation");
  assert.ok(workflow.object_types.includes("workflow_evolution"));
  assert.ok(workflow.object_types.includes("benchmark"));
  assert.ok(workflow.object_types.includes("controlled_promotion"));
  assert.ok(workflow.runtime_contracts.includes("crm.workflow.evolution.executor"));
  assert.ok(workflow.runtime_contracts.includes("crm.observability.inspector.executor"));
  assert.ok(workflow.artifacts.includes("crm_workflow_evolution_plan"));
  assert.ok(workflow.artifacts.includes("crm_evolution_experiment"));
  assert.ok(workflow.artifacts.includes("crm_benchmark_report"));
  assert.ok(workflow.artifacts.includes("crm_promotion_decision"));
  assert.ok(workflow.artifacts.includes("crm_core_gap_report"));
  assert.ok(workflow.events.includes("crm.evolution.candidate_generated"));
  assert.ok(workflow.events.includes("crm.evolution.benchmark_reported"));
  assert.ok(workflow.events.includes("crm.evolution.promotion_decision_recorded"));
  assert.ok(workflow.validation_gates.includes("experiment candidate includes changelog and rollback plan"));
  assert.ok(workflow.validation_gates.includes("promotion is blocked until benchmark evidence passes"));
  assert.ok(pack.indexes.runtime_contracts.includes("crm.workflow.evolution.executor"));
});

test("subworkflow orchestration composes CRM child workflows through Forge lineage", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });
  const workflow = pack.workflows.find((candidate) => candidate.id === "crm.subworkflow.orchestration");
  const journey = pack.workflows.find((candidate) => candidate.id === "crm.enterprise.customer_journey");

  assert.ok(workflow);
  assert.equal(workflow.workflow_extension_id, "crm_subworkflow_orchestration");
  assert.equal(workflow.domain, "operations");
  for (const objectType of ["parent_workflow", "child_workflow", "subworkflow_binding", "validation_gate"]) {
    assert.ok(workflow.object_types.includes(objectType), `missing object type ${objectType}`);
  }
  assert.ok(workflow.runtime_contracts.includes("crm.workflow.subworkflow_orchestrator.executor"));
  assert.ok(workflow.runtime_contracts.includes("crm.observability.inspector.executor"));

  for (const workflowId of [
    "crm.opportunity.pipeline",
    "crm.proposal.approval",
    "crm.document.approval",
    "crm.ticket.sla",
    "crm.project.handoff"
  ]) {
    assert.ok(workflow.depends_on_workflows.includes(workflowId), `missing subworkflow dependency ${workflowId}`);
  }

  for (const artifact of ["crm_subworkflow_plan", "crm_subworkflow_lineage_map", "crm_subworkflow_validation_report"]) {
    assert.ok(workflow.artifacts.includes(artifact), `missing subworkflow artifact ${artifact}`);
    assert.ok(pack.indexes.artifact_types.includes(artifact), `missing indexed subworkflow artifact ${artifact}`);
  }
  for (const event of ["crm.subworkflow.bound", "crm.subworkflow.validated", "crm.subworkflow.promoted"]) {
    assert.ok(workflow.events.includes(event), `missing subworkflow event ${event}`);
  }

  assert.ok(workflow.validation_gates.includes("child subworkflows are validated before parent journey promotion"));
  assert.ok(pack.indexes.runtime_contracts.includes("crm.workflow.subworkflow_orchestrator.executor"));
  assert.ok(journey.depends_on_workflows.includes("crm.subworkflow.orchestration"));
});

test("workflow automation designer compiles CRM automations into Forge-owned trigger graphs", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });
  const workflow = pack.workflows.find((candidate) => candidate.id === "crm.workflow.automation_design");
  const aiWorkflow = pack.workflows.find((candidate) => candidate.id === "crm.ai.copilot.recommendation");

  assert.ok(workflow);
  assert.equal(workflow.workflow_extension_id, "crm_workflow_automation_designer");
  assert.equal(workflow.domain, "ai_automation");
  for (const objectType of ["workflow_automation", "trigger", "condition", "action", "schedule", "validation_gate"]) {
    assert.ok(workflow.object_types.includes(objectType), `missing automation object type ${objectType}`);
  }
  assert.ok(workflow.runtime_contracts.includes("crm.workflow.automation_designer.executor"));
  assert.ok(workflow.runtime_contracts.includes("crm.observability.inspector.executor"));

  for (const workflowId of [
    "crm.lead.lifecycle",
    "crm.campaign.lifecycle",
    "crm.ticket.sla",
    "crm.work.queue.orchestration"
  ]) {
    assert.ok(workflow.depends_on_workflows.includes(workflowId), `missing automation dependency ${workflowId}`);
  }

  for (const artifact of ["crm_workflow_automation_spec", "crm_trigger_condition_map", "crm_automation_validation_report"]) {
    assert.ok(workflow.artifacts.includes(artifact), `missing automation artifact ${artifact}`);
    assert.ok(pack.indexes.artifact_types.includes(artifact), `missing indexed automation artifact ${artifact}`);
  }
  for (const event of ["crm.automation.designed", "crm.automation.validated", "crm.automation.queued"]) {
    assert.ok(workflow.events.includes(event), `missing automation event ${event}`);
  }

  assert.ok(workflow.validation_gates.includes("automation design validates trigger condition action graph before activation"));
  assert.ok(workflow.validation_gates.includes("automation execution remains inside Forge workflows"));
  assert.ok(pack.indexes.runtime_contracts.includes("crm.workflow.automation_designer.executor"));
  assert.ok(aiWorkflow.depends_on_workflows.includes("crm.workflow.automation_design"));
});

test("enterprise customer journey proves the CRM can operate one full company lifecycle through Forge", () => {
  const pack = buildCrmWorkflowPack({ tenant_id: "demo" });
  const workflow = pack.workflows.find((candidate) => candidate.id === "crm.enterprise.customer_journey");

  assert.ok(workflow);
  assert.equal(workflow.domain, "operations");
  assert.equal(workflow.workflow_extension_id, "crm_enterprise_customer_journey");
  assert.ok(workflow.object_types.includes("customer_journey"));
  assert.ok(workflow.object_types.includes("operating_acceptance"));
  assert.ok(workflow.runtime_contracts.includes("crm.enterprise.journey.executor"));

  for (const workflowId of [
    "crm.lead.lifecycle",
    "crm.opportunity.pipeline",
    "crm.proposal.approval",
    "crm.contract.signature",
    "crm.account.management",
    "crm.ticket.sla",
    "crm.project.handoff"
  ]) {
    assert.ok(workflow.depends_on_workflows.includes(workflowId), `missing journey dependency ${workflowId}`);
  }

  for (const artifact of ["crm_enterprise_journey_map", "crm_operating_acceptance_evidence", "crm_cross_domain_handoff_map"]) {
    assert.ok(workflow.artifacts.includes(artifact), `missing enterprise journey artifact ${artifact}`);
  }
  for (const event of ["crm.journey.started", "crm.journey.stage_completed", "crm.journey.acceptance_reported"]) {
    assert.ok(workflow.events.includes(event), `missing enterprise journey event ${event}`);
  }

  assert.ok(workflow.validation_gates.includes("all required customer lifecycle stages have Forge artifact and event evidence"));
  assert.ok(pack.indexes.runtime_contracts.includes("crm.enterprise.journey.executor"));
});
