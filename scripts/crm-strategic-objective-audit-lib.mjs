import { existsSync, readFileSync } from "node:fs";
import { buildCrmOperatingModel, buildCrmWorkflowPack } from "./crm-workflow-pack-lib.mjs";

const manifest = JSON.parse(readFileSync(new URL("../addons/forge-crm.json", import.meta.url), "utf8"));
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const memoryGovernancePath = new URL("../.forge/memory-governance.json", import.meta.url);
const versionedPackagePath = `forge-crm-${packageJson.version}.package.json`;
const versionedPackageUrl = new URL(`../${versionedPackagePath}`, import.meta.url);

const DOMAIN_REQUIREMENTS = {
  relationship: [
    ["leads", "Leads", ["crm.lead.lifecycle"]],
    ["contacts", "Contacts", ["crm.relationship.profile_enrichment"]],
    ["companies", "Companies", ["crm.relationship.profile_enrichment"]],
    ["opportunities", "Opportunities", ["crm.opportunity.pipeline"]],
    ["pipeline_kanban", "Pipeline Kanban", ["crm.opportunity.pipeline"]],
    ["multiple_funnels", "Multiple funnels", ["crm.opportunity.pipeline"]],
    ["complete_history", "Complete history", ["crm.lead.lifecycle", "crm.relationship.profile_enrichment"]],
    ["unified_timeline", "Unified timeline", ["crm.lead.lifecycle", "crm.relationship.profile_enrichment"]]
  ],
  commercial: [
    ["proposals", "Proposals", ["crm.proposal.approval"]],
    ["contracts", "Contracts", ["crm.contract.signature"]],
    ["signatures", "Signatures", ["crm.contract.signature"]],
    ["automatic_followups", "Automatic follow-ups", ["crm.followup.forecast", "crm.lead.nurture"]],
    ["forecast", "Forecast", ["crm.followup.forecast", "crm.forecast.review"]],
    ["goals", "Goals", ["crm.goal.commission"]],
    ["commissions", "Commissions", ["crm.goal.commission"]],
    ["account_management", "Account management", ["crm.account.management", "crm.customer_success.plan"]]
  ],
  marketing: [
    ["campaigns", "Campaigns", ["crm.campaign.lifecycle"]],
    ["segmentation", "Segmentation", ["crm.marketing.segment_builder"]],
    ["automations", "Automations", ["crm.campaign.lifecycle", "crm.workflow.automation_design", "crm.workflow.automation_execution"]],
    ["landing_pages", "Landing pages", ["crm.marketing.landing_page"]],
    ["forms", "Forms", ["crm.marketing.landing_page"]],
    ["lead_nurturing", "Lead nurturing", ["crm.lead.nurture"]]
  ],
  operations: [
    ["projects", "Projects", ["crm.project.handoff"]],
    ["tasks", "Tasks", ["crm.project.handoff", "crm.work.queue.orchestration"]],
    ["approvals", "Approvals", ["crm.document.approval", "crm.approval.governance"]],
    ["documents", "Documents", ["crm.document.approval", "crm.document.library"]],
    ["internal_flows", "Internal flows", ["crm.work.queue.orchestration", "crm.daily.operating_cycle"]],
    ["internal_collaboration", "Internal collaboration", ["crm.internal.collaboration"]],
    ["team_handoffs", "Team handoffs", ["crm.project.handoff", "crm.enterprise.customer_journey"]],
    ["daily_operating_cycle", "Daily operating cycle", ["crm.daily.operating_cycle"]]
  ],
  ai_automation: [
    ["lead_classification", "Automatic lead classification", ["crm.ai.copilot.recommendation", "crm.lead.lifecycle"]],
    ["opportunity_prioritization", "Opportunity prioritization", ["crm.ai.copilot.recommendation", "crm.opportunity.pipeline"]],
    ["proposal_generation", "Proposal generation", ["crm.proposal.approval", "crm.ai.copilot.recommendation"]],
    ["document_generation", "Document generation", ["crm.proposal.approval", "crm.contract.signature"]],
    ["executive_summaries", "Executive summaries", ["crm.executive.reporting", "crm.ai.copilot.recommendation"]],
    ["risk_analysis", "Risk analysis", ["crm.ai.copilot.recommendation", "crm.executive.reporting", "crm.daily.operating_cycle"]],
    ["next_step_recommendations", "Next-step recommendations", ["crm.ai.copilot.recommendation"]],
    ["workflow_automations", "Workflow automations", ["crm.workflow.automation_design", "crm.workflow.automation_execution"]],
    ["specialized_copilots", "Specialized area copilots", ["crm.ai.copilot.recommendation"]]
  ]
};

