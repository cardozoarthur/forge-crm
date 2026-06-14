import { buildCrmOperatingModel, buildCrmWorkflowPack } from "./crm-workflow-pack-lib.mjs";

const SURFACE_ROUTES = {
  "crm.system-map": "/crm/system",
  "crm.relationship-graph": "/crm/relationships",
  "crm.pipeline-kanban": "/crm/pipeline",
  "crm.commercial-command": "/crm/commercial",
  "crm.support-queue": "/crm/support",
  "crm.marketing-calendar": "/crm/marketing",
  "crm.document-queue": "/crm/documents",
  "crm.work-queue": "/crm/work-queue",
  "crm.design-system": "/crm/design-system",
  "crm.ai-workbench": "/crm/ai"
};

const SURFACE_PERMISSIONS = {
  "crm.system-map": "crm.workflow.mutate",
  "crm.relationship-graph": "crm.workflow.mutate",
  "crm.pipeline-kanban": "crm.workflow.mutate",
  "crm.commercial-command": "crm.document.generate",
  "crm.support-queue": "crm.omnichannel.ingest",
  "crm.marketing-calendar": "crm.workflow.mutate",
  "crm.document-queue": "crm.document.generate",
  "crm.work-queue": "crm.workflow.mutate",
  "crm.design-system": "crm.observability.inspect",
  "crm.ai-workbench": "crm.ai.recommend"
};

