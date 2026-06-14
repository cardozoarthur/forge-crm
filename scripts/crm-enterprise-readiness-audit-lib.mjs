import { readFileSync } from "node:fs";
import { buildCrmOperatingModel, buildCrmWorkflowPack, REQUIRED_SCOPE } from "./crm-workflow-pack-lib.mjs";

const manifest = JSON.parse(readFileSync(new URL("../addons/forge-crm.json", import.meta.url), "utf8"));
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const USER_FACING_DELIVERABLES = [
  {
    id: "relationship_workspace",
    title: "Relationship workspace",
    domain: "relationship",
    surface_id: "crm.relationship-graph",
    workflow_ids: ["crm.lead.lifecycle", "crm.opportunity.pipeline"]
  },
  {
    id: "commercial_command_center",
    title: "Commercial command center",
    domain: "commercial",
    surface_id: "crm.commercial-command",
    workflow_ids: ["crm.opportunity.pipeline", "crm.proposal.approval", "crm.contract.signature", "crm.followup.forecast", "crm.account.management"]
  },
  {
    id: "support_inbox",
    title: "Support inbox",
    domain: "support",
    surface_id: "crm.support-queue",
    workflow_ids: ["crm.omnichannel.channel_intake", "crm.ticket.sla"]
  },
  {
    id: "marketing_automation",
    title: "Marketing automation",
    domain: "marketing",
    surface_id: "crm.marketing-calendar",
    workflow_ids: ["crm.campaign.lifecycle", "crm.marketing.landing_page", "crm.lead.nurture"]
  },
  {
    id: "document_approvals",
    title: "Document approvals",
    domain: "operations",
    surface_id: "crm.document-queue",
    workflow_ids: ["crm.document.approval", "crm.proposal.approval", "crm.contract.signature"]
  },
  {
    id: "project_handoff",
    title: "Project handoff",
    domain: "operations",
    surface_id: "crm.commercial-command",
    workflow_ids: ["crm.project.handoff"]
  },
  {
    id: "enterprise_customer_journey",
    title: "Enterprise customer journey",
    domain: "operations",
    surface_id: "crm.system-map",
    workflow_ids: ["crm.enterprise.customer_journey"]
  },
  {
    id: "design_system",
    title: "Design system",
    domain: "user_experience",
    surface_id: "crm.design-system",
    workflow_ids: ["crm.design.system"]
  }
];

const FORGE_CORE_REQUIREMENTS = [
  "durable_workflows",
  "interrupt_resume",
  "checkpoints",
  "ownership",
  "waiting_states",
  "approvals",
  "subworkflows",
  "schedules",
  "triggers",
  "graph_execution",
  "memory_scopes",
  "semantic_search",
  "governed_memory_promotion",
  "artifact_lineage",
  "audit_events_logs_costs_metrics",
  "hybrid_tui_web_ui"
];

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function workflowsById(workflows) {
  return new Map(workflows.map((workflow) => [workflow.id, workflow]));
}

function manifestContractIds() {
  return new Set(asArray(manifest.runtime_contracts).map((contract) => contract.id));
}

function manifestArtifactIds() {
  return new Set(asArray(manifest.artifact_types).map((artifact) => artifact.id));
}

function manifestEventIds() {
  return new Set(asArray(manifest.event_types).map((event) => event.id));
}

function workflowEvidence(workflows) {
  return {
    workflow_ids: unique(workflows.map((workflow) => workflow.id)),
    runtime_contracts: unique(workflows.flatMap((workflow) => asArray(workflow.runtime_contracts))),
    artifact_types: unique(workflows.flatMap((workflow) => asArray(workflow.artifacts))),
    event_types: unique(workflows.flatMap((workflow) => asArray(workflow.events))),
    surface_ids: unique(workflows.flatMap((workflow) => asArray(workflow.views))),
    memory_scopes: unique(workflows.flatMap((workflow) => asArray(workflow.memory_scopes))),
    validation_gates: unique(workflows.flatMap((workflow) => asArray(workflow.validation_gates)))
  };
}

