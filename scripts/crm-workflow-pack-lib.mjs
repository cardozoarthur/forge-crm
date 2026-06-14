const REQUIRED_SCOPE = {
  relationship: ["lead", "contact", "company", "opportunity", "pipeline_kanban", "multiple_funnels", "complete_history", "unified_timeline"],
  commercial: ["proposal", "contract", "signature", "follow_up", "forecast", "goal", "commission", "account_management"],
  support: ["ticket", "sla", "chat", "whatsapp", "telegram", "email", "omnichannel_center"],
  marketing: ["campaign", "segmentation", "automation", "landing_page", "form", "lead_nurturing"],
  operations: ["project", "task", "approval", "document", "internal_flow", "team_handoff"],
  ai_automation: [
    "lead_classification",
    "opportunity_prioritization",
    "proposal_generation",
    "document_generation",
    "executive_summary",
    "risk_analysis",
    "next_step_recommendation",
    "workflow_automation",
    "specialized_copilot"
  ]
};

const WORKFLOWS = [
  {
    id: "crm.lead.lifecycle",
    title: "Lead, contact and company lifecycle",
    domain: "relationship",
    workflow_extension_id: "crm_entity_lifecycle",
    object_types: ["lead", "contact", "company", "complete_history", "unified_timeline"],
    states: ["captured", "enrichment_wait", "qualified", "disqualified", "converted"],
    transitions: [
      ["captured", "enrichment_wait", "missing enrichment context"],
      ["enrichment_wait", "qualified", "qualification evidence approved"],
      ["qualified", "converted", "opportunity workflow created"],
      ["captured", "disqualified", "fit rejected with reason"]
    ],
    runtime_contracts: ["crm.lead.classifier.executor"],
    artifacts: ["crm_timeline_snapshot", "crm_ai_recommendation"],
    events: ["crm.lead.created", "crm.lead.classified", "crm.contact.updated"],
    memory_scopes: ["organization", "project"],
    permissions: ["crm.workflow.mutate", "crm.ai.recommend"],
    views: ["crm.relationship-graph"],
    validation_gates: ["classification evidence present", "state transition has owner and reason"]
  },
  {
    id: "crm.opportunity.pipeline",
    title: "Opportunity pipeline and multiple funnels",
    domain: "relationship",
    workflow_extension_id: "crm_pipeline_kanban",
    object_types: ["opportunity", "pipeline_kanban", "multiple_funnels", "account_management"],
    states: ["research", "discovery", "proposal", "negotiation", "won", "lost"],
    transitions: [
      ["research", "discovery", "qualified account context"],
      ["discovery", "proposal", "approved offer terms"],
      ["proposal", "negotiation", "proposal artifact approved"],
      ["negotiation", "won", "contract workflow started"],
      ["negotiation", "lost", "loss reason recorded"]
    ],
    runtime_contracts: ["crm.lead.classifier.executor", "crm.proposal.generator.executor"],
    artifacts: ["crm_timeline_snapshot", "crm_report"],
    events: ["crm.opportunity.stage_changed", "crm.forecast.updated"],
    memory_scopes: ["organization", "project"],
    permissions: ["crm.workflow.mutate"],
    views: ["crm.pipeline-kanban", "crm.commercial-command"],
    validation_gates: ["stage movement is event-backed", "forecast impact recorded"]
  },
  {
    id: "crm.proposal.approval",
    title: "Proposal generation and approval",
    domain: "commercial",
    workflow_extension_id: "crm_proposal_generation",
    object_types: ["proposal", "document_generation", "proposal_generation"],
    states: ["draft_requested", "draft_generated", "approval_wait", "approved", "rework_required", "delivered"],
    transitions: [
      ["draft_requested", "draft_generated", "proposal executor completed"],
      ["draft_generated", "approval_wait", "human approval requested"],
      ["approval_wait", "approved", "approval recorded"],
      ["approval_wait", "rework_required", "validator returned issue"],
      ["approved", "delivered", "handoff or signature workflow started"]
    ],
    runtime_contracts: ["crm.proposal.generator.executor", "crm.document.validator"],
    artifacts: ["crm_proposal", "crm_document"],
    events: ["crm.proposal.generated", "crm.document.approval_requested"],
    memory_scopes: ["project", "processing"],
    permissions: ["crm.document.generate"],
    views: ["crm.document-queue"],
    validation_gates: ["artifact lineage present", "external delivery blocked until approval"]
  },
  {
    id: "crm.contract.signature",
    title: "Contract and signature lifecycle",
    domain: "commercial",
    workflow_extension_id: "crm_contract_lifecycle",
    object_types: ["contract", "signature", "document"],
    states: ["contract_draft", "legal_review", "signature_wait", "signed", "renewal_wait"],
    transitions: [
      ["contract_draft", "legal_review", "contract artifact attached"],
      ["legal_review", "signature_wait", "approval passed"],
      ["signature_wait", "signed", "signature receipt attached"],
      ["signed", "renewal_wait", "renewal schedule created"]
    ],
    runtime_contracts: ["crm.document.validator"],
    artifacts: ["crm_contract", "crm_document"],
    events: ["crm.contract.reviewed", "crm.contract.signed"],
    memory_scopes: ["organization", "project"],
    permissions: ["crm.document.generate"],
    views: ["crm.document-queue"],
    validation_gates: ["contract approval lineage present", "signature receipt attached"]
  },
  {
    id: "crm.followup.forecast",
    title: "Follow-up, forecast, goals and commissions",
    domain: "commercial",
    workflow_extension_id: "crm_followup_sequence",
    object_types: ["follow_up", "forecast", "goal", "commission"],
    states: ["scheduled", "waiting_due_date", "sent", "response_wait", "forecast_reviewed", "commission_accrued"],
    transitions: [
      ["scheduled", "waiting_due_date", "Forge wait node created"],
      ["waiting_due_date", "sent", "notification or handoff completed"],
      ["sent", "response_wait", "customer response pending"],
      ["response_wait", "forecast_reviewed", "forecast artifact updated"],
      ["forecast_reviewed", "commission_accrued", "commission rule validated"]
    ],
    runtime_contracts: [],
    artifacts: ["crm_report", "crm_email"],
    events: ["crm.followup.scheduled", "crm.forecast.reviewed", "crm.commission.accrued"],
    memory_scopes: ["organization"],
    permissions: ["crm.workflow.mutate"],
    views: ["crm.commercial-command"],
    validation_gates: ["scheduled wait visible", "forecast and commission evidence attached"]
  },
  {
    id: "crm.ticket.sla",
    title: "Ticket, SLA and omnichannel support",
    domain: "support",
    workflow_extension_id: "crm_ticket_sla",
    object_types: ["ticket", "sla", "chat", "whatsapp", "telegram", "email", "omnichannel_center"],
    states: ["received", "triage", "owner_assigned", "customer_wait", "sla_escalation", "resolved"],
    transitions: [
      ["received", "triage", "message event ingested"],
      ["triage", "owner_assigned", "routing policy selected"],
      ["owner_assigned", "customer_wait", "reply delivered"],
      ["customer_wait", "sla_escalation", "SLA wait expired"],
      ["owner_assigned", "resolved", "resolution artifact attached"]
    ],
    runtime_contracts: ["crm.omnichannel.handoff"],
    artifacts: ["crm_support_summary", "crm_handoff_record"],
    events: ["crm.message.received", "crm.ticket.created", "crm.handoff.delivered"],
    memory_scopes: ["organization", "project"],
    permissions: ["crm.omnichannel.ingest"],
    views: ["crm.support-queue"],
    validation_gates: ["SLA wait state explicit", "handoff receipt attached"]
  },
  {
    id: "crm.campaign.lifecycle",
    title: "Campaign, segmentation, landing pages and forms",
    domain: "marketing",
    workflow_extension_id: "crm_campaign_lifecycle",
    object_types: ["campaign", "segmentation", "automation", "landing_page", "form"],
    states: ["brief", "segment_selected", "assets_drafted", "approval_wait", "scheduled", "running", "reported"],
    transitions: [
      ["brief", "segment_selected", "segment rule artifact attached"],
      ["segment_selected", "assets_drafted", "campaign artifacts generated"],
      ["assets_drafted", "approval_wait", "approval requested"],
      ["approval_wait", "scheduled", "approval passed"],
      ["scheduled", "running", "schedule due"],
      ["running", "reported", "campaign report attached"]
    ],
    runtime_contracts: ["crm.document.validator"],
    artifacts: ["crm_campaign", "crm_email", "crm_landing_page", "crm_report"],
    events: ["crm.campaign.created", "crm.campaign.scheduled", "crm.campaign.reported"],
    memory_scopes: ["organization", "project"],
    permissions: ["crm.workflow.mutate", "crm.document.generate"],
    views: ["crm.marketing-calendar"],
    validation_gates: ["campaign artifacts approved", "schedule state visible"]
  },
  {
    id: "crm.lead.nurture",
    title: "Lead nurture automation",
    domain: "marketing",
    workflow_extension_id: "crm_lead_nurture",
    object_types: ["lead_nurturing", "automation", "follow_up"],
    states: ["entered", "wait_step", "message_ready", "approval_wait", "sent", "qualified_or_exit"],
    transitions: [
      ["entered", "wait_step", "nurture schedule created"],
      ["wait_step", "message_ready", "wait completed"],
      ["message_ready", "approval_wait", "message artifact ready"],
      ["approval_wait", "sent", "approval passed"],
      ["sent", "qualified_or_exit", "response classified"]
    ],
    runtime_contracts: ["crm.lead.classifier.executor", "crm.omnichannel.handoff"],
    artifacts: ["crm_email", "crm_ai_recommendation"],
    events: ["crm.nurture.step_due", "crm.nurture.message_sent", "crm.lead.requalified"],
    memory_scopes: ["organization", "processing"],
    permissions: ["crm.workflow.mutate", "crm.omnichannel.ingest"],
    views: ["crm.marketing-calendar"],
    validation_gates: ["scheduled wait visible", "external message approval present"]
  },
  {
    id: "crm.project.handoff",
    title: "Post-sale project and team handoff",
    domain: "operations",
    workflow_extension_id: "crm_project_handoff",
    object_types: ["project", "task", "internal_flow", "team_handoff", "account_management"],
    states: ["handoff_requested", "owner_assigned", "project_planned", "tasks_in_progress", "blocked_wait", "accepted"],
    transitions: [
      ["handoff_requested", "owner_assigned", "owner selected"],
      ["owner_assigned", "project_planned", "project artifact attached"],
      ["project_planned", "tasks_in_progress", "task workflows created"],
      ["tasks_in_progress", "blocked_wait", "blocking reason recorded"],
      ["tasks_in_progress", "accepted", "acceptance evidence attached"]
    ],
    runtime_contracts: ["crm.omnichannel.handoff"],
    artifacts: ["crm_handoff_record", "crm_report"],
    events: ["crm.project.handoff_requested", "crm.task.blocked", "crm.project.accepted"],
    memory_scopes: ["organization", "project"],
    permissions: ["crm.workflow.mutate"],
    views: ["crm.commercial-command"],
    validation_gates: ["owner visible", "blocked reason explicit"]
  },
  {
    id: "crm.document.approval",
    title: "Document queue and approvals",
    domain: "operations",
    workflow_extension_id: "crm_document_approval",
    object_types: ["approval", "document", "internal_flow"],
    states: ["submitted", "validation", "approval_wait", "approved", "rework_required", "archived"],
    transitions: [
      ["submitted", "validation", "document validator queued"],
      ["validation", "approval_wait", "schema and lineage passed"],
      ["approval_wait", "approved", "approver recorded"],
      ["validation", "rework_required", "validator issue recorded"],
      ["approved", "archived", "final artifact attached"]
    ],
    runtime_contracts: ["crm.document.validator"],
    artifacts: ["crm_document", "crm_handoff_record"],
    events: ["crm.document.submitted", "crm.document.validated", "crm.document.approved"],
    memory_scopes: ["project", "processing"],
    permissions: ["crm.document.generate"],
    views: ["crm.document-queue"],
    validation_gates: ["approval actor recorded", "lineage points to Forge artifact"]
  },
  {
    id: "crm.ai.copilot.recommendation",
    title: "Specialized CRM copilots and risk analysis",
    domain: "ai_automation",
    workflow_extension_id: "crm_ai_copilot_recommendation",
    object_types: [
      "lead_classification",
      "opportunity_prioritization",
      "executive_summary",
      "risk_analysis",
      "next_step_recommendation",
      "workflow_automation",
      "specialized_copilot"
    ],
    states: ["context_requested", "recommendation_generated", "review_wait", "approved_action", "discarded"],
    transitions: [
      ["context_requested", "recommendation_generated", "bounded context available"],
      ["recommendation_generated", "review_wait", "recommendation artifact attached"],
      ["review_wait", "approved_action", "human or policy approval recorded"],
      ["review_wait", "discarded", "reason recorded"]
    ],
    runtime_contracts: ["crm.lead.classifier.executor", "crm.proposal.generator.executor"],
    artifacts: ["crm_ai_recommendation", "crm_risk_analysis", "crm_report"],
    events: ["crm.ai.recommendation_generated", "crm.ai.risk_flagged", "crm.next_action.approved"],
    memory_scopes: ["organization", "project", "processing"],
    permissions: ["crm.ai.recommend"],
    views: ["crm.ai-workbench"],
    validation_gates: ["recommendation includes evidence", "state mutation requires workflow approval"]
  }
];

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

