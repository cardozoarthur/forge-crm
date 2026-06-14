import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";

const manifest = JSON.parse(await readFile(new URL("../addons/forge-crm.json", import.meta.url), "utf8"));
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const execFileAsync = promisify(execFile);

test("manifest declares Forge CRM as an enabled Addon", () => {
  assert.equal(manifest.schema_version, "forge.addon_manifest.v1");
  assert.equal(manifest.id, "forge.addon.crm");
  assert.equal(manifest.lifecycle, "enabled");
  assert.equal(manifest.dependencies[0].id, "forge.core.kernel");
});

test("public Addon package is versioned and not ignored by the repository", async () => {
  const packagePath = `forge-crm-${packageJson.version}.package.json`;
  const addonPackage = JSON.parse(await readFile(new URL(`../${packagePath}`, import.meta.url), "utf8"));

  assert.equal(addonPackage.schema_version, "forge.addon_package.v1");
  assert.equal(addonPackage.status, "addon_package_ready");
  assert.equal(addonPackage.package_id, `${manifest.id}@${manifest.version}`);
  assert.equal(addonPackage.distribution.repository, "https://github.com/cardozoarthur/forge-crm");
  assert.equal(addonPackage.distribution.channel, "stable");
  assert.equal(addonPackage.validation.status, "valid");
  assert.deepEqual(addonPackage.summary.dependencies, ["forge.core.kernel >=0.1.0"]);

  await assert.rejects(
    () => execFileAsync("git", ["check-ignore", "-q", packagePath], { cwd: new URL("..", import.meta.url) }),
    (error) => error.code === 1
  );
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
    "crm_user_experience",
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

test("manifest exposes relationship profile enrichment as a Forge-owned executor", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.relationship.profile_enrichment.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_relationship_management");
  assert.equal(contract.workflow_extension_id, "crm_relationship_profile_enrichment");
  assert.equal(contract.entrypoint, "forge_crm.enrich_relationship_profile");
  assert.deepEqual(contract.permissions, ["crm.workflow.mutate", "crm.ai.recommend"]);

  for (const input of ["entity_profile", "enrichment_sources", "relationship_signals", "tenant_context"]) {
    assert.ok(contract.inputs.includes(input), `missing relationship enrichment input ${input}`);
  }
  for (const output of ["crm_relationship_profile", "crm_enrichment_record", "crm_timeline_snapshot"]) {
    assert.ok(contract.outputs.includes(output), `missing relationship enrichment output ${output}`);
  }
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not persist CRM state outside Forge")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("Forge workflow approval")));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  assert.ok(artifactTypes.has("crm_relationship_profile"));
  assert.ok(artifactTypes.has("crm_enrichment_record"));
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

test("manifest exposes specialized CRM area copilots as Forge recommendation contracts", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.ai.area_copilot.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_ai_automation");
  assert.equal(contract.workflow_extension_id, "crm_ai_copilot_recommendation");
  assert.equal(contract.entrypoint, "forge_crm.run_area_copilot");
  assert.deepEqual(contract.permissions, ["crm.ai.recommend"]);
  for (const input of ["area_contexts", "copilot_policy", "tenant_context"]) {
    assert.ok(contract.inputs.includes(input), `missing area copilot input ${input}`);
  }
  for (const output of ["crm_area_copilot_brief", "crm_ai_recommendation", "crm_risk_analysis"]) {
    assert.ok(contract.outputs.includes(output), `missing area copilot output ${output}`);
  }
  assert.ok(contract.constraints.some((constraint) => constraint.includes("specialized by CRM area")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not mutate")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("Forge workflow approval")));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  assert.ok(artifactTypes.has("crm_area_copilot_brief"));

  const aiEvents = new Set(manifest.event_types.map((event) => event.id));
  assert.ok(aiEvents.has("crm.ai"));
});

test("manifest exposes cross-domain CRM work queues as a Forge-owned executor", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.queue.orchestrator.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_internal_operations");
  assert.equal(contract.workflow_extension_id, "crm_work_queue_orchestration");
  assert.equal(contract.entrypoint, "forge_crm.orchestrate_work_queue");
  assert.deepEqual(contract.permissions, ["crm.workflow.mutate", "crm.ai.recommend", "crm.observability.inspect"]);
  for (const input of ["queue_items", "assignment_policy", "tenant_context"]) {
    assert.ok(contract.inputs.includes(input), `missing work queue input ${input}`);
  }
  for (const output of ["crm_work_queue_snapshot", "crm_queue_assignment_plan", "crm_queue_sla_risk_report"]) {
    assert.ok(contract.outputs.includes(output), `missing work queue output ${output}`);
  }
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not mutate")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("Forge workflow approval")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("artifact and event evidence")));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  for (const artifactType of ["crm_work_queue_snapshot", "crm_queue_assignment_plan", "crm_queue_sla_risk_report"]) {
    assert.ok(artifactTypes.has(artifactType), `missing artifact type ${artifactType}`);
  }

  const eventTypes = new Set(manifest.event_types.map((event) => event.id));
  assert.ok(eventTypes.has("crm.queue"));
});

test("manifest exposes CRM design system as a Forge-owned UI contract", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.design_system.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_user_experience");
  assert.equal(contract.workflow_extension_id, "crm_design_system");
  assert.equal(contract.entrypoint, "forge_crm.generate_design_system");
  assert.deepEqual(contract.permissions, ["crm.observability.inspect"]);
  for (const input of ["brand_context", "token_overrides", "component_requests", "design_policy", "tenant_context"]) {
    assert.ok(contract.inputs.includes(input), `missing design system input ${input}`);
  }
  for (const output of ["crm_design_system", "crm_design_token_manifest", "crm_ui_component_catalog"]) {
    assert.ok(contract.outputs.includes(output), `missing design system output ${output}`);
  }
  assert.ok(contract.constraints.some((constraint) => constraint.includes("Penpot")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not mutate")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("Forge workflow artifacts")));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  for (const artifactType of ["crm_design_system", "crm_design_token_manifest", "crm_ui_component_catalog"]) {
    assert.ok(artifactTypes.has(artifactType), `missing artifact type ${artifactType}`);
  }

  const eventTypes = new Set(manifest.event_types.map((event) => event.id));
  assert.ok(eventTypes.has("crm.design"));
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

test("manifest exposes CRM operating readiness as a user-facing outcome package", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.operating.readiness.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_workflow_factory");
  assert.equal(contract.workflow_extension_id, "crm_enterprise_readiness");
  assert.equal(contract.entrypoint, "forge_crm.generate_operating_readiness");
  assert.deepEqual(contract.permissions, ["crm.observability.inspect"]);

  for (const input of ["workflow_pack", "operating_snapshot", "validation_evidence", "success_criteria", "tenant_context"]) {
    assert.ok(contract.inputs.includes(input), `missing readiness input ${input}`);
  }

  for (const output of [
    "crm_operating_readiness_report",
    "crm_user_outcome_manifest",
    "crm_domain_coverage_matrix",
    "crm_business_runbook"
  ]) {
    assert.ok(contract.outputs.includes(output), `missing readiness output ${output}`);
  }

  assert.ok(contract.constraints.some((constraint) => constraint.includes("user-facing deliverables")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("Forge workflows")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not create CRM-local state")));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  for (const artifactType of [
    "crm_operating_readiness_report",
    "crm_user_outcome_manifest",
    "crm_domain_coverage_matrix",
    "crm_business_runbook"
  ]) {
    assert.ok(artifactTypes.has(artifactType), `missing artifact type ${artifactType}`);
  }

  const eventTypes = new Set(manifest.event_types.map((event) => event.id));
  assert.ok(eventTypes.has("crm.readiness"));
  assert.ok(eventTypes.has("crm.outcome"));
});

test("manifest exposes adaptive CRM workflow evolution through Forge", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.workflow.evolution.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_workflow_factory");
  assert.equal(contract.workflow_extension_id, "crm_workflow_evolution");
  assert.equal(contract.entrypoint, "forge_crm.evolve_workflow");
  assert.deepEqual(contract.permissions, ["crm.observability.inspect", "crm.workflow.mutate"]);

  for (const input of ["workflow_state", "observability_report", "candidate_changes", "benchmark_policy", "tenant_context"]) {
    assert.ok(contract.inputs.includes(input), `missing workflow evolution input ${input}`);
  }

  for (const output of [
    "crm_workflow_evolution_plan",
    "crm_evolution_experiment",
    "crm_benchmark_report",
    "crm_promotion_decision",
    "crm_core_gap_report"
  ]) {
    assert.ok(contract.outputs.includes(output), `missing workflow evolution output ${output}`);
  }

  assert.ok(contract.constraints.some((constraint) => constraint.includes("forge improve")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not self-modify")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("benchmark")));

  const workflowExtensionIds = new Set(manifest.workflows.map((extension) => extension.id));
  assert.ok(workflowExtensionIds.has("crm_workflow_evolution"));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  for (const artifactType of [
    "crm_workflow_evolution_plan",
    "crm_evolution_experiment",
    "crm_benchmark_report",
    "crm_promotion_decision",
    "crm_core_gap_report"
  ]) {
    assert.ok(artifactTypes.has(artifactType), `missing artifact type ${artifactType}`);
  }

  const eventTypes = new Set(manifest.event_types.map((event) => event.id));
  assert.ok(eventTypes.has("crm.evolution"));
});

test("manifest exposes enterprise journey execution as a Forge-owned CRM acceptance contract", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.enterprise.journey.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_workflow_factory");
  assert.equal(contract.workflow_extension_id, "crm_enterprise_customer_journey");
  assert.equal(contract.entrypoint, "forge_crm.run_enterprise_journey");
  assert.ok(contract.permissions.includes("crm.workflow.mutate"));
  assert.ok(contract.permissions.includes("crm.document.generate"));
  assert.ok(contract.permissions.includes("crm.omnichannel.ingest"));

  for (const input of ["journey_context", "stage_evidence", "acceptance_policy", "tenant_context"]) {
    assert.ok(contract.inputs.includes(input), `missing enterprise journey input ${input}`);
  }
  for (const output of ["crm_enterprise_journey_map", "crm_operating_acceptance_evidence", "crm_cross_domain_handoff_map"]) {
    assert.ok(contract.outputs.includes(output), `missing enterprise journey output ${output}`);
  }
  assert.ok(contract.constraints.some((constraint) => constraint.includes("main flow must stay Forge-owned")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not create CRM-local persistence")));

  const workflowExtensionIds = new Set(manifest.workflows.map((extension) => extension.id));
  assert.ok(workflowExtensionIds.has("crm_enterprise_customer_journey"));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  for (const artifactType of ["crm_enterprise_journey_map", "crm_operating_acceptance_evidence", "crm_cross_domain_handoff_map"]) {
    assert.ok(artifactTypes.has(artifactType), `missing artifact type ${artifactType}`);
  }

  const eventTypes = new Set(manifest.event_types.map((eventType) => eventType.id));
  assert.ok(eventTypes.has("crm.journey"));
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

test("manifest exposes CRM channel intake normalization as a Forge-owned executor", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.support.channel_intake.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_support_omnichannel");
  assert.equal(contract.workflow_extension_id, "crm_omnichannel_channel_intake");
  assert.equal(contract.entrypoint, "forge_crm.normalize_channel_intake");
  assert.deepEqual(contract.permissions, ["crm.omnichannel.ingest"]);
  for (const input of ["channel", "provider_event", "channel_policy", "routing_policy", "tenant_context"]) {
    assert.ok(contract.inputs.includes(input), `missing channel intake input ${input}`);
  }
  assert.ok(contract.outputs.includes("crm_channel_intake"));
  assert.ok(contract.outputs.includes("crm_channel_receipt"));
  assert.ok(contract.outputs.includes("crm_message_thread"));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("approved channel adapter")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("before ticket creation")));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  assert.ok(artifactTypes.has("crm_channel_intake"));
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

test("manifest exposes CRM marketing segment builder as a Forge-owned executor", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.marketing.segment_builder.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_marketing_automation");
  assert.equal(contract.workflow_extension_id, "crm_marketing_segment_builder");
  assert.equal(contract.entrypoint, "forge_crm.build_marketing_segment");
  assert.deepEqual(contract.permissions, ["crm.workflow.mutate", "crm.ai.recommend"]);

  for (const input of ["segment_request", "audience_source", "selection_policy", "tenant_context"]) {
    assert.ok(contract.inputs.includes(input), `missing segment builder input ${input}`);
  }
  for (const output of ["crm_segment_definition", "crm_segment_audience", "crm_segment", "crm_automation_plan"]) {
    assert.ok(contract.outputs.includes(output), `missing segment builder output ${output}`);
  }
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not persist CRM state outside Forge")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("campaign automation")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("Forge workflow approval")));

  const workflowExtensionIds = new Set(manifest.workflows.map((extension) => extension.id));
  assert.ok(workflowExtensionIds.has("crm_marketing_segment_builder"));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  assert.ok(artifactTypes.has("crm_segment_definition"));
  assert.ok(artifactTypes.has("crm_segment_audience"));

  const eventTypes = new Set(manifest.event_types.map((event) => event.id));
  assert.ok(eventTypes.has("crm.segment"));
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

test("manifest exposes CRM landing page publishing as a Forge-owned executor", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.marketing.landing_page.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_marketing_automation");
  assert.equal(contract.workflow_extension_id, "crm_marketing_landing_page");
  assert.equal(contract.entrypoint, "forge_crm.publish_landing_page");
  assert.deepEqual(contract.permissions, ["crm.workflow.mutate", "crm.document.generate"]);
  for (const input of ["campaign", "landing_page", "form_schema", "approval_policy", "routing_policy", "tenant_context"]) {
    assert.ok(contract.inputs.includes(input), `missing landing page input ${input}`);
  }
  for (const output of ["crm_landing_page", "crm_form_schema", "crm_automation_plan"]) {
    assert.ok(contract.outputs.includes(output), `missing landing page output ${output}`);
  }
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not persist")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("approval")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("form submissions")));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  assert.ok(artifactTypes.has("crm_landing_page"));
  assert.ok(artifactTypes.has("crm_form_schema"));

  const eventTypes = new Set(manifest.event_types.map((event) => event.id));
  assert.ok(eventTypes.has("crm.landing_page"));
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

test("manifest exposes CRM document library management as a Forge-owned executor", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.document.library.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_internal_operations");
  assert.equal(contract.workflow_extension_id, "crm_document_library");
  assert.equal(contract.entrypoint, "forge_crm.manage_document_library");
  assert.deepEqual(contract.permissions, ["crm.workflow.mutate", "crm.document.generate"]);

  for (const input of ["document_request", "file_record", "version_policy", "tenant_context"]) {
    assert.ok(contract.inputs.includes(input), `missing document library input ${input}`);
  }
  for (const output of ["crm_file_record", "crm_document_version", "crm_document_collection", "crm_approval_record"]) {
    assert.ok(contract.outputs.includes(output), `missing document library output ${output}`);
  }

  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not persist CRM state outside Forge")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("Forge artifact lineage")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("version promotion")));

  const workflowExtensionIds = new Set(manifest.workflows.map((extension) => extension.id));
  assert.ok(workflowExtensionIds.has("crm_document_library"));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  assert.ok(artifactTypes.has("crm_file_record"));
  assert.ok(artifactTypes.has("crm_document_version"));
  assert.ok(artifactTypes.has("crm_document_collection"));

  const eventTypes = new Set(manifest.event_types.map((event) => event.id));
  assert.ok(eventTypes.has("crm.file"));
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

test("manifest exposes a Forge TUI operational cockpit with permission-gated CRM actions", () => {
  const cockpit = manifest.views.find((view) => view.id === "crm.operational-cockpit");
  assert.ok(cockpit);
  assert.equal(cockpit.surface, "tui");
  assert.equal(cockpit.type, "dashboard");
  assert.equal(cockpit.component, "ForgeCrmOperationalCockpit");
  assert.equal(cockpit.layout.zone, "main");
  assert.equal(cockpit.layout.density, "dense");

  for (const binding of [
    "crm-operating-snapshot",
    "crm-workflow-cadences",
    "crm-action-invocation-plans",
    "crm-structured-logs"
  ]) {
    assert.ok(cockpit.data_bindings.some((candidate) => candidate.id === binding), `missing binding ${binding}`);
  }

  for (const permission of [
    "crm.workflow.mutate",
    "crm.omnichannel.ingest",
    "crm.document.generate",
    "crm.ai.recommend",
    "crm.observability.inspect"
  ]) {
    assert.ok(cockpit.permissions.includes(permission), `missing cockpit permission ${permission}`);
  }

  const actionIds = new Set(cockpit.actions.map((action) => action.id));
  for (const actionId of [
    "crm.tui.refresh-operating-snapshot",
    "crm.tui.enrich-relationship-profile",
    "crm.tui.review-followup-forecast",
    "crm.tui.normalize-channel-intake",
    "crm.tui.triage-ticket-sla",
    "crm.tui.automate-campaign",
    "crm.tui.publish-landing-page",
    "crm.tui.generate-document",
    "crm.tui.manage-document-library",
    "crm.tui.run-operating-copilot",
    "crm.tui.run-area-copilot",
    "crm.tui.run-work-queue",
    "crm.tui.generate-design-system",
    "crm.tui.generate-readiness-package"
  ]) {
    assert.ok(actionIds.has(actionId), `missing TUI action ${actionId}`);
  }

  for (const action of cockpit.actions) {
    assert.equal(action.palette_group, "CRM");
    assert.equal(action.source_panel, "crm.operational-cockpit");
    assert.equal(action.type, "command");
    assert.equal(action.method, "CLI");
    assert.ok(action.permission, `${action.id} needs a permission`);
    assert.ok(cockpit.permissions.includes(action.permission), `${action.id} permission must be declared by cockpit`);
    assert.ok(action.command_template.length > 0, `${action.id} needs command template`);
    assert.equal(action.command_template[0], "addons");
    assert.ok(action.command_template.includes("--addon"));
    assert.ok(action.command_template.includes("forge.addon.crm"));
    assert.ok(action.command_template.includes("--output"));
    assert.ok(action.keywords.includes("crm"));
    assert.ok(action.payload_schema.length > 0, `${action.id} needs payload schema`);
  }
});

test("CRM scope is workflow-backed across core business areas", () => {
  const workflowIds = new Set(manifest.workflows.map((workflow) => workflow.id));
  for (const workflowId of [
    "crm_entity_lifecycle",
    "crm_relationship_profile_enrichment",
    "crm_pipeline_kanban",
    "crm_proposal_generation",
    "crm_contract_lifecycle",
    "crm_ticket_sla",
    "crm_campaign_lifecycle",
    "crm_project_handoff",
    "crm_document_approval",
    "crm_document_library",
    "crm_ai_copilot_recommendation"
  ]) {
    assert.ok(workflowIds.has(workflowId), `missing workflow ${workflowId}`);
  }
});
