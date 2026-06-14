import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";

const manifest = JSON.parse(await readFile(new URL("../addons/forge-crm.json", import.meta.url), "utf8"));
const webSnapshot = JSON.parse(await readFile(new URL("../web/data/operating-snapshot.json", import.meta.url), "utf8"));
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

test("manifest exposes CRM daily operating cycle as a Forge-owned executor", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.operating.daily_cycle.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_internal_operations");
  assert.equal(contract.workflow_extension_id, "crm_daily_operating_cycle");
  assert.equal(contract.entrypoint, "forge_crm.run_daily_operating_cycle");
  assert.deepEqual(contract.permissions, ["crm.workflow.mutate", "crm.observability.inspect"]);

  for (const input of ["operating_inputs", "operating_policy", "business_day", "tenant_context"]) {
    assert.ok(contract.inputs.includes(input), `missing daily cycle input ${input}`);
  }
  for (const output of ["crm_daily_operating_cycle", "crm_operating_command_brief", "crm_operating_risk_register"]) {
    assert.ok(contract.outputs.includes(output), `missing daily cycle output ${output}`);
  }
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not persist CRM state outside Forge")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("Forge workflow approval")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("sales, marketing, support, documents and handoffs")));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  for (const artifactType of ["crm_daily_operating_cycle", "crm_operating_command_brief", "crm_operating_risk_register"]) {
    assert.ok(artifactTypes.has(artifactType), `missing artifact type ${artifactType}`);
  }

  const eventTypes = new Set(manifest.event_types.map((event) => event.id));
  assert.ok(eventTypes.has("crm.operating"));
});

test("manifest exposes strategic objective audit as a Forge-owned executor", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.strategic.objective_audit.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_observability");
  assert.equal(contract.workflow_extension_id, "crm_strategic_objective_audit");
  assert.equal(contract.entrypoint, "forge_crm.generate_strategic_objective_audit");
  assert.deepEqual(contract.permissions, ["crm.observability.inspect"]);

  for (const input of ["tenant_context", "objective_contract", "evidence_policy"]) {
    assert.ok(contract.inputs.includes(input), `missing strategic audit input ${input}`);
  }
  for (const output of [
    "crm_strategic_objective_audit",
    "crm_requirement_coverage_matrix",
    "crm_support_channel_coverage_report"
  ]) {
    assert.ok(contract.outputs.includes(output), `missing strategic audit output ${output}`);
  }
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not persist CRM state outside Forge")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("explicit strategic requirements")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("forge-core")));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  for (const artifactType of [
    "crm_strategic_objective_audit",
    "crm_requirement_coverage_matrix",
    "crm_support_channel_coverage_report"
  ]) {
    assert.ok(artifactTypes.has(artifactType), `missing strategic audit artifact type ${artifactType}`);
  }

  const eventTypes = new Set(manifest.event_types.map((event) => event.id));
  assert.ok(eventTypes.has("crm.strategic"));
  assert.ok(eventTypes.has("crm.requirement"));
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