function objectiveItemEvidence(item, domain, workflows) {
  const matching = workflows.filter(
    (workflow) =>
      asArray(workflow.object_types).includes(item) ||
      (workflow.domain === domain && asArray(workflow.artifacts).some((artifact) => artifact.includes(item))) ||
      asArray(workflow.events).some((event) => event.includes(item.replace(/_/g, ".")))
  );
  const evidence = workflowEvidence(matching);
  const complete =
    evidence.workflow_ids.length > 0 &&
    evidence.runtime_contracts.length > 0 &&
    evidence.artifact_types.length > 0 &&
    evidence.event_types.length > 0 &&
    evidence.surface_ids.length > 0;

  return {
    id: item,
    status: complete ? "covered_by_forge_workflow" : "missing_forge_workflow_evidence",
    state_owner: "forge_workflow_runtime",
    ...evidence
  };
}

function buildObjectiveMatrix(workflows) {
  return Object.fromEntries(
    Object.entries(REQUIRED_SCOPE).map(([domain, items]) => {
      const matrixItems = items.map((item) => objectiveItemEvidence(item, domain, workflows));
      const missing = matrixItems.filter((item) => item.status !== "covered_by_forge_workflow").map((item) => item.id);
      return [
        domain,
        {
          complete: missing.length === 0,
          required: items,
          missing,
          items: matrixItems
        }
      ];
    })
  );
}

function deliverableEvidence(deliverable, byId, model) {
  const workflows = deliverable.workflow_ids.map((workflowId) => byId.get(workflowId)).filter(Boolean);
  const evidence = workflowEvidence(workflows);
  const surface = Object.values(model.operator_surfaces).find((candidate) => candidate.view_id === deliverable.surface_id);
  const ready =
    workflows.length === deliverable.workflow_ids.length &&
    Boolean(surface) &&
    evidence.runtime_contracts.length > 0 &&
    evidence.artifact_types.length > 0 &&
    evidence.event_types.length > 0 &&
    evidence.validation_gates.length > 0;

  return {
    ...deliverable,
    ready,
    state_owner: "forge_workflow_runtime",
    acceptance: "ready when Forge workflows expose runtime contracts, artifacts, events, validation gates and an operator surface",
    ...evidence
  };
}

function evidenceForWorkflowIds(workflowIds, byId) {
  return workflowEvidence(workflowIds.map((workflowId) => byId.get(workflowId)).filter(Boolean));
}

function buildBenchmarkTracks(byId) {
  const tracks = [
    {
      id: "forge_0_5_runtime_operability",
      title: "Forge v0.5 runtime operability",
      workflow_ids: [
        "crm.lead.lifecycle",
        "crm.opportunity.pipeline",
        "crm.proposal.approval",
        "crm.contract.signature",
        "crm.ticket.sla",
        "crm.document.approval",
        "crm.operational.observability",
        "crm.enterprise.customer_journey",
        "crm.enterprise.readiness"
      ]
    },
    {
      id: "forge_0_6_adaptive_intelligence",
      title: "Forge v0.6 Adaptive Intelligence & Workflow Evolution Runtime",
      workflow_ids: [
        "crm.ai.copilot.recommendation",
        "crm.workflow.evolution",
        "crm.lead.lifecycle",
        "crm.opportunity.pipeline",
        "crm.enterprise.readiness"
      ]
    },
    {
      id: "forge_0_7_universal_workflow_framework",
      title: "Forge v0.7 Universal Workflow Framework",
      workflow_ids: [...byId.keys()]
    }
  ];

  return tracks.map((track) => {
    const evidence = evidenceForWorkflowIds(track.workflow_ids, byId);
    const covered =
      evidence.workflow_ids.length > 0 &&
      evidence.runtime_contracts.length > 0 &&
      evidence.artifact_types.length > 0 &&
      evidence.event_types.length > 0;

    return {
      id: track.id,
      title: track.title,
      status: covered ? "covered_by_current_addon_evidence" : "missing_current_addon_evidence",
      evidence
    };
  });
}

