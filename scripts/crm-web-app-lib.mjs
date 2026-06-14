import { buildCrmOperatingModel, buildCrmWorkflowPack } from "./crm-workflow-pack-lib.mjs";

const SURFACE_ROUTES = {
  "crm.system-map": "/crm/system",
  "crm.relationship-graph": "/crm/relationships",
  "crm.pipeline-kanban": "/crm/pipeline",
  "crm.commercial-command": "/crm/commercial",
  "crm.support-queue": "/crm/support",
  "crm.marketing-calendar": "/crm/marketing",
  "crm.document-queue": "/crm/documents",
  "crm.ai-workbench": "/crm/ai"
};

const SURFACE_PERMISSIONS = {
  "crm.system-map": "crm.workflow.mutate",
  "crm.relationship-graph": "crm.ai.recommend",
  "crm.pipeline-kanban": "crm.workflow.mutate",
  "crm.commercial-command": "crm.document.generate",
  "crm.support-queue": "crm.omnichannel.ingest",
  "crm.marketing-calendar": "crm.workflow.mutate",
  "crm.document-queue": "crm.document.generate",
  "crm.ai-workbench": "crm.ai.recommend"
};

const WORKFLOW_EDGES = [
  ["crm.lead.lifecycle", "crm.opportunity.pipeline", "converted lead starts opportunity workflow"],
  ["crm.opportunity.pipeline", "crm.proposal.approval", "approved offer terms request proposal artifact"],
  ["crm.proposal.approval", "crm.contract.signature", "approved proposal starts contract workflow"],
  ["crm.contract.signature", "crm.followup.forecast", "signed contract updates forecast and commission evidence"],
  ["crm.campaign.lifecycle", "crm.lead.nurture", "approved campaign schedules nurture workflow"],
  ["crm.lead.nurture", "crm.lead.lifecycle", "response classification updates lead lifecycle"],
  ["crm.ticket.sla", "crm.project.handoff", "resolved support issue can create internal handoff"],
  ["crm.project.handoff", "crm.document.approval", "handoff deliverables enter document queue"],
  ["crm.document.approval", "crm.proposal.approval", "document validation gates proposal delivery"],
  ["crm.ai.copilot.recommendation", "crm.opportunity.pipeline", "approved recommendation mutates pipeline state"]
];

const DESIGN_TOKENS = {
  color: {
    background: "#f6f7f4",
    panel: "#ffffff",
    ink: "#1d2428",
    muted: "#607078",
    line: "#d8dfd8",
    accent: "#126c55",
    attention: "#9b4d19",
    info: "#285f9d",
    risk: "#a53c3c"
  },
  radius: {
    panel: "8px",
    control: "6px"
  },
  density: "compact_operational"
};

