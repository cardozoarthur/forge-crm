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
    "crm_ai_automation",
    "crm_observability"
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

test("manifest exposes CRM relationship timeline as a Forge-owned executor", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.relationship.timeline.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_relationship_management");
  assert.equal(contract.entrypoint, "forge_crm.record_relationship_event");
  assert.deepEqual(contract.permissions, ["crm.workflow.mutate"]);
  assert.ok(contract.outputs.includes("crm_timeline_snapshot"));
  assert.ok(contract.outputs.includes("crm_entity_model"));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not persist")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("Forge workflow artifacts and events")));
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

test("manifest exposes CRM memory promotion as governed Forge memory preparation", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.memory.promotion.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_ai_automation");
  assert.equal(contract.workflow_extension_id, "crm_ai_copilot_recommendation");
  assert.equal(contract.entrypoint, "forge_crm.prepare_memory_promotion");
  assert.deepEqual(contract.permissions, ["crm.ai.recommend"]);
  assert.ok(contract.inputs.includes("source_memory"));
  assert.ok(contract.inputs.includes("curated_knowledge"));
  assert.ok(contract.inputs.includes("promotion_policy"));
  assert.ok(contract.outputs.includes("crm_knowledge_summary"));
  assert.ok(contract.outputs.includes("crm_memory_promotion_request"));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("forge memory promote")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not write memory directly")));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  assert.ok(artifactTypes.has("crm_knowledge_summary"));
  assert.ok(artifactTypes.has("crm_memory_promotion_request"));

  const providerScopes = new Set(manifest.memory_providers.flatMap((provider) => provider.scopes));
  for (const scope of ["global", "organization", "project", "processing"]) {
    assert.ok(providerScopes.has(scope), `missing memory scope ${scope}`);
  }
});

test("manifest exposes CRM observability inspection as a Forge-owned executor", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.observability.inspector.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_observability");
  assert.equal(contract.workflow_extension_id, "crm_operational_observability");
  assert.equal(contract.entrypoint, "forge_crm.inspect_observability");
  assert.deepEqual(contract.permissions, ["crm.observability.inspect"]);

  for (const input of ["workflow_state", "event_timeline", "artifact_lineage", "cost_entries", "metric_samples", "log_entries"]) {
    assert.ok(contract.inputs.includes(input), `missing observability input ${input}`);
  }

  for (const output of ["crm_audit_report", "crm_lineage_map", "crm_cost_report", "crm_metric_snapshot"]) {
    assert.ok(contract.outputs.includes(output), `missing observability output ${output}`);
  }

  assert.ok(contract.constraints.some((constraint) => constraint.includes("derived from Forge workflow artifacts")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not create CRM-local observability state")));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  for (const artifactType of ["crm_audit_report", "crm_lineage_map", "crm_cost_report", "crm_metric_snapshot"]) {
    assert.ok(artifactTypes.has(artifactType), `missing artifact type ${artifactType}`);
  }
});

test("manifest exposes CRM pipeline stage movement as a Forge-owned executor", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.pipeline.stage_move.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_relationship_management");
  assert.equal(contract.workflow_extension_id, "crm_pipeline_kanban");
  assert.equal(contract.entrypoint, "forge_crm.move_opportunity_stage");
  assert.deepEqual(contract.permissions, ["crm.workflow.mutate"]);
  assert.ok(contract.inputs.includes("opportunity"));
  assert.ok(contract.inputs.includes("pipeline_move"));
  assert.ok(contract.outputs.includes("crm_pipeline_board"));
  assert.ok(contract.outputs.includes("crm_stage_change"));
  assert.ok(contract.outputs.includes("crm_forecast_report"));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not persist")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("multiple funnels")));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  assert.ok(artifactTypes.has("crm_pipeline_board"));
  assert.ok(artifactTypes.has("crm_stage_change"));
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

test("manifest exposes CRM commercial follow-up and forecast as a Forge-owned executor", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.commercial.followup_forecast.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_commercial_operations");
  assert.equal(contract.workflow_extension_id, "crm_followup_sequence");
  assert.equal(contract.entrypoint, "forge_crm.review_followup_forecast");
  assert.deepEqual(contract.permissions, ["crm.workflow.mutate", "crm.document.generate"]);
  assert.ok(contract.outputs.includes("crm_followup_plan"));
  assert.ok(contract.outputs.includes("crm_forecast_report"));
  assert.ok(contract.outputs.includes("crm_commission_record"));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not persist")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("commission")));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  assert.ok(artifactTypes.has("crm_followup_plan"));
  assert.ok(artifactTypes.has("crm_forecast_report"));
  assert.ok(artifactTypes.has("crm_commission_record"));
});

test("manifest exposes CRM account management as a Forge-owned commercial executor", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.commercial.account_management.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_commercial_operations");
  assert.equal(contract.workflow_extension_id, "crm_account_management");
  assert.equal(contract.entrypoint, "forge_crm.manage_account");
  assert.deepEqual(contract.permissions, ["crm.workflow.mutate"]);
  assert.ok(contract.outputs.includes("crm_account_plan"));
  assert.ok(contract.outputs.includes("crm_health_report"));
  assert.ok(contract.outputs.includes("crm_forecast_report"));
  assert.ok(contract.outputs.includes("crm_task_plan"));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not persist")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("renewal")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("expansion")));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  assert.ok(artifactTypes.has("crm_account_plan"));
  assert.ok(artifactTypes.has("crm_health_report"));
});