function repositoryAudit() {
  const repositoryUrl = packageJson.repository?.url || "";
  return {
    name: packageJson.name,
    private: packageJson.private === true,
    url: repositoryUrl,
    public_repository_declared: packageJson.private === false && repositoryUrl.includes("github.com/cardozoarthur/forge-crm")
  };
}

function addonAudit() {
  return {
    id: manifest.id,
    name: manifest.name,
    lifecycle: manifest.lifecycle,
    source: manifest.source,
    core_dependency: asArray(manifest.dependencies).find((dependency) => dependency.id === "forge.core.kernel")?.id || null,
    capability_count: asArray(manifest.capabilities).length,
    runtime_contract_count: asArray(manifest.runtime_contracts).length,
    artifact_type_count: asArray(manifest.artifact_types).length,
    event_type_count: asArray(manifest.event_types).length,
    view_count: asArray(manifest.views).length
  };
}

function coreRequirementAudit(pack, model) {
  const contracts = manifestContractIds();
  const artifactTypes = manifestArtifactIds();
  const eventTypes = manifestEventIds();
  const workflowStates = unique(pack.workflows.flatMap((workflow) => asArray(workflow.states)));

  const evidenceByRequirement = {
    durable_workflows: pack.state_model.state_owner === "forge_workflow_runtime",
    interrupt_resume: asArray(manifest.permissions).some((permission) => asArray(permission.actions).includes("resume_workflow")),
    checkpoints: pack.workflows.every((workflow) => asArray(workflow.validation_gates).length > 0),
    ownership: pack.workflows.every((workflow) => workflow.forge_state_owner === "forge_workflow"),
    waiting_states: workflowStates.some((state) => state.includes("wait")),
    approvals: workflowStates.includes("approval_wait") && contracts.has("crm.document.approval.executor"),
    subworkflows: pack.workflows.some((workflow) => workflow.id === "crm.project.handoff"),
    schedules: pack.workflows.some((workflow) => workflow.id === "crm.followup.forecast" || workflow.id === "crm.lead.nurture"),
    triggers: asArray(manifest.event_triggers).length > 0 || asArray(manifest.event_listeners).length > 0,
    graph_execution: model.operator_surfaces.system_map.surface_type === "graph",
    memory_scopes: asArray(manifest.memory_providers).length > 0,
    semantic_search: asArray(manifest.memory_providers).some((provider) => asArray(provider.capabilities).includes("semantic_search")),
    governed_memory_promotion: contracts.has("crm.memory.promotion.executor"),
    artifact_lineage: artifactTypes.has("crm_lineage_map") && contracts.has("crm.observability.inspector.executor"),
    audit_events_logs_costs_metrics: eventTypes.has("crm.audit") && artifactTypes.has("crm_cost_report"),
    hybrid_tui_web_ui: asArray(manifest.views).length > 0 && Boolean(model.operator_surfaces.system_map)
  };

  return FORGE_CORE_REQUIREMENTS.map((requirement) => ({
    id: requirement,
    repository: "forge-core",
    crm_consumes_or_requires_contract: Boolean(evidenceByRequirement[requirement]),
    status: evidenceByRequirement[requirement] ? "crm_consumes_forge_core_contract" : "requires_forge_core_gap_review"
  }));
}