test("manifest exposes relationship lifecycle packaging as a Forge-owned executor", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.relationship.lifecycle.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_relationship_management");
  assert.equal(contract.workflow_extension_id, "crm_entity_lifecycle");
  assert.equal(contract.entrypoint, "forge_crm.run_relationship_lifecycle");
  assert.deepEqual(contract.permissions, ["crm.workflow.mutate", "crm.ai.recommend"]);

  for (const input of ["lead", "contact", "company", "opportunity", "lifecycle_policy", "tenant_context"]) {
    assert.ok(contract.inputs.includes(input), `missing lifecycle input ${input}`);
  }
  for (const output of ["crm_relationship_lifecycle", "crm_entity_model", "crm_timeline_snapshot", "crm_ai_recommendation"]) {
    assert.ok(contract.outputs.includes(output), `missing lifecycle output ${output}`);
  }
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not persist CRM state outside Forge")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("approval before conversion")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("lead, contact, company and opportunity")));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  assert.ok(artifactTypes.has("crm_relationship_lifecycle"));

  const eventTypes = new Set(manifest.event_types.map((event) => event.id));
  assert.ok(eventTypes.has("crm.relationship"));
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

test("manifest exposes CRM executive reporting as a Forge-owned analytics executor", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.analytics.executive_report.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_observability");
  assert.equal(contract.workflow_extension_id, "crm_executive_reporting");
  assert.equal(contract.entrypoint, "forge_crm.generate_executive_report");
  assert.deepEqual(contract.permissions, ["crm.observability.inspect", "crm.ai.recommend"]);

  for (const input of [
    "operating_snapshot",
    "workflow_metrics",
    "commercial_metrics",
    "support_metrics",
    "marketing_metrics",
    "risk_register",
    "tenant_context"
  ]) {
    assert.ok(contract.inputs.includes(input), `missing executive reporting input ${input}`);
  }

  for (const output of ["crm_executive_summary", "crm_kpi_dashboard", "crm_business_review_report"]) {
    assert.ok(contract.outputs.includes(output), `missing executive reporting output ${output}`);
  }

  assert.ok(contract.constraints.some((constraint) => constraint.includes("derived from Forge workflow artifacts and events")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not create CRM-local analytics state")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("advisory until Forge workflow approval")));

  const workflowExtensionIds = new Set(manifest.workflows.map((extension) => extension.id));
  assert.ok(workflowExtensionIds.has("crm_executive_reporting"));

  const observabilityCapability = manifest.capabilities.find((capability) => capability.id === "crm_observability");
  assert.ok(observabilityCapability.workflow_extensions.includes("crm_executive_reporting"));
  assert.ok(observabilityCapability.artifact_types.includes("crm_executive_summary"));
  assert.ok(observabilityCapability.artifact_types.includes("crm_kpi_dashboard"));
  assert.ok(observabilityCapability.artifact_types.includes("crm_business_review_report"));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  for (const artifactType of ["crm_executive_summary", "crm_kpi_dashboard", "crm_business_review_report"]) {
    assert.ok(artifactTypes.has(artifactType), `missing artifact type ${artifactType}`);
  }

  const eventTypes = new Set(manifest.event_types.map((event) => event.id));
  assert.ok(eventTypes.has("crm.executive"));
  assert.ok(eventTypes.has("crm.kpi"));
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

test("manifest exposes CRM factory blueprint export as a reusable system contract", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.factory.blueprint_export.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_workflow_factory");
  assert.equal(contract.workflow_extension_id, "crm_workflow_factory_blueprint");
  assert.equal(contract.entrypoint, "forge_crm.export_factory_blueprint");
  assert.deepEqual(contract.permissions, ["crm.observability.inspect", "crm.workflow.mutate"]);

  for (const input of ["workflow_pack", "operating_snapshot", "core_gap_policy", "tenant_context"]) {
    assert.ok(contract.inputs.includes(input), `missing factory blueprint input ${input}`);
  }

  for (const output of [
    "crm_workflow_factory_blueprint",
    "crm_workflow_module_catalog",
    "crm_factory_portability_report"
  ]) {
    assert.ok(contract.outputs.includes(output), `missing factory blueprint output ${output}`);
  }

  assert.ok(contract.constraints.some((constraint) => constraint.includes("reusable workflow-system blueprint")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not create CRM-local state")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("forge-core")));

  const factoryCapability = manifest.capabilities.find((capability) => capability.id === "crm_workflow_factory");
  assert.ok(factoryCapability.workflow_extensions.includes("crm_workflow_factory_blueprint"));
  assert.ok(factoryCapability.artifact_types.includes("crm_workflow_factory_blueprint"));
  assert.ok(factoryCapability.artifact_types.includes("crm_workflow_module_catalog"));
  assert.ok(factoryCapability.artifact_types.includes("crm_factory_portability_report"));

  const workflowExtensionIds = new Set(manifest.workflows.map((extension) => extension.id));
  assert.ok(workflowExtensionIds.has("crm_workflow_factory_blueprint"));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  for (const artifactType of [
    "crm_workflow_factory_blueprint",
    "crm_workflow_module_catalog",
    "crm_factory_portability_report"
  ]) {
    assert.ok(artifactTypes.has(artifactType), `missing artifact type ${artifactType}`);
  }

  const eventTypes = new Set(manifest.event_types.map((event) => event.id));
  assert.ok(eventTypes.has("crm.factory"));
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

test("manifest exposes CRM workflow automation designer as a Forge-owned runtime contract", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.workflow.automation_designer.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_workflow_factory");
  assert.equal(contract.workflow_extension_id, "crm_workflow_automation_designer");
  assert.equal(contract.entrypoint, "forge_crm.design_workflow_automation");
  assert.deepEqual(contract.permissions, ["crm.workflow.mutate", "crm.observability.inspect"]);
  for (const input of ["automation_goal", "trigger_sources", "rule_graph", "validation_policy", "tenant_context"]) {
    assert.ok(contract.inputs.includes(input), `missing workflow automation designer input ${input}`);
  }
  for (const output of ["crm_workflow_automation_spec", "crm_trigger_condition_map", "crm_automation_validation_report"]) {
    assert.ok(contract.outputs.includes(output), `missing workflow automation designer output ${output}`);
  }
  assert.ok(contract.constraints.some((constraint) => constraint.includes("Forge workflows schedules triggers")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not execute or persist automation outside Forge")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("validation evidence and permission gates")));

  const workflowExtensionIds = new Set(manifest.workflows.map((extension) => extension.id));
  assert.ok(workflowExtensionIds.has("crm_workflow_automation_designer"));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  for (const artifactType of ["crm_workflow_automation_spec", "crm_trigger_condition_map", "crm_automation_validation_report"]) {
    assert.ok(artifactTypes.has(artifactType), `missing artifact type ${artifactType}`);
  }

  const eventTypes = new Set(manifest.event_types.map((event) => event.id));
  assert.ok(eventTypes.has("crm.automation"));
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

test("manifest exposes CRM subworkflow orchestration as a Forge-owned runtime contract", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.workflow.subworkflow_orchestrator.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_workflow_factory");
  assert.equal(contract.workflow_extension_id, "crm_subworkflow_orchestration");
  assert.equal(contract.entrypoint, "forge_crm.orchestrate_subworkflows");
  assert.deepEqual(contract.permissions, ["crm.workflow.mutate", "crm.observability.inspect"]);

  for (const input of ["parent_workflow", "subworkflow_bindings", "handoff_policy", "tenant_context"]) {
    assert.ok(contract.inputs.includes(input), `missing subworkflow orchestration input ${input}`);
  }
  for (const output of ["crm_subworkflow_plan", "crm_subworkflow_lineage_map", "crm_subworkflow_validation_report"]) {
    assert.ok(contract.outputs.includes(output), `missing subworkflow orchestration output ${output}`);
  }
  assert.ok(contract.constraints.some((constraint) => constraint.includes("Forge child_subflows")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not execute child workflows outside Forge")));

  const workflowExtensionIds = new Set(manifest.workflows.map((extension) => extension.id));
  assert.ok(workflowExtensionIds.has("crm_subworkflow_orchestration"));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  for (const artifactType of ["crm_subworkflow_plan", "crm_subworkflow_lineage_map", "crm_subworkflow_validation_report"]) {
    assert.ok(artifactTypes.has(artifactType), `missing artifact type ${artifactType}`);
  }

  const eventTypes = new Set(manifest.event_types.map((eventType) => eventType.id));
  assert.ok(eventTypes.has("crm.subworkflow"));
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

test("manifest exposes CRM forecast review as its own Forge-owned executor", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.commercial.forecast_review.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_commercial_operations");
  assert.equal(contract.workflow_extension_id, "crm_forecast_review");
  assert.equal(contract.entrypoint, "forge_crm.review_commercial_forecast");
  assert.deepEqual(contract.permissions, ["crm.workflow.mutate", "crm.observability.inspect"]);

  for (const input of ["forecast_period", "pipeline_snapshot", "goal_targets", "risk_policy", "tenant_context"]) {
    assert.ok(contract.inputs.includes(input), `missing forecast review input ${input}`);
  }
  for (const output of ["crm_forecast_report", "crm_risk_analysis", "crm_task_plan"]) {
    assert.ok(contract.outputs.includes(output), `missing forecast review output ${output}`);
  }
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not persist CRM state outside Forge")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("pipeline snapshots")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not send follow-ups")));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  assert.ok(artifactTypes.has("crm_forecast_report"));
  assert.ok(artifactTypes.has("crm_risk_analysis"));
  assert.ok(artifactTypes.has("crm_task_plan"));

  const capability = manifest.capabilities.find((candidate) => candidate.id === "crm_commercial_operations");
  assert.ok(capability.artifact_types.includes("crm_risk_analysis"));
  assert.ok(capability.artifact_types.includes("crm_task_plan"));
});

test("manifest exposes CRM goal and commission settlement as a Forge-owned executor", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.commercial.goal_commission.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_commercial_operations");
  assert.equal(contract.workflow_extension_id, "crm_goal_commission_settlement");
  assert.equal(contract.entrypoint, "forge_crm.settle_goal_commission");
  assert.deepEqual(contract.permissions, ["crm.workflow.mutate", "crm.observability.inspect"]);

  for (const input of ["period_context", "goal_targets", "revenue_events", "commission_policy", "tenant_context"]) {
    assert.ok(contract.inputs.includes(input), `missing goal commission input ${input}`);
  }
  for (const output of ["crm_goal_scorecard", "crm_commission_statement", "crm_compensation_audit_report"]) {
    assert.ok(contract.outputs.includes(output), `missing goal commission output ${output}`);
  }
  assert.ok(contract.constraints.some((constraint) => constraint.includes("settlement is evidence-only until Forge approval")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not persist CRM state outside Forge")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("revenue events and contract lineage")));

  const capability = manifest.capabilities.find((candidate) => candidate.id === "crm_commercial_operations");
  assert.ok(capability.workflow_extensions.includes("crm_goal_commission_settlement"));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  for (const artifactType of ["crm_goal_scorecard", "crm_commission_statement", "crm_compensation_audit_report"]) {
    assert.ok(artifactTypes.has(artifactType), `missing artifact type ${artifactType}`);
  }

  const eventTypes = new Set(manifest.event_types.map((event) => event.id));
  assert.ok(eventTypes.has("crm.goal"));
  assert.ok(eventTypes.has("crm.commission"));
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

test("manifest routes every non-schedule trigger through a Forge event listener", () => {
  const contractsById = new Map(manifest.runtime_contracts.map((contract) => [contract.id, contract]));

  for (const trigger of manifest.event_triggers.filter((candidate) => candidate.channel !== "crm.schedule")) {
    const listener = manifest.event_listeners.find(
      (candidate) =>
        candidate.event_type === trigger.event_type &&
        candidate.channel === trigger.channel &&
        candidate.adapter_id === trigger.adapter_id &&
        candidate.workflow_extension_id === trigger.workflow_extension_id &&
        candidate.capability_id === trigger.capability_id
    );

    assert.ok(listener, `missing listener for trigger ${trigger.id}`);
    assert.equal(listener.handler, "forge.event_inbox.route");
    assert.ok(contractsById.has(listener.runtime_contract_id), `missing listener runtime contract ${listener.runtime_contract_id}`);
    for (const action of trigger.actions) {
      assert.ok(listener.actions.includes(action), `listener ${listener.id} is missing trigger action ${action}`);
    }
    assert.deepEqual(listener.permissions, trigger.permissions);
  }
});

test("manifest declares Forge schedule triggers and listeners for every workflow cadence", () => {
  const scheduleChannel = manifest.event_channels.find((channel) => channel.id === "crm.schedule");
  assert.ok(scheduleChannel);
  assert.equal(scheduleChannel.transport, "cron");
  assert.ok(scheduleChannel.actions.includes("continue_workflow"));

  const scheduleAdapter = manifest.event_adapters.find((adapter) => adapter.id === "crm.schedule.tick");
  assert.ok(scheduleAdapter);
  assert.equal(scheduleAdapter.transport, "cron");
  assert.equal(scheduleAdapter.direction, "ingress");
  assert.ok(scheduleAdapter.origins.includes("cron"));
  assert.ok(scheduleAdapter.actions.includes("continue_workflow"));

  const triggersById = new Map(manifest.event_triggers.map((trigger) => [trigger.id, trigger]));
  const listenersById = new Map(manifest.event_listeners.map((listener) => [listener.id, listener]));

  for (const cadence of webSnapshot.workflow_cadences.cadences) {
    const trigger = triggersById.get(cadence.trigger_id);
    assert.ok(trigger, `missing schedule trigger ${cadence.trigger_id}`);
    assert.equal(trigger.channel, "crm.schedule");
    assert.equal(trigger.event_type, cadence.event_type);
    assert.ok(scheduleAdapter.event_types.includes(cadence.event_type), `schedule adapter missing event type ${cadence.event_type}`);
    assert.equal(trigger.workflow_extension_id, cadence.workflow_extension_id);
    assert.ok(trigger.actions.includes("continue_workflow"));
    assert.deepEqual(trigger.permissions, [cadence.required_permission]);
    assert.ok(trigger.conditions.includes(`workflow state is ${cadence.due_state}`));

    const listener = listenersById.get(`${cadence.trigger_id}.listener`);
    assert.ok(listener, `missing schedule listener ${cadence.trigger_id}.listener`);
    assert.equal(listener.channel, "crm.schedule");
    assert.equal(listener.event_type, cadence.event_type);
    assert.equal(listener.workflow_extension_id, cadence.workflow_extension_id);
    assert.equal(listener.handler, "forge.schedule.route_due_workflow");
    assert.equal(listener.runtime_contract_id, cadence.contract_id);
    assert.ok(listener.actions.includes("continue_workflow"));
    assert.deepEqual(listener.permissions, [cadence.required_permission]);
  }
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

test("manifest exposes CRM omnichannel center as a Forge-owned executor", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.support.omnichannel_center.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_support_omnichannel");
  assert.equal(contract.workflow_extension_id, "crm_omnichannel_center");
  assert.equal(contract.entrypoint, "forge_crm.unify_omnichannel_center");
  assert.deepEqual(contract.permissions, ["crm.omnichannel.ingest", "crm.workflow.mutate"]);

  for (const input of ["channel_threads", "identity_records", "routing_policy", "tenant_context"]) {
    assert.ok(contract.inputs.includes(input), `missing omnichannel center input ${input}`);
  }
  for (const output of ["crm_omnichannel_center_snapshot", "crm_unified_conversation", "crm_channel_identity_map", "crm_support_queue_snapshot"]) {
    assert.ok(contract.outputs.includes(output), `missing omnichannel center output ${output}`);
  }
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not persist CRM state outside Forge")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("approved channel intake")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("conversation lineage")));

  const workflowExtensionIds = new Set(manifest.workflows.map((extension) => extension.id));
  assert.ok(workflowExtensionIds.has("crm_omnichannel_center"));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  assert.ok(artifactTypes.has("crm_omnichannel_center_snapshot"));
  assert.ok(artifactTypes.has("crm_unified_conversation"));
  assert.ok(artifactTypes.has("crm_channel_identity_map"));

  const eventTypes = new Set(manifest.event_types.map((event) => event.id));
  assert.ok(eventTypes.has("crm.conversation"));
});

test("manifest exposes CRM support reply composition as a Forge-owned executor", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.support.reply_composer.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_support_omnichannel");
  assert.equal(contract.workflow_extension_id, "crm_omnichannel_reply");
  assert.equal(contract.entrypoint, "forge_crm.compose_support_reply");
  assert.deepEqual(contract.permissions, ["crm.omnichannel.ingest", "crm.workflow.mutate"]);

  for (const input of ["conversation_thread", "ticket_context", "reply_policy", "channel_context", "tenant_context"]) {
    assert.ok(contract.inputs.includes(input), `missing reply composer input ${input}`);
  }
  for (const output of ["crm_channel_response", "crm_approval_record", "crm_handoff_record", "crm_support_summary"]) {
    assert.ok(contract.outputs.includes(output), `missing reply composer output ${output}`);
  }
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not send externally")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("Forge approval")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("chat, WhatsApp, Telegram and email")));

  const workflowExtensionIds = new Set(manifest.workflows.map((extension) => extension.id));
  assert.ok(workflowExtensionIds.has("crm_omnichannel_reply"));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  assert.ok(artifactTypes.has("crm_channel_response"));

  const eventTypes = new Set(manifest.event_types.map((event) => event.id));
  assert.ok(eventTypes.has("crm.reply"));

  const action = manifest.views
    .find((view) => view.id === "crm.operational-cockpit")
    .actions.find((candidate) => candidate.id === "crm.tui.compose-support-reply");
  assert.ok(action);
  assert.equal(action.permission, "crm.omnichannel.ingest");
  assert.ok(action.command_template.includes("crm.support.reply_composer.executor"));
  assert.ok(action.requires_confirmation);
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

test("manifest exposes CRM lead nurture as a dedicated Forge-owned executor", () => {
  const contract = manifest.runtime_contracts.find((candidate) => candidate.id === "crm.marketing.lead_nurture.executor");
  assert.ok(contract);
  assert.equal(contract.contract_type, "executor");
  assert.equal(contract.capability_id, "crm_marketing_automation");
  assert.equal(contract.workflow_extension_id, "crm_lead_nurture");
  assert.equal(contract.entrypoint, "forge_crm.run_lead_nurture");
  assert.deepEqual(contract.permissions, ["crm.workflow.mutate", "crm.ai.recommend"]);

  for (const input of ["lead_profile", "segment", "nurture_policy", "engagement_history", "tenant_context"]) {
    assert.ok(contract.inputs.includes(input), `missing lead nurture input ${input}`);
  }
  for (const output of ["crm_nurture_plan", "crm_email", "crm_automation_plan", "crm_ai_recommendation"]) {
    assert.ok(contract.outputs.includes(output), `missing lead nurture output ${output}`);
  }
  assert.ok(contract.constraints.some((constraint) => constraint.includes("does not persist CRM state outside Forge")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("wait steps")));
  assert.ok(contract.constraints.some((constraint) => constraint.includes("approved consent")));

  const artifactTypes = new Set(manifest.artifact_types.map((artifact) => artifact.id));
  assert.ok(artifactTypes.has("crm_nurture_plan"));

  const capability = manifest.capabilities.find((candidate) => candidate.id === "crm_marketing_automation");
  assert.ok(capability.artifact_types.includes("crm_nurture_plan"));

  const listener = manifest.event_listeners.find((candidate) => candidate.id === "crm.schedule.nurture_step_due.listener");
  assert.ok(listener);
  assert.equal(listener.runtime_contract_id, "crm.marketing.lead_nurture.executor");
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
    "crm.tui.classify-lead",
    "crm.tui.enrich-relationship-profile",
    "crm.tui.review-followup-forecast",
    "crm.tui.review-forecast",
    "crm.tui.normalize-channel-intake",
    "crm.tui.ingest-omnichannel-message",
    "crm.tui.run-omnichannel-center",
    "crm.tui.compose-support-reply",
    "crm.tui.triage-ticket-sla",
    "crm.tui.automate-campaign",
    "crm.tui.run-lead-nurture",
    "crm.tui.publish-landing-page",
    "crm.tui.capture-form-submission",
    "crm.tui.generate-document",
    "crm.tui.manage-document-library",
    "crm.tui.run-operating-copilot",
    "crm.tui.run-area-copilot",
    "crm.tui.run-work-queue",
    "crm.tui.orchestrate-subworkflows",
    "crm.tui.design-workflow-automation",
    "crm.tui.generate-design-system",
    "crm.tui.generate-readiness-package"
  ]) {
    assert.ok(actionIds.has(actionId), `missing TUI action ${actionId}`);
  }

  const messageIngestion = cockpit.actions.find((action) => action.id === "crm.tui.ingest-omnichannel-message");
  assert.ok(messageIngestion);
  assert.equal(messageIngestion.permission, "crm.omnichannel.ingest");
  assert.equal(messageIngestion.mutates_workflow, true);
  assert.ok(messageIngestion.command_template.includes("crm.support.omnichannel_message.executor"));
  assert.ok(messageIngestion.keywords.includes("message"));
  assert.ok(messageIngestion.payload_schema.includes("message"));
  assert.ok(messageIngestion.payload_schema.includes("routing_policy"));

  const formCapture = cockpit.actions.find((action) => action.id === "crm.tui.capture-form-submission");
  assert.ok(formCapture);
  assert.equal(formCapture.permission, "crm.workflow.mutate");
  assert.equal(formCapture.mutates_workflow, true);
  assert.ok(formCapture.command_template.includes("crm.marketing.form_capture.executor"));
  assert.ok(formCapture.keywords.includes("form"));
  assert.ok(formCapture.keywords.includes("lead"));
  assert.ok(formCapture.payload_schema.includes("form_submission"));
  assert.ok(formCapture.payload_schema.includes("consent_policy"));

  const leadClassifier = cockpit.actions.find((action) => action.id === "crm.tui.classify-lead");
  assert.ok(leadClassifier);
  assert.equal(leadClassifier.permission, "crm.ai.recommend");
  assert.equal(leadClassifier.mutates_workflow, true);
  assert.equal(leadClassifier.requires_confirmation, false);
  assert.ok(leadClassifier.command_template.includes("crm.lead.classifier.executor"));
  assert.ok(leadClassifier.keywords.includes("lead"));
  assert.ok(leadClassifier.keywords.includes("classification"));
  assert.ok(leadClassifier.payload_schema.includes("lead_profile"));
  assert.ok(leadClassifier.payload_schema.includes("organization_memory"));

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

test("manifest exposes CRM as a Forge Ops Console projection", () => {
  const opsConsole = manifest.views.find((view) => view.id === "crm.ops-console");
  assert.ok(opsConsole);
  assert.equal(opsConsole.surface, "ops_console");
  assert.equal(opsConsole.type, "dashboard");
  assert.equal(opsConsole.component, "ForgeCrmOpsConsole");
  assert.equal(opsConsole.route, "/ops/forge-crm");
  assert.equal(opsConsole.layout.zone, "main");
  assert.equal(opsConsole.layout.width, "full");
  assert.equal(opsConsole.layout.height, "full");
  assert.equal(opsConsole.layout.density, "dense");

  const bindingSources = new Set(opsConsole.data_bindings.map((binding) => binding.source));
  for (const source of [
    "forge.ops.snapshot.operational_digital_twin",
    "forge.ops.snapshot.addon_observability",
    "forge.ops.snapshot.memory_context_governance",
    "forge.ops.snapshot.addon_view_renderers"
  ]) {
    assert.ok(bindingSources.has(source), `missing Ops Console source ${source}`);
  }

  for (const permission of ["crm.observability.inspect", "crm.workflow.mutate", "crm.ai.recommend"]) {
    assert.ok(opsConsole.permissions.includes(permission), `missing Ops Console permission ${permission}`);
  }

  const actionIds = new Set(opsConsole.actions.map((action) => action.id));
  for (const actionId of [
    "crm.ops.refresh-snapshot",
    "crm.ops.inspect-observability",
    "crm.ops.generate-readiness-package",
    "crm.ops.run-enterprise-journey"
  ]) {
    assert.ok(actionIds.has(actionId), `missing Ops Console action ${actionId}`);
  }

  for (const action of opsConsole.actions) {
    assert.equal(action.palette_group, "CRM");
    assert.equal(action.source_panel, "crm.ops-console");
    assert.equal(action.type, "command");
    assert.equal(action.method, "CLI");
    assert.ok(action.permission, `${action.id} needs a permission`);
    assert.ok(opsConsole.permissions.includes(action.permission), `${action.id} permission must be declared by Ops Console`);
    assert.ok(action.command_template.length > 0, `${action.id} needs command template`);
    assert.ok(["ops", "addons"].includes(action.command_template[0]), `${action.id} must route through Forge CLI contracts`);
    assert.ok(action.command_template.includes("--output"));
    assert.ok(action.command_template.includes("json"));
    assert.ok(action.keywords.includes("crm"));
    assert.ok(action.keywords.includes("ops"));
    assert.ok(action.payload_schema.length > 0, `${action.id} needs payload schema`);
    assert.ok(!action.command_template.includes("node"), `${action.id} must not bypass Forge through node`);
    assert.ok(!action.command_template.includes("npm"), `${action.id} must not bypass Forge through npm`);
    if (action.mutates_workflow) {
      assert.ok(action.requires_confirmation, `${action.id} mutates workflow and needs confirmation`);
    }
  }

  const capabilityIds = new Map(manifest.capabilities.map((capability) => [capability.id, capability]));
  for (const capabilityId of ["crm_workflow_factory", "crm_user_experience", "crm_observability"]) {
    assert.ok(capabilityIds.get(capabilityId).view_ids.includes("crm.ops-console"));
  }
});

test("manifest keeps Forge TUI cockpit actions in parity with web CRM command contracts", () => {
  const cockpit = manifest.views.find((view) => view.id === "crm.operational-cockpit");
  assert.ok(cockpit);

  const tuiContracts = new Set(
    cockpit.actions
      .map((action) => action.command_template[action.command_template.indexOf("--contract") + 1])
      .filter(Boolean)
  );

  const missingContracts = webSnapshot.actions
    .map((action) => action.contract_id)
    .filter((contractId) => !tuiContracts.has(contractId));

  assert.deepEqual(missingContracts, []);
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
    "crm_omnichannel_center",
    "crm_omnichannel_reply",
    "crm_subworkflow_orchestration",
    "crm_workflow_automation_designer",
    "crm_ai_copilot_recommendation"
  ]) {
    assert.ok(workflowIds.has(workflowId), `missing workflow ${workflowId}`);
  }
});