function workflowWithPolicies(workflow) {
  return {
    ...workflow,
    forge_state_owner: "forge_workflow",
    record_identity: {
      primary: "workflow_id",
      secondary: ["artifact_id", "event_id"],
      external_primary_key_allowed: false
    },
    mutation_policy: {
      mutated_by: "forge_workflow_runtime",
      requires_forge_command: true,
      direct_external_persistence: false,
      approval_required_for: ["external_delivery", "contract_signature", "campaign_launch", "state_override"]
    },
    observability: {
      required_events: workflow.events,
      required_artifacts: workflow.artifacts,
      lineage_required: true,
      cost_visible: workflow.runtime_contracts.length > 0
    }
  };
}

function scopeCoverage(workflows) {
  const coverage = {};
  for (const [domain, requiredItems] of Object.entries(REQUIRED_SCOPE)) {
    const covered = unique(
      workflows
        .filter((workflow) => workflow.domain === domain || workflow.object_types.some((item) => requiredItems.includes(item)))
        .flatMap((workflow) => workflow.object_types)
    );
    const missing = requiredItems.filter((item) => !covered.includes(item));
    coverage[domain] = {
      required: requiredItems,
      covered: requiredItems.filter((item) => covered.includes(item)),
      missing,
      complete: missing.length === 0
    };
  }
  return coverage;
}