export function buildEnterpriseReadinessAudit(options = {}) {
  const tenantId = options.tenant_id || options.tenant || "default";
  const pack = buildCrmWorkflowPack({ tenant_id: tenantId });
  const model = buildCrmOperatingModel({ tenant_id: tenantId, workflows: pack.workflows, coverage: pack.coverage });
  const byId = workflowsById(pack.workflows);
  const objectiveMatrix = buildObjectiveMatrix(pack.workflows);
  const userFacingDeliverables = USER_FACING_DELIVERABLES.map((deliverable) => deliverableEvidence(deliverable, byId, model));
  const benchmarkTracks = buildBenchmarkTracks(byId);
  const missingObjectiveItemCount = Object.values(objectiveMatrix).reduce((total, domain) => total + domain.missing.length, 0);
  const readyUserFacingDeliverableCount = userFacingDeliverables.filter((deliverable) => deliverable.ready).length;
  const allBenchmarkTracksCovered = benchmarkTracks.every((track) => track.status === "covered_by_current_addon_evidence");
  const addon = addonAudit();

  return {
    schema_version: "forge.crm_enterprise_readiness_audit.v1",
    tenant_id: tenantId,
    generated_from: {
      manifest_schema: manifest.schema_version,
      workflow_pack_schema: pack.schema_version,
      operating_model_schema: model.schema_version
    },
    status:
      missingObjectiveItemCount === 0 &&
      readyUserFacingDeliverableCount === USER_FACING_DELIVERABLES.length &&
      allBenchmarkTracksCovered
        ? "ready_for_forge_runtime_audit"
        : "rework_required",
    repository: repositoryAudit(),
    addon,
    local_state_policy: {
      state_owner: model.state_owner,
      external_database_required: model.external_database_required,
      direct_external_persistence: false,
      allowed_mutation_path: model.mutation_policy.requires_forge_workflow
        ? "Forge workflow command, runtime contract or approved event"
        : "read_only_snapshot"
    },
    objective_matrix: objectiveMatrix,
    user_facing_deliverables: userFacingDeliverables,
    benchmark_tracks: benchmarkTracks,
    forge_core_requirements: coreRequirementAudit(pack, model),
    core_gap_policy: {
      repository: "forge-core",
      rule: pack.core_gap_policy.rule,
      gap_categories: FORGE_CORE_REQUIREMENTS
    },
    summary: {
      workflow_count: pack.summary.workflow_count,
      runtime_contract_count: addon.runtime_contract_count,
      artifact_type_count: addon.artifact_type_count,
      event_type_count: addon.event_type_count,
      view_count: addon.view_count,
      missing_objective_item_count: missingObjectiveItemCount,
      ready_user_facing_deliverable_count: readyUserFacingDeliverableCount,
      benchmark_track_count: benchmarkTracks.length,
      complete_scope: pack.summary.complete_scope
    }
  };
}

export function enterpriseReadinessAuditToMarkdown(audit) {
  const lines = [
    "# Forge CRM Enterprise Readiness Audit",
    "",
    `Tenant: ${audit.tenant_id}`,
    `Status: ${audit.status}`,
    `Repository: ${audit.repository.url}`,
    "",
    "## Summary",
    "",
    `- Workflows: ${audit.summary.workflow_count}`,
    `- Runtime contracts: ${audit.summary.runtime_contract_count}`,
    `- Artifact types: ${audit.summary.artifact_type_count}`,
    `- Event types: ${audit.summary.event_type_count}`,
    `- User-facing deliverables ready: ${audit.summary.ready_user_facing_deliverable_count}/${audit.user_facing_deliverables.length}`,
    `- Missing objective items: ${audit.summary.missing_objective_item_count}`,
    "",
    "## User-Facing Deliverables",
    "",
    ...audit.user_facing_deliverables.map(
      (deliverable) =>
        `- ${deliverable.title}: ${deliverable.ready ? "ready" : "rework required"}; workflows=${deliverable.workflow_ids.join(", ")}; surface=${deliverable.surface_id}`
    ),
    "",
    "## Benchmark Tracks",
    "",
    ...audit.benchmark_tracks.map((track) => `- ${track.title}: ${track.status}`)
  ];

  return `${lines.join("\n")}\n`;
}
