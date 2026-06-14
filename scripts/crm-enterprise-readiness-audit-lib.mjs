import { existsSync, readFileSync } from "node:fs";
import { buildCrmOperatingModel, buildCrmWorkflowPack, REQUIRED_SCOPE } from "./crm-workflow-pack-lib.mjs";

const manifest = JSON.parse(readFileSync(new URL("../addons/forge-crm.json", import.meta.url), "utf8"));
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const versionedPackagePath = `forge-crm-${packageJson.version}.package.json`;
const versionedPackageUrl = new URL(`../${versionedPackagePath}`, import.meta.url);
const ciWorkflowPath = ".github/workflows/ci.yml";
const ciWorkflowUrl = new URL(`../${ciWorkflowPath}`, import.meta.url);

const USER_FACING_DELIVERABLES = [
  {
    id: "relationship_workspace",
    title: "Relationship workspace",
    domain: "relationship",
    surface_id: "crm.relationship-graph",
    workflow_ids: ["crm.lead.lifecycle", "crm.relationship.profile_enrichment", "crm.opportunity.pipeline"]
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
    workflow_ids: ["crm.omnichannel.channel_intake", "crm.omnichannel.center", "crm.ticket.sla"]
  },
  {
    id: "omnichannel_conversation_threads",
    title: "Omnichannel conversation threads",
    domain: "support",
    surface_id: "crm.support-queue",
    workflow_ids: ["crm.omnichannel.message", "crm.omnichannel.center", "crm.ticket.sla"]
  },
  {
    id: "marketing_automation",
    title: "Marketing automation",
    domain: "marketing",
    surface_id: "crm.marketing-calendar",
    workflow_ids: ["crm.marketing.segment_builder", "crm.campaign.lifecycle", "crm.marketing.landing_page", "crm.lead.nurture"]
  },
  {
    id: "document_approvals",
    title: "Document approvals and library",
    domain: "operations",
    surface_id: "crm.document-queue",
    workflow_ids: ["crm.document.approval", "crm.document.library", "crm.proposal.approval", "crm.contract.signature"]
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
    id: "subworkflow_orchestration",
    title: "Subworkflow orchestration",
    domain: "operations",
    surface_id: "crm.system-map",
    workflow_ids: ["crm.subworkflow.orchestration", "crm.enterprise.customer_journey"]
  },
  {
    id: "workflow_automation_designer",
    title: "Workflow automation designer",
    domain: "ai_automation",
    surface_id: "crm.system-map",
    workflow_ids: ["crm.workflow.automation_design"]
  },
  {
    id: "workflow_system_factory_blueprint",
    title: "Workflow-system factory blueprint",
    domain: "operations",
    surface_id: "crm.system-map",
    workflow_ids: ["crm.workflow.factory_blueprint"]
  },
  {
    id: "goal_commission_settlement",
    title: "Goal and commission settlement",
    domain: "commercial",
    surface_id: "crm.commercial-command",
    workflow_ids: ["crm.goal.commission"]
  },
  {
    id: "executive_reporting",
    title: "Executive reporting",
    domain: "operations",
    surface_id: "crm.ai-workbench",
    workflow_ids: ["crm.executive.reporting"]
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

function normalizeRepositoryUrl(value) {
  return String(value || "").replace(/\.git$/, "");
}

function isPublicGithubRepository(value) {
  return /^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(normalizeRepositoryUrl(value));
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

function dependencyRepository(dependency) {
  if (dependency.id === "forge.core.kernel") {
    return manifest.metadata?.core_repository || null;
  }

  const metadataKey = `${dependency.id.replace(/[^a-zA-Z0-9]+/g, "_")}_repository`;
  return manifest.metadata?.[metadataKey] || null;
}

function versionedPackageAudit() {
  const packageExists = existsSync(versionedPackageUrl);
  const addonPackage = packageExists ? JSON.parse(readFileSync(versionedPackageUrl, "utf8")) : null;

  return {
    path: versionedPackagePath,
    exists: packageExists,
    status: addonPackage?.status || "missing",
    package_id: addonPackage?.package_id || null,
    addon_id: addonPackage?.addon_id || null,
    addon_version: addonPackage?.addon_version || null,
    validation_status: addonPackage?.validation?.status || null,
    validation_issue_count: addonPackage?.validation?.issue_count ?? null,
    repository: normalizeRepositoryUrl(addonPackage?.distribution?.repository),
    channel: addonPackage?.distribution?.channel || null,
    install_command: addonPackage?.distribution?.install_command || null,
    package_matches_manifest:
      addonPackage?.package_id === `${manifest.id}@${manifest.version}` &&
      addonPackage?.addon_id === manifest.id &&
      addonPackage?.addon_version === manifest.version
  };
}

function ciDistributionAudit() {
  const workflowExists = existsSync(ciWorkflowUrl);
  const workflow = workflowExists ? readFileSync(ciWorkflowUrl, "utf8") : "";
  const gates = {
    validates_forge_core_checkout: workflow.includes("repository: cardozoarthur/forge-core"),
    validates_tests: workflow.includes("npm test"),
    validates_memory_policy: workflow.includes("forge memory policy"),
    validates_ops_snapshot: workflow.includes("forge ops snapshot"),
    validates_addon_validation: workflow.includes("forge addons validate"),
    validates_addon_catalog: workflow.includes("forge addons catalog"),
    validates_addon_package: workflow.includes("forge addons package"),
    validates_runtime_smoke: workflow.includes("npm run smoke:forge")
  };

  return {
    workflow_path: ciWorkflowPath,
    exists: workflowExists,
    status: workflowExists && Object.values(gates).every(Boolean) ? "distribution_gates_declared" : "distribution_gates_incomplete",
    ...gates
  };
}

function distributionEvidence() {
  const packageRepository = normalizeRepositoryUrl(packageJson.repository?.url);
  const manifestRepository = normalizeRepositoryUrl(manifest.metadata?.crm_repository);
  const packageAudit = versionedPackageAudit();
  const dependencies = asArray(manifest.dependencies).map((dependency) => {
    const repository = normalizeRepositoryUrl(dependencyRepository(dependency));
    const publicRepositoryDeclared = isPublicGithubRepository(repository);
    return {
      id: dependency.id,
      required: dependency.required === true,
      repository,
      public_repository_declared: publicRepositoryDeclared,
      publication_status: publicRepositoryDeclared ? "public_repository_declared" : "missing_public_repository_declaration"
    };
  });
  const allRequiredDependenciesPublic = dependencies
    .filter((dependency) => dependency.required)
    .every((dependency) => dependency.public_repository_declared);
  const ci = ciDistributionAudit();
  const repository = {
    package_repository: packageRepository,
    manifest_repository: manifestRepository,
    public_repository_declared: isPublicGithubRepository(packageRepository),
    package_matches_manifest: packageRepository === manifestRepository
  };
  const localCrmInfrastructureRequired = false;
  const ready =
    repository.public_repository_declared &&
    repository.package_matches_manifest &&
    packageAudit.exists &&
    packageAudit.status === "addon_package_ready" &&
    packageAudit.validation_status === "valid" &&
    packageAudit.validation_issue_count === 0 &&
    packageAudit.package_matches_manifest &&
    packageAudit.repository === packageRepository &&
    packageAudit.channel === "stable" &&
    allRequiredDependenciesPublic &&
    ci.status === "distribution_gates_declared" &&
    localCrmInfrastructureRequired === false;

  return {
    schema_version: "forge.crm_distribution_evidence.v1",
    status: ready ? "ready_for_public_addon_distribution" : "distribution_rework_required",
    local_crm_infrastructure_required: localCrmInfrastructureRequired,
    repository,
    package: packageAudit,
    dependency_publication: {
      dependency_count: dependencies.length,
      all_required_dependencies_public: allRequiredDependenciesPublic,
      dependencies
    },
    ci
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
    subworkflows:
      pack.workflows.some((workflow) => workflow.id === "crm.project.handoff") &&
      pack.workflows.some((workflow) => workflow.id === "crm.subworkflow.orchestration"),
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
  const distribution = distributionEvidence();

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
    distribution_evidence: distribution,
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
      distribution_status: distribution.status,
      complete_scope: pack.summary.complete_scope
    }
  };
}

export function enterpriseReadinessAuditToMarkdown(audit) {
  const objectiveDomains = Object.entries(audit.objective_matrix).map(([domain, matrix]) => {
    const status = matrix.complete ? "complete" : "rework required";
    const missing = matrix.missing.length > 0 ? matrix.missing.join(", ") : "none";
    return `- ${domain}: ${status}; required=${matrix.required.length}; missing=${missing}`;
  });

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
    `- Views: ${audit.summary.view_count}`,
    `- User-facing deliverables ready: ${audit.summary.ready_user_facing_deliverable_count}/${audit.user_facing_deliverables.length}`,
    `- Missing objective items: ${audit.summary.missing_objective_item_count}`,
    `- Complete scope: ${audit.summary.complete_scope}`,
    "",
    "## Addon Evidence",
    "",
    `- Addon: ${audit.addon.id} (${audit.addon.lifecycle})`,
    `- Core dependency: ${audit.addon.core_dependency}`,
    `- Capabilities: ${audit.addon.capability_count}`,
    `- Runtime contracts: ${audit.addon.runtime_contract_count}`,
    `- Artifact types: ${audit.addon.artifact_type_count}`,
    `- Event types: ${audit.addon.event_type_count}`,
    `- Views: ${audit.addon.view_count}`,
    `- Public repository declared: ${audit.repository.public_repository_declared}`,
    "",
    "## Local State Policy",
    "",
    `- State owner: ${audit.local_state_policy.state_owner}`,
    `- External database required: ${audit.local_state_policy.external_database_required}`,
    `- Direct external persistence: ${audit.local_state_policy.direct_external_persistence}`,
    `- Allowed mutation path: ${audit.local_state_policy.allowed_mutation_path}`,
    "",
    "## Objective Domains",
    "",
    ...objectiveDomains,
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
    ...audit.benchmark_tracks.map((track) => `- ${track.title}: ${track.status}`),
    "",
    "## Distribution Evidence",
    "",
    `Distribution status: ${audit.distribution_evidence.status}`,
    `Repository: ${audit.distribution_evidence.repository.package_repository}`,
    `Manifest repository: ${audit.distribution_evidence.repository.manifest_repository}`,
    `Package: ${audit.distribution_evidence.package.path} (${audit.distribution_evidence.package.status})`,
    `Package validation: ${audit.distribution_evidence.package.validation_status}; issues=${audit.distribution_evidence.package.validation_issue_count}`,
    `CI gates: ${audit.distribution_evidence.ci.status}`,
    `Required dependencies public: ${audit.distribution_evidence.dependency_publication.all_required_dependencies_public}`,
    ...audit.distribution_evidence.dependency_publication.dependencies.map(
      (dependency) => `- ${dependency.id}: ${dependency.publication_status}; repository=${dependency.repository}`
    ),
    "",
    "## Forge Core Requirements",
    "",
    ...audit.forge_core_requirements.map(
      (requirement) => `- ${requirement.id}: ${requirement.status}; repository=${requirement.repository}`
    ),
    "",
    "## Core Gap Policy",
    "",
    `Repository: ${audit.core_gap_policy.repository}`,
    `Rule: ${audit.core_gap_policy.rule}`,
    `Gap categories: ${audit.core_gap_policy.gap_categories.join(", ")}`
  ];

  return `${lines.join("\n")}\n`;
}