export function buildCrmWorkflowPack(options = {}) {
  const tenantId = slug(options.tenant_id || options.tenant || "default");
  const workflows = WORKFLOWS.map(workflowWithPolicies);
  const objectTypes = unique(workflows.flatMap((workflow) => workflow.object_types)).sort();
  const runtimeContracts = unique(workflows.flatMap((workflow) => workflow.runtime_contracts)).sort();
  const artifactTypes = unique(workflows.flatMap((workflow) => workflow.artifacts)).sort();
  const eventTypes = unique(workflows.flatMap((workflow) => workflow.events)).sort();
  const coverage = scopeCoverage(workflows);

  return {
    schema_version: "forge.crm_workflow_pack.v1",
    tenant_id: tenantId,
    addon_id: "forge.addon.crm",
    principle: "CRM state is workflow-backed and Forge-owned.",
    state_model: {
      state_owner: "forge_workflow_runtime",
      durable_identity: "workflow_id",
      artifact_identity: "artifact_id",
      event_identity: "event_id",
      external_database_required: false
    },
    workflows,
    coverage,
    summary: {
      workflow_count: workflows.length,
      object_type_count: objectTypes.length,
      runtime_contract_count: runtimeContracts.length,
      artifact_type_count: artifactTypes.length,
      event_type_count: eventTypes.length,
      complete_scope: Object.values(coverage).every((domain) => domain.complete)
    },
    indexes: {
      object_types: objectTypes,
      runtime_contracts: runtimeContracts,
      artifact_types: artifactTypes,
      event_types: eventTypes
    },
    core_gap_policy: {
      repository: "forge-core",
      rule: "If a workflow primitive, memory scope, approval gate, artifact lineage or observability capability is missing, implement it in forge-core before adding CRM-local persistence."
    }
  };
}

