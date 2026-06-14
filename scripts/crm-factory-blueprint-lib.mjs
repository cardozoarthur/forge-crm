const CORE_PRIMITIVES = [
  "durable_workflows",
  "graph_execution",
  "approvals",
  "schedules",
  "triggers",
  "memory_scopes",
  "artifact_lineage",
  "observability",
  "executor_policy"
];

const PORTABILITY_GATES = [
  {
    id: "workflow_contracts_declared",
    title: "Workflow contracts are declared",
    owner: "Forge validation",
    required: true
  },
  {
    id: "runtime_contracts_authorized",
    title: "Runtime contracts require authorized executors",
    owner: "Forge validation",
    required: true
  },
  {
    id: "artifact_lineage_declared",
    title: "Artifact lineage is declared",
    owner: "Forge validation",
    required: true
  },
  {
    id: "core_gaps_routed",
    title: "Core primitive gaps route to forge-core",
    owner: "Forge validation",
    required: true
  }
];

const OPERATION_PLAN = [
  {
    id: "collect_workflow_modules",
    title: "Collect workflow modules",
    owner: "forge_workflow_runtime",
    evidence: "crm_workflow_pack"
  },
  {
    id: "map_runtime_contracts",
    title: "Map runtime contracts",
    owner: "forge_addon_registry",
    evidence: "crm.runtime_contracts"
  },
  {
    id: "audit_core_primitives",
    title: "Audit Core primitives",
    owner: "forge-core",
    evidence: "crm_core_gap_report"
  },
  {
    id: "export_blueprint_artifacts",
    title: "Export blueprint artifacts",
    owner: "forge_workflow_runtime",
    evidence: "crm_workflow_factory_blueprint"
  },
  {
    id: "route_core_gaps",
    title: "Route Core gaps",
    owner: "forge-core",
    evidence: "forge-core backlog policy"
  }
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function titleFromId(id) {
  return String(id || "workflow")
    .replace(/^crm[._-]/, "")
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function surfaceIdsForWorkflow(workflowId, surfaces) {
  return asArray(surfaces)
    .filter((surface) => asArray(surface.workflow_ids).includes(workflowId))
    .map((surface) => surface.id || surface.view_id)
    .filter(Boolean);
}

function normalizeModuleTemplate(workflow, index, surfaces) {
  const workflowId = String(workflow.id || `crm.workflow.module-${index + 1}`);
  const runtimeContracts = asArray(workflow.runtime_contracts);
  const artifactTypes = asArray(workflow.artifacts ?? workflow.artifact_types);
  const eventTypes = asArray(workflow.events ?? workflow.event_types);

  return {
    id: `module.${workflowId.replace(/[^a-z0-9]+/gi, "_")}`,
    title: workflow.title || titleFromId(workflowId),
    domain: workflow.domain || "operations",
    workflow_ids: [workflowId],
    workflow_extension_id: workflow.workflow_extension_id || null,
    runtime_contracts: runtimeContracts,
    artifact_types: artifactTypes,
    event_types: eventTypes,
    surface_ids: asArray(workflow.views).length ? asArray(workflow.views) : surfaceIdsForWorkflow(workflowId, surfaces),
    validation_gates: asArray(workflow.validation_gates),
    state_owner: "forge_workflow_runtime",
    reuse_policy: "copy_as_forge_workflow_module_template"
  };
}

export function buildWorkflowFactoryBlueprint(options = {}) {
  const tenantId = options.tenant_id || options.tenant || "default";
  const workflows = asArray(options.workflows);
  const surfaces = asArray(options.surfaces);
  const coreGapPolicy = options.core_gap_policy && typeof options.core_gap_policy === "object" ? options.core_gap_policy : {};
  const repository = coreGapPolicy.repository || "forge-core";
  const categories = asArray(coreGapPolicy.categories).length > 0 ? asArray(coreGapPolicy.categories) : CORE_PRIMITIVES;
  const moduleTemplates = workflows.map((workflow, index) => normalizeModuleTemplate(workflow, index, surfaces));
  const missingRuntimeContracts = moduleTemplates
    .filter((module) => module.runtime_contracts.length === 0)
    .map((module) => module.id);

  return {
    schema_version: "forge.crm_workflow_factory_blueprint.v1",
    tenant_id: tenantId,
    addon_id: "forge.addon.crm",
    target_framework: "Forge Universal Workflow Framework",
    workflow_id: "crm.workflow.factory_blueprint",
    workflow_extension_id: "crm_workflow_factory_blueprint",
    runtime_contract_id: "crm.factory.blueprint_export.executor",
    state_owner: "forge_workflow_runtime",
    local_state_allowed: false,
    module_templates: moduleTemplates,
    core_primitive_mapping: categories.map((primitive) => ({
      primitive,
      repository,
      implementation_boundary: repository === "forge-core" ? "core_runtime_contract" : "external_gap_review",
      consumed_by_addon: true
    })),
    portability_gates: PORTABILITY_GATES,
    operation_plan: OPERATION_PLAN,
    portability_report: {
      state: missingRuntimeContracts.length === 0 && repository === "forge-core" ? "ready_for_reuse" : "rework_required",
      module_count: moduleTemplates.length,
      missing_runtime_contract_modules: missingRuntimeContracts,
      target_repository_for_core_gaps: repository,
      local_state_allowed: false
    },
    core_gap_policy: {
      repository,
      categories,
      rule:
        coreGapPolicy.rule ||
        "Core primitive gaps must be implemented in forge-core before CRM-specific workarounds are accepted."
    }
  };
}