const WORKFLOW_EDGES = [
  ["crm.lead.lifecycle", "crm.opportunity.pipeline", "converted lead starts opportunity workflow"],
  ["crm.lead.lifecycle", "crm.relationship.profile_enrichment", "captured contact or company enters enrichment workflow"],
  ["crm.relationship.profile_enrichment", "crm.opportunity.pipeline", "approved profile enrichment improves opportunity context"],
  ["crm.opportunity.pipeline", "crm.proposal.approval", "approved offer terms request proposal artifact"],
  ["crm.proposal.approval", "crm.contract.signature", "approved proposal starts contract workflow"],
  ["crm.contract.signature", "crm.followup.forecast", "signed contract updates forecast and commission evidence"],
  ["crm.contract.signature", "crm.goal.commission", "signed revenue events feed commission settlement"],
  ["crm.followup.forecast", "crm.goal.commission", "forecast and goal evidence feed period settlement"],
  ["crm.lead.lifecycle", "crm.marketing.segment_builder", "captured and enriched leads can enter segment selection"],
  ["crm.relationship.profile_enrichment", "crm.marketing.segment_builder", "approved relationship profiles provide audience signals"],
  ["crm.marketing.segment_builder", "crm.campaign.lifecycle", "approved segment audience starts campaign execution"],
  ["crm.campaign.lifecycle", "crm.lead.nurture", "approved campaign schedules nurture workflow"],
  ["crm.campaign.lifecycle", "crm.marketing.landing_page", "approved campaign brief composes landing page artifact"],
  ["crm.marketing.landing_page", "crm.lead.lifecycle", "published form schema routes captured leads"],
  ["crm.marketing.landing_page", "crm.lead.nurture", "landing page routing prepares nurture entry"],
  ["crm.lead.nurture", "crm.lead.lifecycle", "response classification updates lead lifecycle"],
  ["crm.omnichannel.channel_intake", "crm.omnichannel.message", "approved channel intake records Forge-owned message threads"],
  ["crm.omnichannel.message", "crm.omnichannel.center", "message threads feed unified conversation routing"],
  ["crm.omnichannel.message", "crm.ticket.sla", "message routing creates SLA-ready support work"],
  ["crm.omnichannel.message", "crm.omnichannel.reply", "message thread context starts approval-gated reply composition"],
  ["crm.ticket.sla", "crm.omnichannel.reply", "SLA state informs customer response urgency"],
  ["crm.omnichannel.center", "crm.omnichannel.reply", "unified conversation identity informs channel reply"],
  ["crm.omnichannel.channel_intake", "crm.ticket.sla", "approved channel intake creates SLA-ready support work"],
  ["crm.ticket.sla", "crm.project.handoff", "resolved support issue can create internal handoff"],
  ["crm.project.handoff", "crm.document.approval", "handoff deliverables enter document queue"],
  ["crm.document.approval", "crm.document.library", "approved document artifacts enter versioned library"],
  ["crm.document.library", "crm.work.queue.orchestration", "library approval waits can enter cross-domain work queues"],
  ["crm.document.approval", "crm.proposal.approval", "document validation gates proposal delivery"],
  ["crm.ai.copilot.recommendation", "crm.opportunity.pipeline", "approved recommendation mutates pipeline state"],
  ["crm.work.queue.orchestration", "crm.ticket.sla", "queue risk can return SLA work to support"],
  ["crm.work.queue.orchestration", "crm.document.approval", "queue assignment can return documents to approval work"],
  ["crm.work.queue.orchestration", "crm.project.handoff", "queue assignment can return blocked handoffs to operations"],
  ["crm.design.system", "crm.enterprise.readiness", "published design artifacts update readiness evidence"],
  ["crm.operational.observability", "crm.workflow.evolution", "observability findings generate controlled evolution candidates"],
  ["crm.operational.observability", "crm.executive.reporting", "Forge observability feeds executive KPI reporting"],
  ["crm.followup.forecast", "crm.executive.reporting", "forecast evidence feeds executive revenue reporting"],
  ["crm.goal.commission", "crm.executive.reporting", "goal attainment feeds executive revenue reporting"],
  ["crm.ticket.sla", "crm.executive.reporting", "SLA evidence feeds executive risk reporting"],
  ["crm.campaign.lifecycle", "crm.executive.reporting", "campaign evidence feeds executive growth reporting"],
  ["crm.work.queue.orchestration", "crm.executive.reporting", "queue risks feed executive action review"],
  ["crm.executive.reporting", "crm.enterprise.readiness", "business review artifacts update readiness evidence"],
  ["crm.workflow.evolution", "crm.enterprise.readiness", "validated experiments update readiness evidence"],
  ["crm.operational.observability", "crm.workflow.automation_design", "observability can drive safer automation design"],
  ["crm.workflow.automation_design", "crm.work.queue.orchestration", "validated automation queues governed CRM work"],
  ["crm.workflow.automation_design", "crm.enterprise.readiness", "automation validation evidence updates readiness"],
  ["crm.project.handoff", "crm.enterprise.customer_journey", "accepted handoff completes customer lifecycle evidence"],
  ["crm.enterprise.customer_journey", "crm.enterprise.readiness", "accepted journey updates operating readiness evidence"]
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

const WORKBENCH_STATE_SOURCE = "forge_workflow_artifacts_and_events";

const DESIGN_SYSTEM_COMPONENTS = [
  { id: "workflow_node", title: "Workflow node", surface_ids: ["crm.system-map"], state_source: WORKBENCH_STATE_SOURCE },
  { id: "queue_card", title: "Queue card", surface_ids: ["crm.support-queue", "crm.document-queue", "crm.work-queue"], state_source: WORKBENCH_STATE_SOURCE },
  { id: "document_row", title: "Document row", surface_ids: ["crm.document-queue"], state_source: WORKBENCH_STATE_SOURCE },
  { id: "command_action", title: "Command action", surface_ids: ["crm.operational-cockpit", "crm.ai-workbench"], state_source: WORKBENCH_STATE_SOURCE },
  { id: "metric_tile", title: "Metric tile", surface_ids: ["crm.commercial-command", "crm.system-map"], state_source: WORKBENCH_STATE_SOURCE }
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
      { id: "entity.relationship_profile", label: "Relationship profile", kind: "relationship_profile", source_workflow: "crm.relationship.profile_enrichment" },
      { id: "entity.opportunity", label: "Opportunity", kind: "opportunity", source_workflow: "crm.opportunity.pipeline" },
      { id: "entity.ticket", label: "Ticket", kind: "ticket", source_workflow: "crm.ticket.sla" },
      { id: "artifact.proposal", label: "Proposal", kind: "proposal", source_workflow: "crm.proposal.approval" },
      { id: "artifact.contract", label: "Contract", kind: "contract", source_workflow: "crm.contract.signature" },
      { id: "artifact.campaign", label: "Campaign", kind: "campaign", source_workflow: "crm.campaign.lifecycle" },
      { id: "artifact.recommendation", label: "AI recommendation", kind: "ai_recommendation", source_workflow: "crm.ai.copilot.recommendation" }
    ],
    edges: [
      ["entity.company", "entity.contact", "employs"],
      ["entity.contact", "entity.relationship_profile", "enriched into"],
      ["entity.company", "entity.relationship_profile", "provides account context"],
      ["entity.relationship_profile", "entity.opportunity", "improves qualification"],
      ["entity.company", "entity.opportunity", "owns commercial motion"],
      ["entity.lead", "entity.opportunity", "converts into"],
      ["entity.opportunity", "artifact.proposal", "requests"],
      ["artifact.proposal", "artifact.contract", "approved into"],
      ["entity.ticket", "entity.company", "belongs to account"],
      ["artifact.campaign", "entity.lead", "nurtures"],
      ["artifact.recommendation", "entity.opportunity", "suggests next state"]
    ].map(([from, to, relation]) => ({ from, to, relation, source: "forge_workflow_lineage" })),
    enrichment_profiles: [
      {
        profile_id: "profile-mara-lopes",
        entity_id: "contact-001",
        entity_kind: "contact",
        label: "Mara Lopes",
        company_id: "company-acme-logistics",
        workflow_id: "crm.relationship.profile_enrichment",
        contract_id: "crm.relationship.profile_enrichment.executor",
        state: "approval_wait",
        state_owner: "forge_workflow_runtime",
        source_count: 2,
        signal_count: 2,
        artifact_ref: "forge://artifact/crm_relationship_profile/profile-mara-lopes",
        action_id: "crm.enrich-relationship-profile"
      },
      {
        profile_id: "profile-acme-logistics",
        entity_id: "company-001",
        entity_kind: "company",
        label: "Acme Logistics",
        workflow_id: "crm.relationship.profile_enrichment",
        contract_id: "crm.relationship.profile_enrichment.executor",
        state: "sources_attached",
        state_owner: "forge_workflow_runtime",
        source_count: 3,
        signal_count: 1,
        artifact_ref: "forge://artifact/crm_enrichment_record/profile-acme-logistics",
        action_id: "crm.enrich-relationship-profile"
      }
    ]
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

function actionExists(actionList, actionId) {
  return actionList.some((action) => action.id === actionId);
}

function checkedActionIds(actionList, actionIds) {
  return actionIds.filter((actionId) => actionExists(actionList, actionId));
}

function workflowIdsForSurface(workflows, surfaceId) {
  return workflows.filter((workflow) => workflow.views.includes(surfaceId)).map((workflow) => workflow.id);
}

function panelBase({ id, title, surface_id, workflow_ids, action_ids }) {
  return {
    id,
    title,
    surface_id,
    state_source: WORKBENCH_STATE_SOURCE,
    mutation_requires_forge: true,
    workflow_ids,
    action_ids
  };
}

function buildOperationalWorkbench(workflows, actionList, documentQueueSnapshot) {
  const relationshipPanel = {
    ...panelBase({
      id: "relationship_graph",
      title: "Relationship graph",
      surface_id: "crm.relationship-graph",
      workflow_ids: workflowIdsForSurface(workflows, "crm.relationship-graph"),
      action_ids: checkedActionIds(actionList, ["crm.enrich-relationship-profile", "crm.record-relationship-event"])
    }),
    profiles: [
      {
        profile_id: "profile-mara-lopes",
        entity_id: "contact-001",
        entity_kind: "contact",
        account: "Acme Logistics",
        state: "approval_wait",
        enrichment_source_count: 2,
        relationship_signal_count: 2,
        contract_id: "crm.relationship.profile_enrichment.executor",
        action_id: "crm.enrich-relationship-profile"
      },
      {
        profile_id: "profile-acme-logistics",
        entity_id: "company-001",
        entity_kind: "company",
        account: "Acme Logistics",
        state: "sources_attached",
        enrichment_source_count: 3,
        relationship_signal_count: 1,
        contract_id: "crm.relationship.profile_enrichment.executor",
        action_id: "crm.enrich-relationship-profile"
      }
    ],
    timeline_action_id: "crm.record-relationship-event"
  };

  const pipelineWorkflow = workflows.find((workflow) => workflow.id === "crm.opportunity.pipeline");
  const pipelineCards = {
    research: [
      {
        opportunity_id: "opp-fit-001",
        account: "Atlas Foods",
        amount: 180000,
        probability: 0.22,
        owner: "sales.ops",
        next_state: "discovery",
        next_action_id: "crm.move-pipeline-stage",
        forge_artifact_ref: "forge://artifact/crm_pipeline_board/opp-fit-001",
        validation_gate: "stage movement is event-backed"
      }
    ],
    discovery: [
      {
        opportunity_id: "opp-discovery-014",
        account: "Rota Sul Logistics",
        amount: 320000,
        probability: 0.44,
        owner: "account.lead",
        next_state: "proposal",
        next_action_id: "crm.move-pipeline-stage",
        forge_artifact_ref: "forge://artifact/crm_timeline_snapshot/opp-discovery-014",
        validation_gate: "forecast impact recorded"
      }
    ],
    proposal: [
      {
        opportunity_id: "opp-proposal-022",
        account: "Helio Grid",
        amount: 410000,
        probability: 0.62,
        owner: "solutions",
        next_state: "negotiation",
        next_action_id: "crm.generate-proposal",
        forge_artifact_ref: "forge://artifact/crm_proposal/opp-proposal-022",
        validation_gate: "artifact lineage present"
      }
    ],
    negotiation: [
      {
        opportunity_id: "opp-renewal-031",
        account: "Northstar Retail",
        amount: 540000,
        probability: 0.78,
        owner: "commercial.director",
        next_state: "won",
        next_action_id: "crm.manage-contract-signature",
        forge_artifact_ref: "forge://artifact/crm_contract/opp-renewal-031",
        validation_gate: "contract approval lineage present"
      }
    ]
  };

  const pipelinePanel = {
    ...panelBase({
      id: "pipeline_kanban",
      title: "Pipeline Kanban",
      surface_id: "crm.pipeline-kanban",
      workflow_ids: workflowIdsForSurface(workflows, "crm.pipeline-kanban"),
      action_ids: checkedActionIds(actionList, ["crm.move-pipeline-stage", "crm.generate-proposal", "crm.run-operating-copilot"])
    }),
    lanes: (pipelineWorkflow?.states || []).map((state) => ({
      id: state,
      title: state.replace(/_/g, " "),
      lane_state: state,
      workflow_ids: ["crm.opportunity.pipeline"],
      cards: (pipelineCards[state] || []).map((card) => ({
        ...card,
        current_state: state,
        state_source: WORKBENCH_STATE_SOURCE
      }))
    }))
  };

  const commercialPanel = {
    ...panelBase({
      id: "commercial_command",
      title: "Commercial command",
      surface_id: "crm.commercial-command",
      workflow_ids: unique([
        ...workflowIdsForSurface(workflows, "crm.commercial-command"),
        "crm.proposal.approval",
        "crm.contract.signature",
        "crm.goal.commission"
      ]),
      action_ids: checkedActionIds(actionList, [
        "crm.review-followup-forecast",
        "crm.settle-goal-commission",
        "crm.manage-account",
        "crm.manage-contract-signature",
        "crm.plan-project-handoff",
        "crm.generate-proposal"
      ])
    }),
    forecast: {
      workflow_id: "crm.followup.forecast",
      pipeline_value: 1450000,
      weighted_value: 836800,
      goal_value: 1000000,
      forecast_state: "forecast_reviewed",
      report_artifact_type: "crm_forecast_report",
      next_action_id: "crm.review-followup-forecast"
    },
    commission: {
      workflow_id: "crm.followup.forecast",
      accrued_value: 67200,
      state: "commission_accrued",
      evidence_artifact_type: "crm_commission_record",
      plan_action_id: "crm.review-followup-forecast"
    },
    goal_commission: {
      workflow_id: "crm.goal.commission",
      period: "2026-Q3",
      target_amount: 1000000,
      recognized_revenue_amount: 836800,
      attainment_percent: 84,
      statement_state: "statement_generated",
      evidence_artifact_types: ["crm_goal_scorecard", "crm_commission_statement", "crm_compensation_audit_report"],
      payout_allowed: false,
      action_id: "crm.settle-goal-commission",
      contract_id: "crm.commercial.goal_commission.executor"
    },
    contracts: [
      {
        account: "Northstar Retail",
        workflow_id: "crm.contract.signature",
        state: "signature_wait",
        amount: 540000,
        approval_lineage_required: true,
        next_action_id: "crm.manage-contract-signature"
      }
    ],
    accounts: [
      {
        account: "Rota Sul Logistics",
        workflow_id: "crm.account.management",
        health_score: 82,
        renewal_state: "renewal_planned",
        expansion_state: "expansion_identified",
        next_action_id: "crm.manage-account"
      },
      {
        account: "Atlas Foods",
        workflow_id: "crm.project.handoff",
        health_score: 71,
        renewal_state: "success_plan_active",
        expansion_state: "handoff_requested",
        next_action_id: "crm.plan-project-handoff"
      }
    ]
  };

  const supportPanel = {
    ...panelBase({
      id: "support_queue",
      title: "Support queue",
      surface_id: "crm.support-queue",
      workflow_ids: workflowIdsForSurface(workflows, "crm.support-queue"),
      action_ids: checkedActionIds(actionList, [
        "crm.normalize-channel-intake",
        "crm.run-omnichannel-center",
        "crm.ingest-omnichannel-message",
        "crm.compose-support-reply",
        "crm.triage-ticket-sla",
        "crm.deliver-handoff"
      ])
    }),
    channels: ["chat", "whatsapp", "telegram", "email"],
    channel_intake: [
      {
        intake_id: "intake-telegram-implantacao",
        channel: "telegram",
        provider: "telegram-bot-api",
        workflow_id: "crm.omnichannel.channel_intake",
        contract_id: "crm.support.channel_intake.executor",
        intake_state: "authorized",
        ticket_creation_allowed: true,
        action_id: "crm.normalize-channel-intake"
      },
      {
        intake_id: "intake-whatsapp-policy",
        channel: "whatsapp",
        provider: "whatsapp-cloud",
        workflow_id: "crm.omnichannel.channel_intake",
        contract_id: "crm.support.channel_intake.executor",
        intake_state: "authorization_check",
        ticket_creation_allowed: false,
        action_id: "crm.normalize-channel-intake"
      }
    ],
    message_threads: [
      {
        thread_id: "thread-chat-northstar-ops",
        workflow_id: "crm.omnichannel.message",
        contract_id: "crm.support.omnichannel_message.executor",
        state_owner: "forge_workflow_runtime",
        channel: "chat",
        account: "Northstar Retail",
        thread_state: "thread_updated",
        message_count: 4,
        ticket_workflow_id: "crm.ticket.sla",
        receipt_artifact_type: "crm_channel_receipt",
        thread_artifact_type: "crm_message_thread",
        action_id: "crm.ingest-omnichannel-message"
      },
      {
        thread_id: "thread-whatsapp-northstar-blocked",
        workflow_id: "crm.omnichannel.message",
        contract_id: "crm.support.omnichannel_message.executor",
        state_owner: "forge_workflow_runtime",
        channel: "whatsapp",
        account: "Northstar Retail",
        thread_state: "ticket_routing_decided",
        message_count: 7,
        ticket_workflow_id: "crm.ticket.sla",
        receipt_artifact_type: "crm_channel_receipt",
        thread_artifact_type: "crm_message_thread",
        action_id: "crm.ingest-omnichannel-message"
      },
      {
        thread_id: "thread-telegram-helio-install",
        workflow_id: "crm.omnichannel.message",
        contract_id: "crm.support.omnichannel_message.executor",
        state_owner: "forge_workflow_runtime",
        channel: "telegram",
        account: "Helio Grid",
        thread_state: "message_normalized",
        message_count: 2,
        ticket_workflow_id: "crm.ticket.sla",
        receipt_artifact_type: "crm_channel_receipt",
        thread_artifact_type: "crm_message_thread",
        action_id: "crm.ingest-omnichannel-message"
      },
      {
        thread_id: "thread-email-acme-renewal",
        workflow_id: "crm.omnichannel.message",
        contract_id: "crm.support.omnichannel_message.executor",
        state_owner: "forge_workflow_runtime",
        channel: "email",
        account: "Acme Logistics",
        thread_state: "handoff_wait",
        message_count: 3,
        ticket_workflow_id: "crm.ticket.sla",
        receipt_artifact_type: "crm_channel_receipt",
        thread_artifact_type: "crm_message_thread",
        action_id: "crm.ingest-omnichannel-message"
      }
    ],
    omnichannel_center: [
      {
        center_id: "center-account-northstar",
        workflow_id: "crm.omnichannel.center",
        contract_id: "crm.support.omnichannel_center.executor",
        center_state: "routing_ready",
        state_owner: "forge_workflow_runtime",
        account: "Northstar Retail",
        channels: ["whatsapp", "telegram", "email"],
        unified_conversation_count: 2,
        owner_queue: "support-escalation",
        action_id: "crm.run-omnichannel-center"
      },
      {
        center_id: "center-account-helio",
        workflow_id: "crm.omnichannel.center",
        contract_id: "crm.support.omnichannel_center.executor",
        center_state: "identity_matched",
        state_owner: "forge_workflow_runtime",
        account: "Helio Grid",
        channels: ["email", "chat"],
        unified_conversation_count: 1,
        owner_queue: "support",
        action_id: "crm.run-omnichannel-center"
      }
    ],
    reply_queue: [
      {
        response_id: "reply-chat-northstar-ops",
        workflow_id: "crm.omnichannel.reply",
        contract_id: "crm.support.reply_composer.executor",
        state_owner: "forge_workflow_runtime",
        channel: "chat",
        account: "Northstar Retail",
        thread_id: "thread-chat-northstar-ops",
        ticket_id: "sup-1042",
        approval_state: "approval_wait",
        external_send_allowed: false,
        response_artifact_type: "crm_channel_response",
        approval_artifact_type: "crm_approval_record",
        action_id: "crm.compose-support-reply"
      },
      {
        response_id: "reply-whatsapp-northstar-blocked",
        workflow_id: "crm.omnichannel.reply",
        contract_id: "crm.support.reply_composer.executor",
        state_owner: "forge_workflow_runtime",
        channel: "whatsapp",
        account: "Northstar Retail",
        thread_id: "thread-whatsapp-northstar-blocked",
        ticket_id: "sup-1042",
        approval_state: "approval_wait",
        external_send_allowed: false,
        response_artifact_type: "crm_channel_response",
        approval_artifact_type: "crm_approval_record",
        action_id: "crm.compose-support-reply"
      },
      {
        response_id: "reply-telegram-helio-install",
        workflow_id: "crm.omnichannel.reply",
        contract_id: "crm.support.reply_composer.executor",
        state_owner: "forge_workflow_runtime",
        channel: "telegram",
        account: "Helio Grid",
        thread_id: "thread-telegram-helio-install",
        ticket_id: "sup-1057",
        approval_state: "approval_wait",
        external_send_allowed: false,
        response_artifact_type: "crm_channel_response",
        approval_artifact_type: "crm_approval_record",
        action_id: "crm.compose-support-reply"
      },
      {
        response_id: "reply-email-acme-renewal",
        workflow_id: "crm.omnichannel.reply",
        contract_id: "crm.support.reply_composer.executor",
        state_owner: "forge_workflow_runtime",
        channel: "email",
        account: "Acme Logistics",
        thread_id: "thread-email-acme-renewal",
        ticket_id: "sup-1061",
        approval_state: "approval_wait",
        external_send_allowed: false,
        response_artifact_type: "crm_channel_response",
        approval_artifact_type: "crm_approval_record",
        action_id: "crm.compose-support-reply"
      }
    ],
    sla_targets: [
      { priority: "p1", first_response_minutes: 15, resolution_hours: 4 },
      { priority: "p2", first_response_minutes: 60, resolution_hours: 12 }
    ],
    tickets: [
      {
        ticket_id: "sup-1042",
        account: "Northstar Retail",
        channel: "whatsapp",
        state: "sla_escalation",
        sla_status: "at_risk",
        owner: "support.lead",
        minutes_to_breach: 18,
        action_id: "crm.triage-ticket-sla",
        handoff_action_id: "crm.deliver-handoff"
      },
      {
        ticket_id: "sup-1057",
        account: "Helio Grid",
        channel: "email",
        state: "customer_wait",
        sla_status: "waiting_on_customer",
        owner: "success.manager",
        minutes_to_breach: 240,
        action_id: "crm.ingest-omnichannel-message",
        handoff_action_id: "crm.deliver-handoff"
      }
    ]
  };

  const marketingPanel = {
    ...panelBase({
      id: "marketing_calendar",
      title: "Marketing calendar",
      surface_id: "crm.marketing-calendar",
      workflow_ids: workflowIdsForSurface(workflows, "crm.marketing-calendar"),
      action_ids: checkedActionIds(actionList, [
        "crm.build-marketing-segment",
        "crm.automate-campaign",
        "crm.publish-landing-page",
        "crm.capture-form-submission",
        "crm.deliver-handoff"
      ])
    }),
    campaigns: [
      {
        campaign_id: "cmp-expansion-q3",
        workflow_id: "crm.campaign.lifecycle",
        segment: "enterprise renewal accounts",
        state: "scheduled",
        launch_window: "week_32",
        approval_state: "approved",
        artifact_type: "crm_campaign",
        next_action_id: "crm.automate-campaign"
      },
      {
        campaign_id: "cmp-logistics-demo",
        workflow_id: "crm.campaign.lifecycle",
        segment: "mid-market operations",
        state: "approval_wait",
        launch_window: "week_33",
        approval_state: "waiting",
        artifact_type: "crm_landing_page",
        next_action_id: "crm.automate-campaign"
      }
    ],
    segments: [
      {
        segment_id: "segment-enterprise-renewal",
        name: "Enterprise renewal accounts",
        workflow_id: "crm.marketing.segment_builder",
        contract_id: "crm.marketing.segment_builder.executor",
        state: "approval_wait",
        audience_count: 42,
        source_workflows: ["crm.lead.lifecycle", "crm.relationship.profile_enrichment"],
        artifact_types: ["crm_segment_definition", "crm_segment_audience"],
        action_id: "crm.build-marketing-segment"
      },
      {
        segment_id: "segment-ops-demo",
        name: "Operations demo demand",
        workflow_id: "crm.marketing.segment_builder",
        contract_id: "crm.marketing.segment_builder.executor",
        state: "criteria_defined",
        audience_count: 18,
        source_workflows: ["crm.lead.lifecycle", "crm.relationship.profile_enrichment"],
        artifact_types: ["crm_segment_definition", "crm_segment_audience"],
        action_id: "crm.build-marketing-segment"
      }
    ],
    landing_pages: [
      {
        landing_page_id: "lp-demo-request",
        campaign_id: "cmp-logistics-demo",
        workflow_id: "crm.marketing.landing_page",
        contract_id: "crm.marketing.landing_page.executor",
        state: "approval_wait",
        publication_state: "approval_wait",
        external_publication_allowed: false,
        artifact_type: "crm_landing_page",
        form_schema_artifact_type: "crm_form_schema",
        publish_action_id: "crm.publish-landing-page",
        capture_action_id: "crm.capture-form-submission"
      }
    ],
    forms: [
      {
        form_id: "form-demo-request",
        workflow_id: "crm.campaign.lifecycle",
        landing_page: "demo-request",
        pending_submissions: 17,
        consent_artifact_type: "crm_consent_record",
        capture_action_id: "crm.capture-form-submission"
      }
    ],
    nurture_tracks: [
      {
        track_id: "nurture-inbound-001",
        workflow_id: "crm.lead.nurture",
        state: "wait_step",
        next_message_state: "message_ready",
        next_action_id: "crm.automate-campaign"
      }
    ]
  };

  const documentPanel = {
    ...panelBase({
      id: "document_queue",
      title: "Document queue",
      surface_id: "crm.document-queue",
      workflow_ids: workflowIdsForSurface(workflows, "crm.document-queue"),
      action_ids: checkedActionIds(actionList, [
        "crm.generate-proposal",
        "crm.generate-document",
        "crm.validate-document",
        "crm.record-document-approval",
        "crm.manage-document-library",
        "crm.manage-contract-signature"
      ])
    }),
    lanes: documentQueueSnapshot.lanes,
    artifact_types: documentQueueSnapshot.artifact_types,
    documents: [
      {
        document_id: "doc-prop-022",
        type: "crm_proposal",
        workflow_id: "crm.proposal.approval",
        state: "approval_wait",
        owner: "commercial.director",
        artifact_ref: "forge://artifact/crm_proposal/doc-prop-022",
        validation_action_id: "crm.validate-document",
        approval_action_id: "crm.record-document-approval"
      },
      {
        document_id: "doc-contract-031",
        type: "crm_contract",
        workflow_id: "crm.contract.signature",
        state: "signature_wait",
        owner: "legal.ops",
        artifact_ref: "forge://artifact/crm_contract/doc-contract-031",
        validation_action_id: "crm.validate-document",
        approval_action_id: "crm.manage-contract-signature"
      },
      {
        document_id: "doc-board-006",
        type: "crm_presentation",
        workflow_id: "crm.document.approval",
        state: "rework_required",
        owner: "delivery.ops",
        artifact_ref: "forge://artifact/crm_presentation/doc-board-006",
        validation_action_id: "crm.validate-document",
        approval_action_id: "crm.record-document-approval"
      }
    ],
    library_records: [
      {
        file_id: "file-prop-022",
        document_id: "doc-prop-022",
        version_id: "doc-prop-022-v2",
        collection_id: "collection-commercial-proposals",
        workflow_id: "crm.document.library",
        contract_id: "crm.document.library.executor",
        version_state: "approval_wait",
        state_owner: "forge_workflow_runtime",
        artifact_ref: "forge://artifact/crm_document_version/doc-prop-022-v2",
        lineage_artifact_ref: "forge://artifact/crm_file_record/file-prop-022",
        action_id: "crm.manage-document-library"
      },
      {
        file_id: "file-contract-031",
        document_id: "doc-contract-031",
        version_id: "doc-contract-031-v1",
        collection_id: "collection-contracts",
        workflow_id: "crm.document.library",
        contract_id: "crm.document.library.executor",
        version_state: "promoted",
        state_owner: "forge_workflow_runtime",
        artifact_ref: "forge://artifact/crm_document_version/doc-contract-031-v1",
        lineage_artifact_ref: "forge://artifact/crm_file_record/file-contract-031",
        action_id: "crm.manage-document-library"
      }
    ]
  };

  const workQueuePanel = {
    ...panelBase({
      id: "work_queue",
      title: "Work queue",
      surface_id: "crm.work-queue",
      workflow_ids: workflowIdsForSurface(workflows, "crm.work-queue"),
      action_ids: checkedActionIds(actionList, [
        "crm.run-work-queue",
        "crm.inspect-observability",
        "crm.run-area-copilot"
      ])
    }),
    state_owner: "forge_workflow_runtime",
    contract_id: "crm.queue.orchestrator.executor",
    queue_modes: ["approvals", "sla", "documents", "campaigns", "handoffs", "blocked_waits"],
    queues: [
      {
        id: "approvals",
        title: "Approvals",
        workflow_ids: ["crm.proposal.approval", "crm.document.approval", "crm.campaign.lifecycle"],
        item_count: 3,
        risk_item_count: 1,
        action_id: "crm.run-work-queue"
      },
      {
        id: "sla",
        title: "SLA",
        workflow_ids: ["crm.ticket.sla"],
        item_count: 2,
        risk_item_count: 2,
        action_id: "crm.run-work-queue"
      },
      {
        id: "documents",
        title: "Documents",
        workflow_ids: ["crm.document.approval", "crm.contract.signature", "crm.proposal.approval"],
        item_count: 3,
        risk_item_count: 1,
        action_id: "crm.run-work-queue"
      },
      {
        id: "campaigns",
        title: "Campaigns",
        workflow_ids: ["crm.campaign.lifecycle", "crm.lead.nurture"],
        item_count: 2,
        risk_item_count: 1,
        action_id: "crm.run-work-queue"
      },
      {
        id: "handoffs",
        title: "Handoffs",
        workflow_ids: ["crm.project.handoff", "crm.account.management"],
        item_count: 2,
        risk_item_count: 1,
        action_id: "crm.run-work-queue"
      },
      {
        id: "blocked_waits",
        title: "Blocked waits",
        workflow_ids: ["crm.followup.forecast", "crm.contract.signature", "crm.project.handoff"],
        item_count: 2,
        risk_item_count: 1,
        action_id: "crm.run-work-queue"
      }
    ],
    assignments: [
      {
        queue: "approvals",
        owner: "commercial.director",
        contract_id: "crm.queue.orchestrator.executor",
        requires_forge_approval: true,
        state_owner: "forge_workflow_runtime"
      },
      {
        queue: "sla",
        owner: "support.lead",
        contract_id: "crm.queue.orchestrator.executor",
        requires_forge_approval: true,
        state_owner: "forge_workflow_runtime"
      },
      {
        queue: "documents",
        owner: "document.ops",
        contract_id: "crm.queue.orchestrator.executor",
        requires_forge_approval: true,
        state_owner: "forge_workflow_runtime"
      },
      {
        queue: "campaigns",
        owner: "marketing.ops",
        contract_id: "crm.queue.orchestrator.executor",
        requires_forge_approval: true,
        state_owner: "forge_workflow_runtime"
      },
      {
        queue: "handoffs",
        owner: "delivery.ops",
        contract_id: "crm.queue.orchestrator.executor",
        requires_forge_approval: true,
        state_owner: "forge_workflow_runtime"
      },
      {
        queue: "blocked_waits",
        owner: "ops.commander",
        contract_id: "crm.queue.orchestrator.executor",
        requires_forge_approval: true,
        state_owner: "forge_workflow_runtime"
      }
    ],
    risk_summary: {
      risk_item_count: 7,
      ownership_gap_count: 1,
      evidence_artifact_type: "crm_queue_sla_risk_report",
      closure_policy: "risk closure requires Forge workflow evidence"
    }
  };

  const aiPanel = {
    ...panelBase({
      id: "ai_workbench",
      title: "AI workbench",
      surface_id: "crm.ai-workbench",
      workflow_ids: workflowIdsForSurface(workflows, "crm.ai-workbench"),
      action_ids: checkedActionIds(actionList, [
        "crm.run-operating-copilot",
        "crm.run-area-copilot",
        "crm.generate-executive-report",
        "crm.prepare-memory-promotion",
        "crm.evolve-workflow",
        "crm.inspect-observability",
        "crm.generate-readiness-package"
      ])
    }),
    recommendations: [
      {
        recommendation_id: "ai-rec-2401",
        workflow_id: "crm.ai.copilot.recommendation",
        kind: "opportunity_prioritization",
        state: "review_wait",
        target_surface_id: "crm.pipeline-kanban",
        evidence_artifact_type: "crm_ai_recommendation",
        target_action_id: "crm.move-pipeline-stage",
        action_id: "crm.run-operating-copilot"
      },
      {
        recommendation_id: "ai-risk-0902",
        workflow_id: "crm.ai.copilot.recommendation",
        kind: "risk_analysis",
        state: "recommendation_generated",
        target_surface_id: "crm.commercial-command",
        evidence_artifact_type: "crm_risk_analysis",
        target_action_id: "crm.manage-account",
        action_id: "crm.run-operating-copilot"
      }
    ],
    specialized_copilots: [
      {
        area: "commercial",
        title: "Commercial copilot",
        workflow_id: "crm.opportunity.pipeline",
        contract_id: "crm.ai.area_copilot.executor",
        state_owner: "forge_workflow_runtime",
        evidence_artifact_type: "crm_area_copilot_brief",
        recommended_focus: "Revenue risk, forecast and next commercial step",
        action_id: "crm.run-area-copilot"
      },
      {
        area: "support",
        title: "Support copilot",
        workflow_id: "crm.ticket.sla",
        contract_id: "crm.ai.area_copilot.executor",
        state_owner: "forge_workflow_runtime",
        evidence_artifact_type: "crm_area_copilot_brief",
        recommended_focus: "SLA recovery and customer response",
        action_id: "crm.run-area-copilot"
      },
      {
        area: "marketing",
        title: "Marketing copilot",
        workflow_id: "crm.campaign.lifecycle",
        contract_id: "crm.ai.area_copilot.executor",
        state_owner: "forge_workflow_runtime",
        evidence_artifact_type: "crm_area_copilot_brief",
        recommended_focus: "Campaign segmentation and nurture adjustment",
        action_id: "crm.run-area-copilot"
      },
      {
        area: "operations",
        title: "Operations copilot",
        workflow_id: "crm.project.handoff",
        contract_id: "crm.ai.area_copilot.executor",
        state_owner: "forge_workflow_runtime",
        evidence_artifact_type: "crm_area_copilot_brief",
        recommended_focus: "Handoff, task owner and blocked wait recovery",
        action_id: "crm.run-area-copilot"
      },
      {
        area: "documents",
        title: "Documents copilot",
        workflow_id: "crm.document.approval",
        contract_id: "crm.ai.area_copilot.executor",
        state_owner: "forge_workflow_runtime",
        evidence_artifact_type: "crm_area_copilot_brief",
        recommended_focus: "Approval queue and document rework",
        action_id: "crm.run-area-copilot"
      }
    ],
    executive_reports: [
      {
        report_id: "exec-review-q3",
        workflow_id: "crm.executive.reporting",
        contract_id: "crm.analytics.executive_report.executor",
        state_owner: "forge_workflow_runtime",
        reporting_state: "ready_for_review",
        health_score: 78,
        risk_count: 2,
        artifact_types: ["crm_executive_summary", "crm_kpi_dashboard", "crm_business_review_report"],
        action_id: "crm.generate-executive-report"
      }
    ],
    memory_promotions: [
      {
        candidate_id: "mem-promote-011",
        workflow_id: "crm.ai.copilot.recommendation",
        source_scope: "processing",
        target_scope: "organization",
        visibility: "internal",
        action_id: "crm.prepare-memory-promotion"
      }
    ],
    observability: {
      workflow_id: "crm.operational.observability",
      risk_count: 2,
      lineage_source: "forge.events.timeline",
      inspect_action_id: "crm.inspect-observability",
      readiness_action_id: "crm.generate-readiness-package"
    }
  };

  return {
    schema_version: "forge.crm_operational_workbench.v1",
    state_source: WORKBENCH_STATE_SOURCE,
    mutation_requires_forge: true,
    panels: [relationshipPanel, pipelinePanel, commercialPanel, supportPanel, marketingPanel, documentPanel, workQueuePanel, aiPanel]
  };
}

function workflowEvolutionWorkbench(workflows, actionList) {
  const actionById = new Map(actionList.map((action) => [action.id, action]));
  const evolutionAction = actionById.get("crm.evolve-workflow");
  const evolutionWorkflow = workflows.find((workflow) => workflow.id === "crm.workflow.evolution");
  const candidates = [
    {
      id: "evolve-sla-owner-routing",
      title: "Route SLA owner from channel and account tier",
      target_workflow_id: "crm.ticket.sla",
      source_observability_workflow_id: "crm.operational.observability",
      expected_metric: "sla_breach_count",
      expected_delta: -2,
      rollback_plan: "restore previous owner routing policy through Forge improve rollback gate",
      changelog_required: true,
      action_id: "crm.evolve-workflow"
    },
    {
      id: "evolve-document-approval-rework",
      title: "Split document validation rework by artifact type",
      target_workflow_id: "crm.document.approval",
      source_observability_workflow_id: "crm.operational.observability",
      expected_metric: "document_rework_count",
      expected_delta: -3,
      rollback_plan: "restore generic document approval validation gate",
      changelog_required: true,
      action_id: "crm.evolve-workflow"
    }
  ];

  return {
    schema_version: "forge.crm_workflow_evolution_workbench.v1",
    workflow_id: evolutionWorkflow?.id || "crm.workflow.evolution",
    workflow_extension_id: evolutionWorkflow?.workflow_extension_id || "crm_workflow_evolution",
    state_source: "forge_improve_candidates_and_benchmarks",
    local_self_modification_allowed: false,
    action_id: evolutionAction?.id || "crm.evolve-workflow",
    contract_id: evolutionAction?.contract_id || "crm.workflow.evolution.executor",
    evolution_loop: {
      operation_plan: [
        {
          id: "inspect_observability",
          title: "Inspect CRM observability evidence",
          owner: "crm.observability.inspector.executor"
        },
        {
          id: "generate_candidate",
          title: "Generate controlled workflow candidate",
          owner: "crm.workflow.evolution.executor"
        },
        {
          id: "benchmark_candidate",
          title: "Benchmark candidate with Forge improve",
          owner: "forge.improve.benchmark_event_policy"
        },
        {
          id: "promote_only_after_validation",
          title: "Promote only after validation and approval",
          owner: "forge.improve.promote_event_policy"
        }
      ]
    },
    candidates,
    benchmark_queue: candidates.map((candidate) => ({
      candidate_id: candidate.id,
      target_workflow_id: candidate.target_workflow_id,
      metric: candidate.expected_metric,
      command_template: [
        "forge",
        "improve",
        "benchmark-event-policy",
        "--workflow",
        candidate.target_workflow_id,
        "--policy",
        candidate.id,
        "--output",
        "json"
      ]
    })),
    promotion_gates: candidates.map((candidate) => ({
      candidate_id: candidate.id,
      required_before_promotion: true,
      requirements: [
        "benchmark evidence passes",
        "rollback plan exists",
        "changelog is attached",
        "human approval is recorded"
      ]
    })),
    core_gap_policy: {
      target_repository: "forge-core",
      rule: "If the experiment needs a missing runtime primitive, report the gap instead of creating CRM-local automation."
    }
  };
}

function enterpriseJourneyWorkbench(workflows, actionList) {
  const actionById = new Map(actionList.map((action) => [action.id, action]));
  const journeyAction = actionById.get("crm.run-enterprise-journey");
  const journeyWorkflow = workflows.find((workflow) => workflow.id === "crm.enterprise.customer_journey");
  const stageLanes = [
    {
      id: "lead_capture",
      title: "Lead capture",
      workflow_id: "crm.lead.lifecycle",
      contract_id: "crm.marketing.form_capture.executor",
      required_artifacts: ["crm_lead_capture"],
      required_events: ["crm.lead.created"]
    },
    {
      id: "opportunity",
      title: "Opportunity",
      workflow_id: "crm.opportunity.pipeline",
      contract_id: "crm.pipeline.stage_move.executor",
      required_artifacts: ["crm_pipeline_board"],
      required_events: ["crm.opportunity.stage_changed"]
    },
    {
      id: "proposal",
      title: "Proposal",
      workflow_id: "crm.proposal.approval",
      contract_id: "crm.proposal.generator.executor",
      required_artifacts: ["crm_proposal"],
      required_events: ["crm.proposal.generated"]
    },
    {
      id: "contract",
      title: "Contract",
      workflow_id: "crm.contract.signature",
      contract_id: "crm.commercial.contract_signature.executor",
      required_artifacts: ["crm_contract", "crm_signature_receipt"],
      required_events: ["crm.contract.signed"]
    },
    {
      id: "account",
      title: "Account",
      workflow_id: "crm.account.management",
      contract_id: "crm.commercial.account_management.executor",
      required_artifacts: ["crm_account_plan"],
      required_events: ["crm.account.health_reviewed"]
    },
    {
      id: "support",
      title: "Support",
      workflow_id: "crm.ticket.sla",
      contract_id: "crm.support.ticket_sla.executor",
      required_artifacts: ["crm_support_summary"],
      required_events: ["crm.ticket.created", "crm.sla.escalated"]
    },
    {
      id: "handoff",
      title: "Handoff",
      workflow_id: "crm.project.handoff",
      contract_id: "crm.operations.project_handoff.executor",
      required_artifacts: ["crm_project_plan", "crm_task_plan"],
      required_events: ["crm.project.handoff_requested"]
    }
  ];

  return {
    schema_version: "forge.crm_enterprise_journey_workbench.v1",
    workflow_id: journeyWorkflow?.id || "crm.enterprise.customer_journey",
    workflow_extension_id: journeyWorkflow?.workflow_extension_id || "crm_enterprise_customer_journey",
    state_owner: "forge_workflow_runtime",
    local_state_allowed: false,
    action_id: journeyAction?.id || "crm.run-enterprise-journey",
    contract_id: journeyAction?.contract_id || "crm.enterprise.journey.executor",
    stage_lanes: stageLanes.map((stage) => ({
      ...stage,
      state_source: "Forge artifacts and events",
      owner: "forge_workflow_runtime"
    })),
    acceptance_gates: [
      {
        id: "stage_artifact_evidence",
        title: "Every stage has required artifact evidence",
        owner: "Forge validation",
        required: true
      },
      {
        id: "stage_event_evidence",
        title: "Every stage has required event evidence",
        owner: "Forge validation",
        required: true
      },
      {
        id: "no_external_main_flow_dependency",
        title: "No main-flow dependency bypasses Forge",
        owner: "Forge validation",
        required: true
      },
      {
        id: "cross_domain_handoff_lineage",
        title: "Cross-domain handoffs preserve workflow lineage",
        owner: "Forge validation",
        required: true
      }
    ],
    operation_plan: [
      {
        id: "collect_stage_evidence",
        title: "Collect promoted artifacts and events for every customer lifecycle stage",
        owner: "forge.workflow.artifacts and forge.events.timeline"
      },
      {
        id: "execute_enterprise_journey",
        title: "Execute CRM enterprise journey acceptance contract",
        owner: "crm.enterprise.journey.executor"
      },
      {
        id: "promote_acceptance_package",
        title: "Promote journey map and acceptance evidence to the Forge workflow",
        owner: "forge.addon_runtime"
      },
      {
        id: "refresh_readiness",
        title: "Refresh enterprise readiness evidence",
        owner: "crm.operating.readiness.executor"
      }
    ]
  };
}

function subworkflowOrchestrationWorkbench(workflows, actionList) {
  const actionById = new Map(actionList.map((action) => [action.id, action]));
  const action = actionById.get("crm.orchestrate-subworkflows");
  const workflow = workflows.find((candidate) => candidate.id === "crm.subworkflow.orchestration");
  const parentWorkflowId = "crm.enterprise.customer_journey";
  const childBindings = [
    {
      id: "subflow-pipeline",
      child_workflow_id: "crm.opportunity.pipeline",
      child_task_id: "stage-negotiation",
      validation_gate: "stage change has forecast artifact",
      artifact_types: ["crm_pipeline_board", "crm_forecast_report"]
    },
    {
      id: "subflow-document",
      child_workflow_id: "crm.document.approval",
      child_task_id: "approve-proposal",
      validation_gate: "document approval artifact is attached",
      artifact_types: ["crm_approval_record", "crm_handoff_record"]
    },
    {
      id: "subflow-support",
      child_workflow_id: "crm.ticket.sla",
      child_task_id: "triage-sla",
      validation_gate: "SLA event is promoted",
      artifact_types: ["crm_support_summary", "crm_handoff_record"]
    },
    {
      id: "subflow-handoff",
      child_workflow_id: "crm.project.handoff",
      child_task_id: "handoff-delivery",
      validation_gate: "handoff owner is assigned",
      artifact_types: ["crm_project_plan", "crm_task_plan"]
    }
  ];

  return {
    schema_version: "forge.crm_subworkflow_orchestration_workbench.v1",
    workflow_id: workflow?.id || "crm.subworkflow.orchestration",
    workflow_extension_id: workflow?.workflow_extension_id || "crm_subworkflow_orchestration",
    state_owner: "forge_workflow_runtime",
    state_source: "forge_child_subflows_and_workflow_events",
    local_state_allowed: false,
    action_id: action?.id || "crm.orchestrate-subworkflows",
    contract_id: action?.contract_id || "crm.workflow.subworkflow_orchestrator.executor",
    parent_workflow_id: parentWorkflowId,
    child_bindings: childBindings.map((binding) => ({
      ...binding,
      parent_workflow_id: parentWorkflowId,
      owner: "forge_workflow_runtime",
      lifecycle_state: "validated"
    })),
    promotion_gates: [
      {
        id: "child_lineage_mapped",
        title: "Every child workflow has artifact and event lineage",
        owner: "Forge validation",
        required: true
      },
      {
        id: "children_validated_before_parent",
        title: "Parent workflow waits for validated child gates",
        owner: "Forge validation",
        required: true
      },
      {
        id: "no_local_child_execution",
        title: "No child workflow executes outside Forge",
        owner: "Forge validation",
        required: true
      }
    ],
    operation_plan: [
      {
        id: "bind_child_subflows",
        title: "Bind CRM child workflows to the parent journey through Forge child_subflows",
        owner: "crm.workflow.subworkflow_orchestrator.executor"
      },
      {
        id: "map_child_lineage",
        title: "Map artifacts, events and validation gates for each child workflow",
        owner: "forge.workflow.artifacts and forge.events.timeline"
      },
      {
        id: "validate_children",
        title: "Block parent promotion until every child gate passes",
        owner: "Forge validation"
      },
      {
        id: "refresh_enterprise_journey",
        title: "Refresh the enterprise journey acceptance package",
        owner: "crm.enterprise.journey.executor"
      }
    ]
  };
}

function workflowAutomationDesignerWorkbench(workflows, actionList) {
  const actionById = new Map(actionList.map((action) => [action.id, action]));
  const action = actionById.get("crm.design-workflow-automation");
  const workflow = workflows.find((candidate) => candidate.id === "crm.workflow.automation_design");
  const triggerPalette = [
    {
      id: "lead-created",
      title: "Lead created",
      kind: "event",
      event_type: "crm.lead.created",
      workflow_id: "crm.lead.lifecycle"
    },
    {
      id: "sla-escalated",
      title: "SLA escalated",
      kind: "event",
      event_type: "crm.sla.escalated",
      workflow_id: "crm.ticket.sla"
    },
    {
      id: "daily-forecast",
      title: "Daily forecast review",
      kind: "schedule",
      schedule: "0 9 * * 1-5",
      workflow_id: "crm.followup.forecast"
    }
  ];
  const actionPalette = [
    {
      id: "queue-commercial",
      title: "Queue commercial work",
      contract_id: "crm.queue.orchestrator.executor",
      workflow_id: "crm.work.queue.orchestration"
    },
    {
      id: "schedule-followup",
      title: "Schedule follow-up",
      contract_id: "crm.commercial.followup_forecast.executor",
      workflow_id: "crm.followup.forecast"
    },
    {
      id: "notify-support",
      title: "Route support SLA",
      contract_id: "crm.support.ticket_sla.executor",
      workflow_id: "crm.ticket.sla"
    }
  ];

  return {
    schema_version: "forge.crm_workflow_automation_designer_workbench.v1",
    workflow_id: workflow?.id || "crm.workflow.automation_design",
    workflow_extension_id: workflow?.workflow_extension_id || "crm_workflow_automation_designer",
    state_owner: "forge_workflow_runtime",
    state_source: "forge_events_schedules_and_workflow_contracts",
    local_state_allowed: false,
    action_id: action?.id || "crm.design-workflow-automation",
    contract_id: action?.contract_id || "crm.workflow.automation_designer.executor",
    trigger_palette: triggerPalette,
    action_palette: actionPalette,
    rule_graph: {
      nodes: [
        ...triggerPalette.map((trigger) => ({ id: trigger.id, kind: "trigger", title: trigger.title, workflow_id: trigger.workflow_id })),
        {
          id: "condition-hot-lead-or-sla",
          kind: "condition",
          title: "Lead score or SLA risk passes policy",
          expression: "lead.score >= 80 OR ticket.sla_state == 'sla_escalation'",
          evidence_artifact_types: ["crm_ai_recommendation", "crm_support_summary"]
        },
        ...actionPalette.map((paletteAction) => ({
          id: paletteAction.id,
          kind: "action",
          title: paletteAction.title,
          contract_id: paletteAction.contract_id,
          workflow_id: paletteAction.workflow_id
        }))
      ],
      edges: [
        ...triggerPalette.map((trigger) => ({ from: trigger.id, to: "condition-hot-lead-or-sla", relation: "evaluates" })),
        ...actionPalette.map((paletteAction) => ({ from: "condition-hot-lead-or-sla", to: paletteAction.id, relation: "queues" }))
      ]
    },
    validation_gates: [
      {
        id: "trigger_condition_action_graph_valid",
        title: "Trigger, condition and action graph validates before activation",
        owner: "Forge validation",
        required: true
      },
      {
        id: "automation_stays_in_forge",
        title: "Automation actions route through Forge runtime contracts",
        owner: "Forge validation",
        required: true
      },
      {
        id: "permission_gates_pass",
        title: "Activation waits for permission gates and dry-run evidence",
        owner: "Forge validation",
        required: true
      }
    ]
  };
}

function executiveReportingWorkbench(workflows, actionList) {
  const actionById = new Map(actionList.map((action) => [action.id, action]));
  const action = actionById.get("crm.generate-executive-report");
  const workflow = workflows.find((candidate) => candidate.id === "crm.executive.reporting");
  const kpis = [
    { id: "pipeline_value", label: "Pipeline value", value: 1450000, unit: "currency", source_workflow_id: "crm.followup.forecast" },
    { id: "forecast_amount", label: "Forecast", value: 836800, unit: "currency", source_workflow_id: "crm.followup.forecast" },
    { id: "recognized_revenue_amount", label: "Recognized revenue", value: 300000, unit: "currency", source_workflow_id: "crm.goal.commission" },
    { id: "attainment_percent", label: "Goal attainment", value: 84, unit: "percent", source_workflow_id: "crm.goal.commission" },
    { id: "open_ticket_count", label: "Open tickets", value: 18, unit: "count", source_workflow_id: "crm.ticket.sla" },
    { id: "sla_at_risk_count", label: "SLA at risk", value: 3, unit: "count", source_workflow_id: "crm.ticket.sla" },
    { id: "active_campaign_count", label: "Active campaigns", value: 4, unit: "count", source_workflow_id: "crm.campaign.lifecycle" },
    { id: "approval_wait_count", label: "Approval waits", value: 5, unit: "count", source_workflow_id: "crm.work.queue.orchestration" },
    { id: "executive_health_score", label: "Executive health", value: 78, unit: "score", source_workflow_id: "crm.executive.reporting" }
  ];

  return {
    schema_version: "forge.crm_executive_reporting_workbench.v1",
    workflow_id: workflow?.id || "crm.executive.reporting",
    workflow_extension_id: workflow?.workflow_extension_id || "crm_executive_reporting",
    state_owner: "forge_workflow_runtime",
    state_source: WORKBENCH_STATE_SOURCE,
    local_state_allowed: false,
    external_analytics_database_required: false,
    action_id: action?.id || "crm.generate-executive-report",
    contract_id: action?.contract_id || "crm.analytics.executive_report.executor",
    kpis,
    executive_summaries: [
      {
        id: "executive-summary-q3",
        artifact_type: "crm_executive_summary",
        summary: "Pipeline, forecast, SLA risk and approval waits are ready for executive review.",
        recommended_action_count: 3,
        state_owner: "forge_workflow_runtime"
      }
    ],
    business_reviews: [
      {
        id: "business-review-q3",
        artifact_type: "crm_business_review_report",
        risk_count: 2,
        review_state: "ready_for_review",
        source_workflows: [
          "crm.operational.observability",
          "crm.followup.forecast",
          "crm.goal.commission",
          "crm.ticket.sla",
          "crm.campaign.lifecycle",
          "crm.work.queue.orchestration"
        ]
      }
    ],
    validation_gates: [
      "executive KPIs are derived from Forge workflow artifacts and events",
      "recommended decisions remain advisory until Forge approval"
    ]
  };
}

function goalCommissionWorkbench(workflows, actionList) {
  const actionById = new Map(actionList.map((action) => [action.id, action]));
  const action = actionById.get("crm.settle-goal-commission");
  const workflow = workflows.find((candidate) => candidate.id === "crm.goal.commission");
  const goalTargets = [
    {
      id: "goal-enterprise-new-arr",
      title: "Enterprise new ARR",
      owner: "sales-owner",
      target_amount: 300000,
      weight: 0.7,
      artifact_type: "crm_goal_scorecard"
    },
    {
      id: "goal-expansion-arr",
      title: "Expansion ARR",
      owner: "sales-owner",
      target_amount: 100000,
      weight: 0.3,
      artifact_type: "crm_goal_scorecard"
    }
  ];
  const revenueEvents = [
    {
      id: "rev-contract-001",
      account: "Acme Logistics",
      owner: "sales-owner",
      amount: 240000,
      goal_id: "goal-enterprise-new-arr",
      contract_artifact_ref: "crm_contract:contract-001",
      signature_event_ref: "crm.contract.signed"
    },
    {
      id: "rev-expansion-001",
      account: "Beta Freight",
      owner: "sales-owner",
      amount: 60000,
      goal_id: "goal-expansion-arr",
      contract_artifact_ref: "crm_contract:contract-002",
      signature_event_ref: "crm.contract.signed"
    }
  ];

  return {
    schema_version: "forge.crm_goal_commission_workbench.v1",
    workflow_id: workflow?.id || "crm.goal.commission",
    workflow_extension_id: workflow?.workflow_extension_id || "crm_goal_commission_settlement",
    state_owner: "forge_workflow_runtime",
    state_source: WORKBENCH_STATE_SOURCE,
    local_state_allowed: false,
    action_id: action?.id || "crm.settle-goal-commission",
    contract_id: action?.contract_id || "crm.commercial.goal_commission.executor",
    goal_targets: goalTargets,
    revenue_events: revenueEvents,
    commission_statements: [
      {
        id: "statement-2026-q3-sales-owner",
        period: "2026-Q3",
        owner: "sales-owner",
        recognized_revenue_amount: 300000,
        commission_statement_amount: 24000,
        payout_allowed: false,
        payout_blocked_reason: "finance approval required before payout",
        artifact_type: "crm_commission_statement"
      }
    ],
    audit_reports: [
      {
        id: "compensation-audit-2026-q3",
        artifact_type: "crm_compensation_audit_report",
        missing_lineage_count: 0,
        state_owner: "forge_workflow_runtime"
      }
    ],
    validation_gates: [
      "goal attainment and commission settlement require revenue event lineage",
      "commission payout remains blocked until Forge approval"
    ]
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
      id: "crm.classify-lead",
      label: "Classify lead",
      surface_id: "crm.relationship-graph",
      contract_id: "crm.lead.classifier.executor",
      requires_permission: "crm.ai.recommend",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.lead.classifier.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.inspect-observability",
      label: "Inspect observability",
      surface_id: "crm.system-map",
      contract_id: "crm.observability.inspector.executor",
      requires_permission: "crm.observability.inspect",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.observability.inspector.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.generate-executive-report",
      label: "Generate executive report",
      surface_id: "crm.ai-workbench",
      contract_id: "crm.analytics.executive_report.executor",
      requires_permission: "crm.observability.inspect",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.analytics.executive_report.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.generate-readiness-package",
      label: "Generate readiness package",
      surface_id: "crm.system-map",
      contract_id: "crm.operating.readiness.executor",
      requires_permission: "crm.observability.inspect",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.operating.readiness.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.run-enterprise-journey",
      label: "Run enterprise journey",
      surface_id: "crm.system-map",
      contract_id: "crm.enterprise.journey.executor",
      requires_permission: "crm.workflow.mutate",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.enterprise.journey.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.orchestrate-subworkflows",
      label: "Orchestrate subworkflows",
      surface_id: "crm.system-map",
      contract_id: "crm.workflow.subworkflow_orchestrator.executor",
      requires_permission: "crm.workflow.mutate",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.workflow.subworkflow_orchestrator.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.design-workflow-automation",
      label: "Design workflow automation",
      surface_id: "crm.system-map",
      contract_id: "crm.workflow.automation_designer.executor",
      requires_permission: "crm.workflow.mutate",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.workflow.automation_designer.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
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
      id: "crm.enrich-relationship-profile",
      label: "Enrich relationship profile",
      surface_id: "crm.relationship-graph",
      contract_id: "crm.relationship.profile_enrichment.executor",
      requires_permission: "crm.workflow.mutate",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.relationship.profile_enrichment.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.move-pipeline-stage",
      label: "Move pipeline stage",
      surface_id: "crm.pipeline-kanban",
      contract_id: "crm.pipeline.stage_move.executor",
      requires_permission: "crm.workflow.mutate",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.pipeline.stage_move.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
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
      id: "crm.review-followup-forecast",
      label: "Review follow-up forecast",
      surface_id: "crm.commercial-command",
      contract_id: "crm.commercial.followup_forecast.executor",
      requires_permission: "crm.workflow.mutate",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.commercial.followup_forecast.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.review-forecast",
      label: "Review forecast",
      surface_id: "crm.commercial-command",
      contract_id: "crm.commercial.forecast_review.executor",
      requires_permission: "crm.workflow.mutate",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.commercial.forecast_review.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.settle-goal-commission",
      label: "Settle goals and commissions",
      surface_id: "crm.commercial-command",
      contract_id: "crm.commercial.goal_commission.executor",
      requires_permission: "crm.workflow.mutate",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.commercial.goal_commission.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.manage-account",
      label: "Manage account",
      surface_id: "crm.commercial-command",
      contract_id: "crm.commercial.account_management.executor",
      requires_permission: "crm.workflow.mutate",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.commercial.account_management.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.manage-contract-signature",
      label: "Manage contract signature",
      surface_id: "crm.commercial-command",
      contract_id: "crm.commercial.contract_signature.executor",
      requires_permission: "crm.workflow.mutate",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.commercial.contract_signature.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.plan-project-handoff",
      label: "Plan project handoff",
      surface_id: "crm.commercial-command",
      contract_id: "crm.operations.project_handoff.executor",
      requires_permission: "crm.workflow.mutate",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.operations.project_handoff.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
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
      id: "crm.record-document-approval",
      label: "Record approval",
      surface_id: "crm.document-queue",
      contract_id: "crm.document.approval.executor",
      requires_permission: "crm.workflow.mutate",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.document.approval.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.manage-document-library",
      label: "Manage document library",
      surface_id: "crm.document-queue",
      contract_id: "crm.document.library.executor",
      requires_permission: "crm.workflow.mutate",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.document.library.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
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
      id: "crm.run-area-copilot",
      label: "Run area copilots",
      surface_id: "crm.ai-workbench",
      contract_id: "crm.ai.area_copilot.executor",
      requires_permission: "crm.ai.recommend",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.ai.area_copilot.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.run-work-queue",
      label: "Run work queue",
      surface_id: "crm.work-queue",
      contract_id: "crm.queue.orchestrator.executor",
      requires_permission: "crm.workflow.mutate",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.queue.orchestrator.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.generate-design-system",
      label: "Generate design system",
      surface_id: "crm.design-system",
      contract_id: "crm.design_system.executor",
      requires_permission: "crm.observability.inspect",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.design_system.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.prepare-memory-promotion",
      label: "Prepare memory promotion",
      surface_id: "crm.ai-workbench",
      contract_id: "crm.memory.promotion.executor",
      requires_permission: "crm.ai.recommend",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.memory.promotion.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.evolve-workflow",
      label: "Evolve CRM workflow",
      surface_id: "crm.ai-workbench",
      contract_id: "crm.workflow.evolution.executor",
      requires_permission: "crm.workflow.mutate",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.workflow.evolution.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.normalize-channel-intake",
      label: "Normalize channel intake",
      surface_id: "crm.support-queue",
      contract_id: "crm.support.channel_intake.executor",
      requires_permission: "crm.omnichannel.ingest",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.support.channel_intake.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.run-omnichannel-center",
      label: "Run omnichannel center",
      surface_id: "crm.support-queue",
      contract_id: "crm.support.omnichannel_center.executor",
      requires_permission: "crm.omnichannel.ingest",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.support.omnichannel_center.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.ingest-omnichannel-message",
      label: "Ingest omnichannel message",
      surface_id: "crm.support-queue",
      contract_id: "crm.support.omnichannel_message.executor",
      requires_permission: "crm.omnichannel.ingest",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.support.omnichannel_message.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.compose-support-reply",
      label: "Compose support reply",
      surface_id: "crm.support-queue",
      contract_id: "crm.support.reply_composer.executor",
      requires_permission: "crm.omnichannel.ingest",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.support.reply_composer.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.triage-ticket-sla",
      label: "Triage ticket SLA",
      surface_id: "crm.support-queue",
      contract_id: "crm.support.ticket_sla.executor",
      requires_permission: "crm.omnichannel.ingest",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.support.ticket_sla.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.automate-campaign",
      label: "Automate campaign",
      surface_id: "crm.marketing-calendar",
      contract_id: "crm.marketing.campaign_automation.executor",
      requires_permission: "crm.workflow.mutate",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.marketing.campaign_automation.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.run-lead-nurture",
      label: "Run lead nurture",
      surface_id: "crm.marketing-calendar",
      contract_id: "crm.marketing.lead_nurture.executor",
      requires_permission: "crm.workflow.mutate",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.marketing.lead_nurture.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.build-marketing-segment",
      label: "Build segment",
      surface_id: "crm.marketing-calendar",
      contract_id: "crm.marketing.segment_builder.executor",
      requires_permission: "crm.workflow.mutate",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.marketing.segment_builder.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.publish-landing-page",
      label: "Publish landing page",
      surface_id: "crm.marketing-calendar",
      contract_id: "crm.marketing.landing_page.executor",
      requires_permission: "crm.workflow.mutate",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.marketing.landing_page.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
    },
    {
      id: "crm.capture-form-submission",
      label: "Capture form submission",
      surface_id: "crm.marketing-calendar",
      contract_id: "crm.marketing.form_capture.executor",
      requires_permission: "crm.workflow.mutate",
      mutates_workflow: true,
      command_template: ["forge", "addons", "execute-executor", "--addon", "forge.addon.crm", "--contract", "crm.marketing.form_capture.executor", "--worker", "<worker-id>", "--task", "<task-ref>", "--input", "<json>", "--context", "<json>", "--output", "json"]
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

function actionInvocationPlans(actionList) {
  return {
    schema_version: "forge.crm_web_action_invocation_plans.v1",
    state_owner: "forge_workflow_runtime",
    local_mutation_allowed: false,
    plans: actionList.map((action) => ({
      action_id: action.id,
      label: action.label,
      surface_id: action.surface_id,
      contract_id: action.contract_id,
      required_permission: action.requires_permission,
      selected_command: action.command_template,
      permission_gate: {
        status: "requires_forge_permission",
        permission: action.requires_permission,
        approval_owner: "forge_permission_policy"
      },
      operation_plan: [
        {
          id: "check_addon_permission",
          title: "Check Addon permission",
          owner: "forge.permissions",
          evidence: action.requires_permission
        },
        {
          id: "execute_runtime_contract",
          title: "Execute runtime contract",
          owner: "forge.addons.runtime",
          evidence: action.contract_id
        },
        {
          id: "promote_result_to_workflow",
          title: "Promote result to workflow",
          owner: "forge.workflow.runtime",
          evidence: "artifact and event promotion"
        },
        {
          id: "refresh_operating_snapshot",
          title: "Refresh operating snapshot",
          owner: "forge.addon.crm",
          evidence: "crm.operating.snapshot.executor"
        }
      ],
      output_policy: {
        promote_result_to_workflow: true,
        browser_local_state_write: false,
        refresh_source: WORKBENCH_STATE_SOURCE
      }
    }))
  };
}

function workflowCadences(workflows, actionList) {
  const workflowIds = new Set(workflows.map((workflow) => workflow.id));
  const actionById = new Map(actionList.map((action) => [action.id, action]));
  const specs = [
    {
      id: "cadence.commercial.followup_forecast",
      title: "Commercial follow-up and forecast review",
      workflow_id: "crm.followup.forecast",
      workflow_extension_id: "crm_followup_sequence",
      surface_id: "crm.commercial-command",
      cadence_kind: "wait_state_schedule",
      schedule_source: "Forge wait states for follow-up due dates, forecast reviews, goals and commissions",
      trigger_id: "crm.schedule.followup_due",
      event_type: "crm.followup",
      due_state: "waiting_due_date",
      action_id: "crm.review-followup-forecast",
      owner_role: "commercial.ops"
    },
    {
      id: "cadence.commercial.forecast_review",
      title: "Commercial forecast review",
      workflow_id: "crm.forecast.review",
      workflow_extension_id: "crm_forecast_review",
      surface_id: "crm.commercial-command",
      cadence_kind: "forecast_review_schedule",
      schedule_source: "Forge forecast review waits and pipeline snapshot checkpoints",
      trigger_id: "crm.schedule.forecast_review_due",
      event_type: "crm.forecast",
      due_state: "forecast_review_due",
      action_id: "crm.review-forecast",
      owner_role: "revenue.ops"
    },
    {
      id: "cadence.commercial.contract_renewal",
      title: "Contract signature and renewal follow-up",
      workflow_id: "crm.contract.signature",
      workflow_extension_id: "crm_contract_lifecycle",
      surface_id: "crm.commercial-command",
      cadence_kind: "renewal_schedule",
      schedule_source: "Forge contract workflow renewal waits and signature checkpoints",
      trigger_id: "crm.schedule.contract_renewal_due",
      event_type: "crm.contract",
      due_state: "renewal_wait",
      action_id: "crm.manage-contract-signature",
      owner_role: "legal.ops"
    },
    {
      id: "cadence.support.ticket_sla",
      title: "Ticket SLA escalation clock",
      workflow_id: "crm.ticket.sla",
      workflow_extension_id: "crm_ticket_sla",
      surface_id: "crm.support-queue",
      cadence_kind: "sla_wait_state",
      schedule_source: "Forge SLA wait states and escalation events",
      trigger_id: "crm.schedule.ticket_sla_due",
      event_type: "crm.sla",
      due_state: "sla_escalation",
      action_id: "crm.triage-ticket-sla",
      owner_role: "support.lead"
    },
    {
      id: "cadence.marketing.campaign_launch",
      title: "Campaign launch and reporting cadence",
      workflow_id: "crm.campaign.lifecycle",
      workflow_extension_id: "crm_campaign_lifecycle",
      surface_id: "crm.marketing-calendar",
      cadence_kind: "campaign_schedule",
      schedule_source: "Forge campaign schedule events after approval gates",
      trigger_id: "crm.schedule.campaign_launch_due",
      event_type: "crm.campaign",
      due_state: "scheduled",
      action_id: "crm.automate-campaign",
      owner_role: "marketing.ops"
    },
    {
      id: "cadence.marketing.lead_nurture",
      title: "Lead nurture wait-step cadence",
      workflow_id: "crm.lead.nurture",
      workflow_extension_id: "crm_lead_nurture",
      surface_id: "crm.marketing-calendar",
      cadence_kind: "nurture_wait_state",
      schedule_source: "Forge wait nodes for segment-backed nurture steps",
      trigger_id: "crm.schedule.nurture_step_due",
      event_type: "crm.nurture",
      due_state: "wait_step",
      action_id: "crm.run-lead-nurture",
      owner_role: "lifecycle.marketing"
    },
    {
      id: "cadence.operations.project_handoff",
      title: "Project handoff unblock review",
      workflow_id: "crm.project.handoff",
      workflow_extension_id: "crm_project_handoff",
      surface_id: "crm.commercial-command",
      cadence_kind: "blocked_wait_review",
      schedule_source: "Forge task waits and handoff checkpoints for internal operations",
      trigger_id: "crm.schedule.project_handoff_due",
      event_type: "crm.task",
      due_state: "blocked_wait",
      action_id: "crm.plan-project-handoff",
      owner_role: "delivery.ops"
    }
  ];

  return {
    schema_version: "forge.crm_workflow_cadences.v1",
    state_owner: "forge_workflow_runtime",
    local_scheduler_allowed: false,
    event_channel_id: "crm.schedule",
    trigger_transport: "cron",
    cadences: specs
      .filter((spec) => workflowIds.has(spec.workflow_id) && actionById.has(spec.action_id))
      .map((spec) => {
        const action = actionById.get(spec.action_id);
        return {
          ...spec,
          contract_id: action.contract_id,
          required_permission: action.requires_permission,
          operation_plan: [
            {
              id: "detect_due_wait_state",
              title: "Detect due wait state",
              owner: "forge.workflow.scheduler",
              evidence: spec.due_state
            },
            {
              id: "emit_forge_schedule_event",
              title: "Emit Forge schedule event",
              owner: "forge.event_engine",
              evidence: spec.trigger_id
            },
            {
              id: "execute_runtime_contract",
              title: "Execute runtime contract",
              owner: "forge.addons.runtime",
              evidence: action.contract_id
            },
            {
              id: "promote_artifacts_and_events",
              title: "Promote artifacts and events",
              owner: "forge.workflow.runtime",
              evidence: spec.event_type
            },
            {
              id: "refresh_operating_snapshot",
              title: "Refresh operating snapshot",
              owner: "forge.addon.crm",
              evidence: "crm.operating.snapshot.executor"
            }
          ],
          output_policy: {
            promote_schedule_result_to_workflow: true,
            browser_local_timer: false,
            external_scheduler_required: false,
            refresh_source: WORKBENCH_STATE_SOURCE
          }
        };
      })
  };
}

export function buildCrmWebAppSnapshot(options = {}) {
  const tenantId = slug(options.tenant_id || options.tenant || "default");
  const pack = buildCrmWorkflowPack({ tenant_id: tenantId });
  const model = buildCrmOperatingModel({ tenant_id: tenantId, workflows: pack.workflows, coverage: pack.coverage });
  const workflows = pack.workflows;
  const actionList = actions();
  const documentQueueSnapshot = documentQueue(workflows);
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
    document_queue: documentQueueSnapshot,
    operational_workbench: buildOperationalWorkbench(workflows, actionList, documentQueueSnapshot),
    workflow_evolution_workbench: workflowEvolutionWorkbench(workflows, actionList),
    enterprise_journey_workbench: enterpriseJourneyWorkbench(workflows, actionList),
    subworkflow_orchestration_workbench: subworkflowOrchestrationWorkbench(workflows, actionList),
    workflow_automation_designer_workbench: workflowAutomationDesignerWorkbench(workflows, actionList),
    executive_reporting_workbench: executiveReportingWorkbench(workflows, actionList),
    goal_commission_workbench: goalCommissionWorkbench(workflows, actionList),
    actions: actionList,
    action_invocation_plans: actionInvocationPlans(actionList),
    workflow_cadences: workflowCadences(workflows, actionList),
    design_system: {
      schema_version: "forge.crm_design_system.v1",
      workflow_id: "crm.design.system",
      contract_id: "crm.design_system.executor",
      design_system: "penpot_open_design_inspired_tokens",
      state_source: WORKBENCH_STATE_SOURCE,
      direct_browser_persistence: false,
      artifact_types: ["crm_design_system", "crm_design_token_manifest", "crm_ui_component_catalog"],
      event_types: ["crm.design.system_generated", "crm.design.tokens_published"],
      tokens: DESIGN_TOKENS,
      components: DESIGN_SYSTEM_COMPONENTS,
      action_id: "crm.generate-design-system"
    },
    design_tokens: DESIGN_TOKENS,
    observability: model.observability
  };
}