export function buildTenantBootstrapResult(request = {}) {
  const envelope = request.input && typeof request.input === "object" ? request.input : {};
  const input = envelope.input && typeof envelope.input === "object" ? envelope.input : {};
  const context = envelope.context?.provided_context || envelope.context || {};
  const tenantId = input.tenant_id || input.tenant_context?.tenant_id || input.tenant_context?.id || context.tenant || "default";
  const pack = buildCrmWorkflowPack({ tenant_id: tenantId });
  const taskRef = envelope.task_ref || `crm-tenant-bootstrap-${pack.tenant_id}`;

  return {
    schema_version: "forge.addon_executor_result.v1",
    status: "completed",
    task_ref: taskRef,
    summary: `CRM tenant ${pack.tenant_id} bootstrap workflow pack generated`,
    outputs: {
      tenant_id: pack.tenant_id,
      workflow_count: pack.summary.workflow_count,
      object_type_count: pack.summary.object_type_count,
      complete_scope: pack.summary.complete_scope,
      forge_state_owner: pack.state_model.state_owner,
      external_database_required: false
    },
    artifacts: [
      {
        kind: "crm_workflow_pack",
        id: `crm-workflow-pack-${pack.tenant_id}`,
        title: `CRM workflow pack for ${pack.tenant_id}`,
        content_type: "application/json",
        data: pack
      },
      {
        kind: "crm_system_blueprint",
        id: `crm-system-blueprint-${pack.tenant_id}`,
        title: `CRM system blueprint for ${pack.tenant_id}`,
        content_type: "application/json",
        data: {
          tenant_id: pack.tenant_id,
          workflow_ids: pack.workflows.map((workflow) => workflow.id),
          views: unique(pack.workflows.flatMap((workflow) => workflow.views)),
          runtime_contracts: pack.indexes.runtime_contracts,
          state_model: pack.state_model
        }
      }
    ],
    events: [
      {
        kind: "crm.tenant.bootstrap_generated",
        tenant_id: pack.tenant_id,
        workflow_count: pack.summary.workflow_count,
        complete_scope: pack.summary.complete_scope
      }
    ],
    context_tenant: context.tenant || pack.tenant_id
  };
}

export { REQUIRED_SCOPE, WORKFLOWS };