const SUPPORT_WORKFLOW_IDS = [
  "crm.omnichannel.channel_intake",
  "crm.omnichannel.message",
  "crm.ticket.sla",
  "crm.omnichannel.center",
  "crm.omnichannel.reply"
];

const REQUIRED_SUPPORT_CHANNELS = ["chat", "email", "telegram", "whatsapp"];
const REQUIRED_ARTIFACTS = [
  "crm_document",
  "crm_proposal",
  "crm_contract",
  "crm_report",
  "crm_presentation",
  "crm_email",
  "crm_campaign"
];
const REQUIRED_OBSERVABILITY_ARTIFACTS = ["crm_audit_report", "crm_lineage_map", "crm_cost_report", "crm_metric_snapshot"];

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeRepositoryUrl(value) {
  return String(value || "").replace(/\.git$/, "");
}

function workflowsById(workflows) {
  return new Map(workflows.map((workflow) => [workflow.id, workflow]));
}

function manifestContracts() {
  return new Set(asArray(manifest.runtime_contracts).map((contract) => contract.id));
}

function manifestArtifacts() {
  return new Set(asArray(manifest.artifact_types).map((artifact) => artifact.id));
}

function manifestEvents() {
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

function requirementStatus(covered) {
  return covered ? "covered_by_forge_evidence" : "missing_forge_evidence";
}

function requirementFromWorkflows({ id, title, workflow_ids }, byId) {
  const workflows = workflow_ids.map((workflowId) => byId.get(workflowId)).filter(Boolean);
  const evidence = workflowEvidence(workflows);
  const covered =
    workflows.length === workflow_ids.length &&
    evidence.runtime_contracts.length > 0 &&
    evidence.artifact_types.length > 0 &&
    evidence.event_types.length > 0 &&
    evidence.surface_ids.length > 0;

  return {
    id,
    title,
    status: requirementStatus(covered),
    state_owner: "forge_workflow_runtime",
    ...evidence
  };
}

function section(id, title, requirements) {
  const missing = requirements.filter((requirement) => requirement.status !== "covered_by_forge_evidence").map((requirement) => requirement.id);
  return {
    id,
    title,
    status: missing.length === 0 ? "covered_by_current_addon_evidence" : "rework_required",
    missing,
    requirements
  };
}

function buildWorkflowDomainSection(id, title, byId) {
  return section(
    id,
    title,
    DOMAIN_REQUIREMENTS[id].map(([requirementId, requirementTitle, workflowIds]) =>
      requirementFromWorkflows({ id: requirementId, title: requirementTitle, workflow_ids: workflowIds }, byId)
    )
  );
}

function packageEvidence() {
  const exists = existsSync(versionedPackageUrl);
  const addonPackage = exists ? JSON.parse(readFileSync(versionedPackageUrl, "utf8")) : null;
  return {
    path: versionedPackagePath,
    exists,
    status: addonPackage?.status || "missing",
    package_id: addonPackage?.package_id || null,
    repository: normalizeRepositoryUrl(addonPackage?.distribution?.repository),
    validation_status: addonPackage?.validation?.status || null,
    validation_issue_count: addonPackage?.validation?.issue_count ?? null
  };
}

function buildPrincipleSection(pack, model) {
  const repository = normalizeRepositoryUrl(packageJson.repository?.url);
  const addonPackage = packageEvidence();
  const addonPublic =
    manifest.id === "forge.addon.crm" &&
    manifest.lifecycle === "enabled" &&
    packageJson.private === false &&
    repository === "https://github.com/cardozoarthur/forge-crm" &&
    addonPackage.status === "addon_package_ready" &&
    addonPackage.validation_status === "valid";
  const forgeNative =
    model.state_owner === "forge_workflow_runtime" &&
    model.external_database_required === false &&
    model.mutation_policy?.requires_forge_workflow === true &&
    pack.workflows.every((workflow) => workflow.mutation_policy?.direct_external_persistence === false);
  const coreGapPolicy = String(pack.core_gap_policy?.rule || "").includes("forge-core");

  return section("principle", "Principle", [
    {
      id: "public_reference_addon",
      title: "Public reference Addon",
      status: requirementStatus(addonPublic),
      addon_id: manifest.id,
      repository,
      package: addonPackage,
      metadata: manifest.metadata
    },
    {
      id: "not_separate_system",
      title: "CRM is not separate from Forge",
      status: requirementStatus(forgeNative),
      state_owner: model.state_owner,
      external_database_required: model.external_database_required,
      direct_external_persistence: pack.workflows.some((workflow) => workflow.mutation_policy?.direct_external_persistence !== false),
      allowed_mutation_path: model.mutation_policy?.requires_forge_workflow
        ? "Forge workflow command, runtime contract or approved event"
        : "not_forge_owned"
    },
    {
      id: "core_gap_policy",
      title: "Core limitations route to forge-core",
      status: requirementStatus(coreGapPolicy),
      target_repository: "forge-core",
      rule: pack.core_gap_policy?.rule || null
    }
  ]);
}

function buildSupportSection(byId) {
  const base = SUPPORT_WORKFLOW_IDS.map((workflowId) => byId.get(workflowId)).filter(Boolean);
  const evidence = workflowEvidence(base);
  const integrationIds = unique(
    asArray(manifest.integrations)
      .filter((integration) => REQUIRED_SUPPORT_CHANNELS.includes(integration.id.replace(/^crm\./, "")))
      .map((integration) => integration.id)
  );
  const eventAdapterOrigins = unique(
    asArray(manifest.event_adapters).flatMap((adapter) =>
      asArray(adapter.origins).filter((origin) => REQUIRED_SUPPORT_CHANNELS.includes(origin))
    )
  );
  const missingChannels = REQUIRED_SUPPORT_CHANNELS.filter(
    (channel) => !integrationIds.includes(`crm.${channel}`) || !eventAdapterOrigins.includes(channel)
  );
  const channelsCovered =
    missingChannels.length === 0 &&
    evidence.workflow_ids.length === SUPPORT_WORKFLOW_IDS.length &&
    evidence.runtime_contracts.length > 0 &&
    evidence.artifact_types.length > 0 &&
    evidence.event_types.length > 0 &&
    evidence.surface_ids.includes("crm.support-queue");

  const requirements = [
    requirementFromWorkflows({ id: "tickets", title: "Tickets", workflow_ids: ["crm.ticket.sla"] }, byId),
    requirementFromWorkflows({ id: "sla", title: "SLA", workflow_ids: ["crm.ticket.sla"] }, byId),
    {
      id: "support_channels",
      title: "Chat, WhatsApp, Telegram and email",
      status: requirementStatus(channelsCovered),
      state_owner: "forge_workflow_runtime",
      required_channels: [...REQUIRED_SUPPORT_CHANNELS],
      missing_channels: missingChannels,
      integration_ids: integrationIds,
      event_adapter_origins: eventAdapterOrigins,
      ...evidence
    },
    requirementFromWorkflows({ id: "omnichannel_center", title: "Central omnichannel", workflow_ids: ["crm.omnichannel.center"] }, byId)
  ];

  return section("support", "Support", requirements);
}

function projectMemoryGovernance() {
  return existsSync(memoryGovernancePath) ? JSON.parse(readFileSync(memoryGovernancePath, "utf8")) : { status: "missing" };
}

function buildPlatformSection(pack, model) {
  const contracts = manifestContracts();
  const artifacts = manifestArtifacts();
  const events = manifestEvents();
  const memoryProviders = asArray(manifest.memory_providers);
  const scopes = unique(memoryProviders.flatMap((provider) => asArray(provider.scopes)));
  const missingScopes = ["global", "organization", "processing", "project"].filter((scope) => !scopes.includes(scope));
  const semanticSearchEnabled = memoryProviders.every((provider) => asArray(provider.capabilities).includes("semantic_search"));
  const governance = projectMemoryGovernance();
  const workflowStates = unique(pack.workflows.flatMap((workflow) => asArray(workflow.states)));
  const runtimeCovered =
    pack.state_model?.state_owner === "forge_workflow_runtime" &&
    asArray(manifest.permissions).some((permission) => asArray(permission.actions).includes("resume_workflow")) &&
    workflowStates.some((state) => state.includes("wait")) &&
    workflowStates.includes("approval_wait") &&
    pack.workflows.some((workflow) => workflow.id === "crm.subworkflow.orchestration") &&
    asArray(manifest.event_listeners).length > 0 &&
    model.operator_surfaces.system_map?.surface_type === "graph";
  const artifactTypes = REQUIRED_ARTIFACTS.filter((artifact) => artifacts.has(artifact));
  const observabilityArtifacts = REQUIRED_OBSERVABILITY_ARTIFACTS.filter((artifact) => artifacts.has(artifact));

  return section("forge_platform", "Forge Platform", [
    {
      id: "runtime_primitives",
      title: "Durable workflow runtime primitives",
      status: requirementStatus(runtimeCovered),
      state_owner: pack.state_model?.state_owner,
      workflow_count: pack.summary?.workflow_count,
      has_resume_permission: asArray(manifest.permissions).some((permission) => asArray(permission.actions).includes("resume_workflow")),
      has_waiting_states: workflowStates.some((state) => state.includes("wait")),
      has_approvals: workflowStates.includes("approval_wait"),
      has_subworkflows: pack.workflows.some((workflow) => workflow.id === "crm.subworkflow.orchestration"),
      has_schedules: asArray(manifest.event_triggers).some((trigger) => trigger.channel === "crm.schedule"),
      has_triggers: asArray(manifest.event_listeners).length > 0,
      graph_surface_id: model.operator_surfaces.system_map?.view_id
    },
    {
      id: "memory_scopes_and_semantic_search",
      title: "Memory scopes and governed semantic search",
      status: requirementStatus(
        missingScopes.length === 0 &&
          semanticSearchEnabled &&
          contracts.has("crm.memory.promotion.executor") &&
          governance.status === "memory_governance_configured"
      ),
      required_scopes: ["global", "organization", "processing", "project"],
      available_scopes: scopes,
      missing_scopes: missingScopes,
      semantic_search_enabled: semanticSearchEnabled,
      governed_promotion_contract: contracts.has("crm.memory.promotion.executor") ? "crm.memory.promotion.executor" : null,
      project_governance: governance
    },
    {
      id: "artifact_portfolio",
      title: "Documents, proposals, contracts, reports, presentations, emails and campaigns",
      status: requirementStatus(REQUIRED_ARTIFACTS.every((artifact) => artifacts.has(artifact))),
      required_artifact_types: REQUIRED_ARTIFACTS,
      artifact_types: artifactTypes,
      missing_artifact_types: REQUIRED_ARTIFACTS.filter((artifact) => !artifacts.has(artifact))
    },
    {
      id: "observability_stack",
      title: "Audit, lineage, costs, events, logs, metrics and state inspection",
      status: requirementStatus(
        REQUIRED_OBSERVABILITY_ARTIFACTS.every((artifact) => artifacts.has(artifact)) &&
          events.has("crm.audit") &&
          contracts.has("crm.observability.inspector.executor")
      ),
      runtime_contracts: contracts.has("crm.observability.inspector.executor") ? ["crm.observability.inspector.executor"] : [],
      artifact_types: observabilityArtifacts,
      missing_artifact_types: REQUIRED_OBSERVABILITY_ARTIFACTS.filter((artifact) => !artifacts.has(artifact)),
      event_types: unique(
        pack.workflows
          .filter((workflow) => workflow.id === "crm.operational.observability")
          .flatMap((workflow) => asArray(workflow.events))
      ),
      manifest_event_types: events.has("crm.audit") ? ["crm.audit"] : []
    }
  ]);
}

function buildUiSection(snapshot) {
  const viewIds = new Set(asArray(manifest.views).map((view) => view.id));
  const hybridCovered =
    viewIds.has("crm.operational-cockpit") &&
    snapshot.ui_contract?.operational_center === "forge_tui" &&
    snapshot.ui_contract?.web_experience === "business_user_workbench" &&
    snapshot.ui_contract?.workflow_visualization === "n8n_inspired_graph" &&
    snapshot.ui_contract?.knowledge_graph === "obsidian_inspired_relationships" &&
    snapshot.ui_contract?.document_management === "paperclip_inspired_artifact_queue" &&
    snapshot.ui_contract?.design_system === "penpot_open_design_inspired_tokens" &&
    snapshot.local_state_policy?.direct_browser_persistence === false;

  return section("ui", "UI", [
    {
      id: "hybrid_ui_experience",
      title: "Forge TUI plus modern business web surface",
      status: requirementStatus(hybridCovered),
      tui_view_id: viewIds.has("crm.operational-cockpit") ? "crm.operational-cockpit" : null,
      web_entrypoint: "web/index.html",
      visual_workflow_style: snapshot.ui_contract?.workflow_visualization || null,
      knowledge_style: snapshot.ui_contract?.knowledge_graph || null,
      document_style: snapshot.ui_contract?.document_management || null,
      design_system_style: snapshot.ui_contract?.design_system || null,
      direct_browser_persistence: snapshot.local_state_policy?.direct_browser_persistence
    }
  ]);
}

function buildStrategicSnapshotEvidence() {
  return {
    schema_version: "forge.crm_web_app_snapshot.v1",
    ui_contract: {
      operational_center: "forge_tui",
      web_experience: "business_user_workbench",
      workflow_visualization: "n8n_inspired_graph",
      knowledge_graph: "obsidian_inspired_relationships",
      document_management: "paperclip_inspired_artifact_queue",
      design_system: "penpot_open_design_inspired_tokens"
    },
    local_state_policy: {
      direct_browser_persistence: false
    }
  };
}

export function buildCrmStrategicObjectiveAudit(options = {}) {
  const tenantId = options.tenant_id || options.tenant || "default";
  const pack = buildCrmWorkflowPack({ tenant_id: tenantId });
  const model = buildCrmOperatingModel({ tenant_id: tenantId, workflows: pack.workflows, coverage: pack.coverage });
  const snapshot = options.snapshot || buildStrategicSnapshotEvidence();
  const byId = workflowsById(pack.workflows);
  const sections = [
    buildPrincipleSection(pack, model),
    buildWorkflowDomainSection("relationship", "Relationship", byId),
    buildWorkflowDomainSection("commercial", "Commercial", byId),
    buildSupportSection(byId),
    buildWorkflowDomainSection("marketing", "Marketing", byId),
    buildWorkflowDomainSection("operations", "Operations", byId),
    buildWorkflowDomainSection("ai_automation", "AI and Automation", byId),
    buildPlatformSection(pack, model),
    buildUiSection(snapshot)
  ];
  const missingRequirementCount = sections.reduce((total, auditSection) => total + auditSection.missing.length, 0);

  return {
    schema_version: "forge.crm_strategic_objective_audit.v1",
    tenant_id: tenantId,
    generated_from: {
      manifest_schema: manifest.schema_version,
      workflow_pack_schema: pack.schema_version,
      operating_model_schema: model.schema_version,
      web_snapshot_schema: snapshot.schema_version
    },
    status: missingRequirementCount === 0 ? "covered_by_current_addon_evidence" : "rework_required",
    sections,
    summary: {
      section_count: sections.length,
      requirement_count: sections.reduce((total, auditSection) => total + auditSection.requirements.length, 0),
      missing_requirement_count: missingRequirementCount,
      workflow_count: pack.summary.workflow_count,
      runtime_contract_count: asArray(manifest.runtime_contracts).length,
      artifact_type_count: asArray(manifest.artifact_types).length,
      event_type_count: asArray(manifest.event_types).length,
      view_count: asArray(manifest.views).length
    }
  };
}

export function crmStrategicObjectiveAuditToMarkdown(audit) {
  const lines = [
    "# Forge CRM Strategic Objective Audit",
    "",
    `Tenant: ${audit.tenant_id}`,
    `Status: ${audit.status}`,
    "",
    "## Summary",
    "",
    `- Sections: ${audit.summary.section_count}`,
    `- Requirements: ${audit.summary.requirement_count}`,
    `- Missing requirements: ${audit.summary.missing_requirement_count}`,
    `- Workflows: ${audit.summary.workflow_count}`,
    `- Runtime contracts: ${audit.summary.runtime_contract_count}`,
    `- Artifact types: ${audit.summary.artifact_type_count}`,
    `- Event types: ${audit.summary.event_type_count}`,
    `- Views: ${audit.summary.view_count}`,
    "",
    "## Sections",
    ""
  ];

  for (const auditSection of audit.sections) {
    lines.push(`### ${auditSection.title}`);
    lines.push("");
    lines.push(`${auditSection.title}: ${auditSection.status}`);
    lines.push(`Missing: ${auditSection.missing.length > 0 ? auditSection.missing.join(", ") : "none"}`);
    lines.push("");
    for (const requirement of auditSection.requirements) {
      const workflows = asArray(requirement.workflow_ids).length > 0 ? `; workflows=${requirement.workflow_ids.join(", ")}` : "";
      const contracts = asArray(requirement.runtime_contracts).length > 0 ? `; contracts=${requirement.runtime_contracts.join(", ")}` : "";
      lines.push(`- ${requirement.id}: ${requirement.status}${workflows}${contracts}`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}`;
}