function slug(value, fallback = "tenant") {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function unique(items) {
  return [...new Set(items)];
}

function workflowNodes(workflows) {
  return workflows.map((workflow) => ({
    id: workflow.id,
    title: workflow.title,
    domain: workflow.domain,
    state_count: workflow.states.length,
    states: workflow.states,
    wait_states: workflow.states.filter((state) => state.includes("wait")),
    runtime_contracts: workflow.runtime_contracts,
    artifact_types: workflow.artifacts,
    event_types: workflow.events,
    surface_ids: workflow.views,
    validation_gates: workflow.validation_gates
  }));
}

function workflowEdges(workflowIds) {
  return WORKFLOW_EDGES.filter(([from, to]) => workflowIds.has(from) && workflowIds.has(to)).map(([from, to, reason]) => ({
    from,
    to,
    reason,
    state_owner: "forge_workflow_runtime"
  }));
}

function knowledgeGraph() {
  return {
    nodes: [
      { id: "entity.company", label: "Company", kind: "company", source_workflow: "crm.lead.lifecycle" },
      { id: "entity.contact", label: "Contact", kind: "contact", source_workflow: "crm.lead.lifecycle" },
      { id: "entity.lead", label: "Lead", kind: "lead", source_workflow: "crm.lead.lifecycle" },
      { id: "entity.opportunity", label: "Opportunity", kind: "opportunity", source_workflow: "crm.opportunity.pipeline" },
      { id: "entity.ticket", label: "Ticket", kind: "ticket", source_workflow: "crm.ticket.sla" },
      { id: "artifact.proposal", label: "Proposal", kind: "proposal", source_workflow: "crm.proposal.approval" },
      { id: "artifact.contract", label: "Contract", kind: "contract", source_workflow: "crm.contract.signature" },
      { id: "artifact.campaign", label: "Campaign", kind: "campaign", source_workflow: "crm.campaign.lifecycle" },
      { id: "artifact.recommendation", label: "AI recommendation", kind: "ai_recommendation", source_workflow: "crm.ai.copilot.recommendation" }
    ],
    edges: [
      ["entity.company", "entity.contact", "employs"],
      ["entity.company", "entity.opportunity", "owns commercial motion"],
      ["entity.lead", "entity.opportunity", "converts into"],
      ["entity.opportunity", "artifact.proposal", "requests"],
      ["artifact.proposal", "artifact.contract", "approved into"],
      ["entity.ticket", "entity.company", "belongs to account"],
      ["artifact.campaign", "entity.lead", "nurtures"],
      ["artifact.recommendation", "entity.opportunity", "suggests next state"]
    ].map(([from, to, relation]) => ({ from, to, relation, source: "forge_workflow_lineage" }))
  };
}

function documentQueue(workflows) {
  const documentWorkflows = workflows.filter((workflow) =>
    workflow.views.includes("crm.document-queue") || workflow.artifacts.some((artifact) => artifact.includes("document"))
  );
  const states = unique(documentWorkflows.flatMap((workflow) => workflow.states));
  const laneOrder = ["draft_requested", "draft_generated", "submitted", "validation", "approval_wait", "approved", "rework_required", "delivered", "archived", "signature_wait"];
  const lanes = laneOrder.filter((lane) => states.includes(lane)).map((lane) => ({
    id: lane,
    title: lane.replace(/_/g, " "),
    workflow_ids: documentWorkflows.filter((workflow) => workflow.states.includes(lane)).map((workflow) => workflow.id)
  }));

  return {
    state_source: "forge.workflow.artifacts",
    lanes,
    artifact_types: unique(documentWorkflows.flatMap((workflow) => workflow.artifacts)).sort(),
    approval_required: true,
    rework_policy: "failed validation returns the owning workflow to work with a reason"
  };
}

function actions() {
  return [
    {
      id: "crm.refresh-operating-snapshot",
      label: "Refresh operating snapshot",
      surface_id: "crm.system-map",
      contract_id: "crm.operating.snapshot.executor",
      requires_permission: "crm.workflow.mutate",
      mutates_workflow: true,
      command_template: [
        "forge",
        "addons",
        "execute-executor",
        "--addon",
        "forge.addon.crm",
        "--contract",
        "crm.operating.snapshot.executor",
        "--worker",
        "<worker-id>",
        "--task",
        "<task-ref>",
        "--input",
        "<json>",
        "--context",
        "<json>",
        "--output",
        "json"
      ]
    },
    {
      id: "crm.bootstrap-tenant",
      label: "Bootstrap CRM tenant",
      surface_id: "crm.system-map",
      contract_id: "crm.tenant.bootstrap.executor",
      requires_permission: "crm.workflow.mutate",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.tenant.bootstrap.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.record-relationship-event",
      label: "Record relationship event",
      surface_id: "crm.relationship-graph",
      contract_id: "crm.relationship.timeline.executor",
      requires_permission: "crm.workflow.mutate",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.relationship.timeline.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.generate-proposal",
      label: "Generate proposal",
      surface_id: "crm.document-queue",
      contract_id: "crm.proposal.generator.executor",
      requires_permission: "crm.document.generate",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.proposal.generator.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.generate-document",
      label: "Generate document",
      surface_id: "crm.document-queue",
      contract_id: "crm.document.generator.executor",
      requires_permission: "crm.document.generate",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.document.generator.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.validate-document",
      label: "Validate document",
      surface_id: "crm.document-queue",
      contract_id: "crm.document.validator",
      requires_permission: "crm.document.generate",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-validator", "--addon", "forge.addon.crm", "--contract", "crm.document.validator", "--worker", "<worker-id>", "--subject", "<artifact-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.run-operating-copilot",
      label: "Run operating copilot",
      surface_id: "crm.ai-workbench",
      contract_id: "crm.ai.operating_copilot.executor",
      requires_permission: "crm.ai.recommend",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.ai.operating_copilot.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.deliver-handoff",
      label: "Deliver omnichannel handoff",
      surface_id: "crm.support-queue",
      contract_id: "crm.omnichannel.handoff",
      requires_permission: "crm.omnichannel.ingest",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-handoff", "--addon", "forge.addon.crm", "--contract", "crm.omnichannel.handoff", "--worker", "<worker-id>", "--handoff", "<handoff-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    }
  ];
}

export function buildCrmWebAppSnapshot(options = {}) {
  const tenantId = slug(options.tenant_id || options.tenant || "default");
  const pack = buildCrmWorkflowPack({ tenant_id: tenantId });
  const model = buildCrmOperatingModel({ tenant_id: tenantId, workflows: pack.workflows, coverage: pack.coverage });
  const workflows = pack.workflows;
  const workflowIds = new Set(workflows.map((workflow) => workflow.id));
  const surfaces = Object.entries(model.operator_surfaces).map(([key, surface]) => ({
    id: surface.view_id,
    key,
    title: surface.title,
    surface_type: surface.surface_type,
    route: SURFACE_ROUTES[surface.view_id] || "/crm",
    permission: SURFACE_PERMISSIONS[surface.view_id] || "crm.workflow.mutate",
    state_source: surface.state_source,
    workflow_ids: surface.workflow_ids,
    lanes: surface.lanes,
    artifact_types: surface.artifact_types,
    event_types: surface.event_types,
    mutation_requires_forge: surface.mutation_policy?.direct_external_mutation === false
  }));

  return {
    schema_version: "forge.crm_web_app_snapshot.v1",
    tenant_id: tenantId,
    addon_id: "forge.addon.crm",
    generated_from: {
      operating_model_schema: model.schema_version,
      workflow_pack_schema: pack.schema_version,
      runtime_contract: "crm.operating.snapshot.executor"
    },
    ui_contract: {
      operational_center: "forge_tui",
      web_experience: "business_user_workbench",
      workflow_visualization: "n8n_inspired_graph",
      knowledge_graph: "obsidian_inspired_relationships",
      document_management: "paperclip_inspired_artifact_queue",
      design_system: "penpot_open_design_inspired_tokens"
    },
    local_state_policy: {
      state_owner: model.state_owner,
      external_database_required: model.external_database_required,
      direct_browser_persistence: false,
      allowed_mutation_path: model.mutation_policy.requires_forge_workflow
        ? "Forge workflow command, runtime contract or approved event"
        : "read_only_snapshot",
      external_delivery_requires_approval: model.mutation_policy.external_delivery_requires_approval
    },
    metrics: {
      workflow_count: pack.summary.workflow_count,
      business_module_count: Object.keys(model.business_modules).length,
      surface_count: surfaces.length,
      artifact_type_count: pack.summary.artifact_type_count,
      event_type_count: pack.summary.event_type_count,
      complete_scope: pack.summary.complete_scope
    },
    surfaces,
    business_modules: Object.entries(model.business_modules).map(([id, module]) => ({
      id,
      complete: module.complete,
      workflow_ids: module.workflow_ids,
      artifact_types: module.artifact_types,
      event_types: module.event_types,
      validation_gates: module.validation_gates
    })),
    workflow_graph: {
      state_owner: "forge_workflow_runtime",
      nodes: workflowNodes(workflows),
      edges: workflowEdges(workflowIds)
    },
    knowledge_graph: knowledgeGraph(),
    document_queue: documentQueue(workflows),
    actions: actions(),
    design_tokens: DESIGN_TOKENS,
    observability: model.observability
  };
}