test("manifest exposes CRM contract signature as a Forge-owned commercial executor", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.commercial.contract_signature.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_commercial_operations");
  assert.equal(contract.workflow_extension_id, "crm_contract_lifecycle");
  assert.equal(contract.entrypoint, "forge_crm.manage_contract_signature");
  assert.deepEqual(contract.permissions, ["crm.workflow.mutate", "crm.document.generate"]);
  assert.ok(contract.outputs.includes("crm_contract"));
  assert.ok(contract.outputs.includes("crm_signature_receipt"));
  assert.ok(contract.outputs.includes("crm_renewal_plan"));
  assert.ok(contract.outputs.includes("crm_report"));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not persist")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("signature receipt")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("renewal")));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  assert.ok(artifactTypes.has("crm_signature_receipt"));
  assert.ok(artifactTypes.has("crm_renewal_plan"));
});

test("manifest exposes CRM ticket SLA triage as a Forge-owned executor", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.support.ticket_sla.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_support_omnichannel");
  assert.equal(contract.workflow_extension_id, "crm_ticket_sla");
  assert.equal(contract.entrypoint, "forge_crm.triage_ticket_sla");
  assert.deepEqual(contract.permissions, ["crm.omnichannel.ingest"]);
  assert.ok(contract.outputs.includes("crm_support_summary"));
  assert.ok(contract.outputs.includes("crm_handoff_record"));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not persist")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("SLA wait")));
});

test("manifest exposes CRM omnichannel message ingestion as a Forge-owned executor", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.support.omnichannel_message.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_support_omnichannel");
  assert.equal(contract.workflow_extension_id, "crm_omnichannel_message");
  assert.equal(contract.entrypoint, "forge_crm.ingest_omnichannel_message");
  assert.deepEqual(contract.permissions, ["crm.omnichannel.ingest"]);
  assert.ok(contract.inputs.includes("adapter_event"));
  assert.ok(contract.inputs.includes("message"));
  assert.ok(contract.outputs.includes("crm_message_thread"));
  assert.ok(contract.outputs.includes("crm_channel_receipt"));
  assert.ok(contract.outputs.includes("crm_support_summary"));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not persist")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("before SLA")));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  assert.ok(artifactTypes.has("crm_message_thread"));
  assert.ok(artifactTypes.has("crm_channel_receipt"));

  const messageListener = manifest.event_listeners.find((listener) => listener.id === "crm.message.listener");
  assert.equal(messageListener.runtime_contract_id, "crm.support.omnichannel_message.executor");
});

test("manifest exposes CRM marketing campaign automation as a Forge-owned executor", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.marketing.campaign_automation.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_marketing_automation");
  assert.equal(contract.workflow_extension_id, "crm_campaign_lifecycle");
  assert.equal(contract.entrypoint, "forge_crm.automate_campaign");
  assert.deepEqual(contract.permissions, ["crm.workflow.mutate", "crm.document.generate"]);
  assert.ok(contract.outputs.includes("crm_campaign"));
  assert.ok(contract.outputs.includes("crm_segment"));
  assert.ok(contract.outputs.includes("crm_automation_plan"));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not persist")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("nurture")));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  assert.ok(artifactTypes.has("crm_segment"));
  assert.ok(artifactTypes.has("crm_automation_plan"));
});

test("manifest exposes CRM marketing form capture as a Forge-owned executor", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.marketing.form_capture.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_marketing_automation");
  assert.equal(contract.workflow_extension_id, "crm_campaign_lifecycle");
  assert.equal(contract.entrypoint, "forge_crm.capture_form_submission");
  assert.deepEqual(contract.permissions, ["crm.workflow.mutate"]);
  assert.ok(contract.outputs.includes("crm_form_submission"));
  assert.ok(contract.outputs.includes("crm_lead_capture"));
  assert.ok(contract.outputs.includes("crm_consent_record"));
  assert.ok(contract.outputs.includes("crm_automation_plan"));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not persist")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("lead lifecycle")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("consent")));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  assert.ok(artifactTypes.has("crm_form_submission"));
  assert.ok(artifactTypes.has("crm_lead_capture"));
  assert.ok(artifactTypes.has("crm_consent_record"));
});

test("manifest exposes CRM project handoff operations as a Forge-owned executor", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.operations.project_handoff.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_internal_operations");
  assert.equal(contract.workflow_extension_id, "crm_project_handoff");
  assert.equal(contract.entrypoint, "forge_crm.plan_project_handoff");
  assert.deepEqual(contract.permissions, ["crm.workflow.mutate"]);
  assert.ok(contract.outputs.includes("crm_project_plan"));
  assert.ok(contract.outputs.includes("crm_task_plan"));
  assert.ok(contract.outputs.includes("crm_handoff_record"));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not persist")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("blocked reason")));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  assert.ok(artifactTypes.has("crm_project_plan"));
  assert.ok(artifactTypes.has("crm_task_plan"));
});

test("manifest exposes CRM document approval decisions as a Forge-owned executor", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.document.approval.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_internal_operations");
  assert.equal(contract.workflow_extension_id, "crm_document_approval");
  assert.equal(contract.entrypoint, "forge_crm.record_document_approval");
  assert.deepEqual(contract.permissions, ["crm.workflow.mutate", "crm.document.generate"]);
  assert.ok(contract.inputs.includes("document"));
  assert.ok(contract.inputs.includes("approval_decision"));
  assert.ok(contract.outputs.includes("crm_approval_record"));
  assert.ok(contract.outputs.includes("crm_handoff_record"));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("approval decisions")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("Forge workflow events")));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  assert.ok(artifactTypes.has("crm_approval_record"));
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
