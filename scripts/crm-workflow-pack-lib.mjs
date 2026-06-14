const REQUIRED_SCOPE = {
  relationship: ["lead", "contact", "company", "opportunity", "pipeline_kanban", "multiple_funnels", "complete_history", "unified_timeline"],
  commercial: ["proposal", "contract", "signature", "follow_up", "forecast", "goal", "commission", "account_management"],
  support: ["ticket", "sla", "chat", "whatsapp", "telegram", "email", "omnichannel_center", "approved_channel_adapter", "message_normalization"],
  marketing: ["campaign", "segmentation", "automation", "landing_page", "form", "lead_nurturing"],
  operations: ["project", "task", "approval", "document", "internal_flow", "team_handoff", "work_queue", "ownership", "waiting_state"],
  user_experience: ["tui", "web_interface", "workflow_visualization", "knowledge_graph", "document_management", "design_system", "design_tokens"],
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
    runtime_contracts: [
      "crm.relationship.timeline.executor",
      "crm.relationship.profile_enrichment.executor",
      "crm.lead.classifier.executor",
      "crm.marketing.form_capture.executor"
    ],
    artifacts: ["crm_timeline_snapshot", "crm_relationship_profile", "crm_enrichment_record", "crm_ai_recommendation", "crm_lead_capture"],
    events: [
      "crm.lead.created",
      "crm.lead.classified",
      "crm.contact.updated",
      "crm.contact.enriched",
      "crm.company.enriched",
      "crm.relationship.recorded",
      "crm.relationship.profile_updated"
    ],
    memory_scopes: ["organization", "project"],
    permissions: ["crm.workflow.mutate", "crm.ai.recommend"],
    views: ["crm.relationship-graph"],
    validation_gates: ["classification evidence present", "state transition has owner and reason"]
  },
  {
    id: "crm.relationship.profile_enrichment",
    title: "Contact and company profile enrichment",
    domain: "relationship",
    workflow_extension_id: "crm_relationship_profile_enrichment",
    object_types: ["contact", "company", "complete_history", "unified_timeline", "relationship_profile", "enrichment_record"],
    states: ["profile_detected", "sources_attached", "signals_scored", "approval_wait", "profile_promoted", "rework_required"],
    transitions: [
      ["profile_detected", "sources_attached", "approved enrichment sources attached"],
      ["sources_attached", "signals_scored", "relationship signals normalized"],
      ["signals_scored", "approval_wait", "profile update package generated"],
      ["approval_wait", "profile_promoted", "Forge workflow approval recorded"],
      ["approval_wait", "rework_required", "missing source lineage or low confidence"],
      ["rework_required", "sources_attached", "rework evidence attached"]
    ],
    runtime_contracts: ["crm.relationship.profile_enrichment.executor", "crm.relationship.timeline.executor"],
    depends_on_workflows: ["crm.lead.lifecycle"],
    artifacts: ["crm_relationship_profile", "crm_enrichment_record", "crm_timeline_snapshot"],
    events: ["crm.contact.enriched", "crm.company.enriched", "crm.relationship.profile_updated"],
    memory_scopes: ["organization", "project", "processing"],
    permissions: ["crm.workflow.mutate", "crm.ai.recommend"],
    views: ["crm.relationship-graph"],
    validation_gates: [
      "enrichment sources are attached as Forge artifacts",
      "relationship signals cite source lineage",
      "profile changes require Forge workflow approval before promotion"
    ]
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
    runtime_contracts: [
      "crm.relationship.timeline.executor",
      "crm.pipeline.stage_move.executor",
      "crm.lead.classifier.executor",
      "crm.ai.operating_copilot.executor",
      "crm.proposal.generator.executor"
    ],
    artifacts: ["crm_pipeline_board", "crm_stage_change", "crm_timeline_snapshot", "crm_forecast_report", "crm_report"],
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
    runtime_contracts: ["crm.document.generator.executor", "crm.document.validator", "crm.commercial.contract_signature.executor"],
    artifacts: ["crm_contract", "crm_document", "crm_signature_receipt", "crm_renewal_plan"],
    events: ["crm.document.generated", "crm.contract.reviewed", "crm.contract.signed", "crm.contract.renewal_scheduled"],
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
    runtime_contracts: ["crm.commercial.followup_forecast.executor"],
    artifacts: ["crm_followup_plan", "crm_forecast_report", "crm_commission_record", "crm_report", "crm_email"],
    events: ["crm.followup.scheduled", "crm.forecast.reviewed", "crm.goal.progress_reviewed", "crm.commission.accrued"],
    memory_scopes: ["organization"],
    permissions: ["crm.workflow.mutate"],
    views: ["crm.commercial-command"],
    validation_gates: ["scheduled wait visible", "forecast and commission evidence attached"]
  },
  {
    id: "crm.account.management",
    title: "Account health, renewal and expansion management",
    domain: "commercial",
    workflow_extension_id: "crm_account_management",
    object_types: ["account_management", "account", "renewal", "expansion", "task"],
    states: ["account_review_requested", "health_reviewed", "success_plan_active", "renewal_planned", "expansion_identified", "risk_mitigation"],
    transitions: [
      ["account_review_requested", "health_reviewed", "health signals attached"],
      ["health_reviewed", "success_plan_active", "success plan tasks created"],
      ["success_plan_active", "renewal_planned", "renewal date recorded"],
      ["success_plan_active", "expansion_identified", "expansion forecast attached"],
      ["health_reviewed", "risk_mitigation", "risk flags require owner action"]
    ],
    runtime_contracts: ["crm.commercial.account_management.executor"],
    artifacts: ["crm_account_plan", "crm_health_report", "crm_forecast_report", "crm_task_plan"],
    events: ["crm.account.health_reviewed", "crm.account.renewal_planned", "crm.account.expansion_identified", "crm.task.created"],
    memory_scopes: ["organization", "project"],
    permissions: ["crm.workflow.mutate"],
    views: ["crm.commercial-command"],
    validation_gates: ["account owner visible", "renewal state explicit", "expansion forecast event-backed"]
  },
  {
    id: "crm.omnichannel.channel_intake",
    title: "Approved omnichannel channel intake",
    domain: "support",
    workflow_extension_id: "crm_omnichannel_channel_intake",
    object_types: ["approved_channel_adapter", "message_normalization", "chat", "whatsapp", "telegram", "email", "omnichannel_center"],
    states: ["adapter_event_received", "authorization_check", "normalized", "authorization_blocked", "ready_for_ticket"],
    transitions: [
      ["adapter_event_received", "authorization_check", "channel and provider identified"],
      ["authorization_check", "normalized", "approved adapter policy matched"],
      ["authorization_check", "authorization_blocked", "adapter missing approval"],
      ["normalized", "ready_for_ticket", "normalized message artifact attached"]
    ],
    runtime_contracts: ["crm.support.channel_intake.executor"],
    artifacts: ["crm_channel_intake", "crm_channel_receipt", "crm_message_thread"],
    events: ["crm.channel.authorized", "crm.channel.authorization_blocked", "crm.message.normalized"],
    memory_scopes: ["organization", "project"],
    permissions: ["crm.omnichannel.ingest"],
    views: ["crm.support-queue"],
    validation_gates: [
      "approved channel adapter required before ticket creation",
      "normalized message artifact required before SLA workflow",
      "channel intake must not persist CRM state outside Forge"
    ]
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
    runtime_contracts: [
      "crm.support.omnichannel_message.executor",
      "crm.support.ticket_sla.executor",
      "crm.omnichannel.handoff"
    ],
    artifacts: ["crm_message_thread", "crm_channel_receipt", "crm_support_summary", "crm_handoff_record"],
    events: ["crm.message.received", "crm.ticket.created", "crm.sla.escalated", "crm.handoff.delivered"],
    memory_scopes: ["organization", "project"],
    permissions: ["crm.omnichannel.ingest"],
    views: ["crm.support-queue"],
    validation_gates: ["channel receipt attached", "SLA wait state explicit", "handoff receipt attached"],
    depends_on_workflows: ["crm.omnichannel.channel_intake"]
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
    runtime_contracts: [
      "crm.marketing.campaign_automation.executor",
      "crm.marketing.segment_builder.executor",
      "crm.marketing.landing_page.executor",
      "crm.marketing.form_capture.executor",
      "crm.document.generator.executor",
      "crm.document.validator"
    ],
    depends_on_workflows: ["crm.marketing.segment_builder"],
    artifacts: [
      "crm_campaign",
      "crm_segment_definition",
      "crm_segment_audience",
      "crm_segment",
      "crm_automation_plan",
      "crm_email",
      "crm_landing_page",
      "crm_form_schema",
      "crm_form_submission",
      "crm_consent_record",
      "crm_presentation",
      "crm_report"
    ],
    events: [
      "crm.document.generated",
      "crm.segment.ready_for_campaign",
      "crm.campaign.created",
      "crm.campaign.scheduled",
      "crm.landing_page.composed",
      "crm.landing_page.approval_requested",
      "crm.form.schema_published",
      "crm.form.submitted",
      "crm.lead.created",
      "crm.nurture.step_due",
      "crm.campaign.reported"
    ],
    memory_scopes: ["organization", "project"],
    permissions: ["crm.workflow.mutate", "crm.document.generate"],
    views: ["crm.marketing-calendar"],
    validation_gates: ["campaign artifacts approved", "schedule state visible"]
  },
  {
    id: "crm.marketing.segment_builder",
    title: "Marketing segment definition and audience selection",
    domain: "marketing",
    workflow_extension_id: "crm_marketing_segment_builder",
    object_types: ["segment", "segmentation", "audience", "lead", "automation"],
    states: ["request_received", "criteria_defined", "audience_selected", "approval_wait", "ready_for_campaign", "rework_required"],
    transitions: [
      ["request_received", "criteria_defined", "segment request normalized"],
      ["criteria_defined", "audience_selected", "audience source filtered by policy"],
      ["audience_selected", "approval_wait", "segment definition and audience artifacts attached"],
      ["approval_wait", "ready_for_campaign", "Forge workflow approval recorded"],
      ["approval_wait", "rework_required", "missing lineage or low confidence audience"],
      ["rework_required", "criteria_defined", "selection policy revised"]
    ],
    runtime_contracts: ["crm.marketing.segment_builder.executor", "crm.ai.area_copilot.executor"],
    depends_on_workflows: ["crm.lead.lifecycle", "crm.relationship.profile_enrichment"],
    artifacts: ["crm_segment_definition", "crm_segment_audience", "crm_segment", "crm_automation_plan"],
    events: ["crm.segment.defined", "crm.segment.audience_selected", "crm.segment.ready_for_campaign"],
    memory_scopes: ["organization", "project", "processing"],
    permissions: ["crm.workflow.mutate", "crm.ai.recommend"],
    views: ["crm.marketing-calendar"],
    validation_gates: [
      "segment definition cites Forge relationship and lead evidence",
      "segment membership changes require Forge workflow approval before campaign use",
      "audience selection is attached as Forge artifacts before campaign automation"
    ]
  },
  {
    id: "crm.marketing.landing_page",
    title: "Landing page and form schema publishing",
    domain: "marketing",
    workflow_extension_id: "crm_marketing_landing_page",
    object_types: ["landing_page", "form", "form_schema", "automation", "lead_nurturing"],
    states: ["brief", "content_drafted", "form_schema_ready", "approval_wait", "published_artifact", "running", "rework_required"],
    transitions: [
      ["brief", "content_drafted", "campaign brief and page content attached"],
      ["content_drafted", "form_schema_ready", "form schema artifact generated"],
      ["form_schema_ready", "approval_wait", "publication approval requested"],
      ["approval_wait", "published_artifact", "Forge approval recorded"],
      ["published_artifact", "running", "approved page artifact used for form capture"],
      ["approval_wait", "rework_required", "approval or validation returned rework"]
    ],
    runtime_contracts: [
      "crm.marketing.landing_page.executor",
      "crm.marketing.form_capture.executor",
      "crm.document.validator"
    ],
    depends_on_workflows: ["crm.campaign.lifecycle", "crm.lead.nurture"],
    artifacts: ["crm_landing_page", "crm_form_schema", "crm_automation_plan", "crm_consent_record"],
    events: [
      "crm.landing_page.composed",
      "crm.landing_page.approval_requested",
      "crm.landing_page.ready_for_publish",
      "crm.form.schema_published",
      "crm.form.submitted"
    ],
    memory_scopes: ["organization", "project"],
    permissions: ["crm.workflow.mutate", "crm.document.generate"],
    views: ["crm.marketing-calendar"],
    validation_gates: [
      "landing page artifact has Forge lineage",
      "form schema is published before form capture",
      "external publication blocked until Forge approval is recorded"
    ]
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
    runtime_contracts: ["crm.marketing.campaign_automation.executor", "crm.lead.classifier.executor", "crm.omnichannel.handoff"],
    artifacts: ["crm_automation_plan", "crm_email", "crm_ai_recommendation"],
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
    runtime_contracts: ["crm.operations.project_handoff.executor", "crm.omnichannel.handoff"],
    artifacts: ["crm_project_plan", "crm_task_plan", "crm_handoff_record", "crm_report"],
    events: ["crm.project.handoff_requested", "crm.task.created", "crm.task.blocked", "crm.project.accepted"],
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
    runtime_contracts: ["crm.document.generator.executor", "crm.document.validator", "crm.document.approval.executor"],
    artifacts: ["crm_document", "crm_presentation", "crm_approval_record", "crm_handoff_record"],
    events: [
      "crm.document.generated",
      "crm.document.submitted",
      "crm.document.validated",
      "crm.document.approved",
      "crm.document.rework_required",
      "crm.document.delivery_unblocked"
    ],
    memory_scopes: ["project", "processing"],
    permissions: ["crm.document.generate"],
    views: ["crm.document-queue"],
    validation_gates: ["approval actor recorded", "approval decision lineage recorded", "lineage points to Forge artifact"]
  },
  {
    id: "crm.work.queue.orchestration",
    title: "Cross-domain work queue orchestration",
    domain: "operations",
    workflow_extension_id: "crm_work_queue_orchestration",
    object_types: [
      "work_queue",
      "approval",
      "document",
      "task",
      "internal_flow",
      "team_handoff",
      "ownership",
      "waiting_state",
      "sla",
      "campaign",
      "risk_analysis"
    ],
    states: [
      "queue_snapshot_requested",
      "queue_snapshot_ready",
      "assignment_planned",
      "approval_wait",
      "work_in_progress",
      "risk_review_wait",
      "closed"
    ],
    transitions: [
      ["queue_snapshot_requested", "queue_snapshot_ready", "Forge queue evidence collected"],
      ["queue_snapshot_ready", "assignment_planned", "owners and next actions proposed"],
      ["assignment_planned", "approval_wait", "state mutation requires approval"],
      ["approval_wait", "work_in_progress", "approved queue action started"],
      ["assignment_planned", "risk_review_wait", "SLA or ownership risk flagged"],
      ["work_in_progress", "closed", "queue item resolved with artifact or event evidence"]
    ],
    runtime_contracts: ["crm.queue.orchestrator.executor", "crm.observability.inspector.executor"],
    depends_on_workflows: [
      "crm.proposal.approval",
      "crm.ticket.sla",
      "crm.document.approval",
      "crm.campaign.lifecycle",
      "crm.project.handoff",
      "crm.contract.signature"
    ],
    artifacts: ["crm_work_queue_snapshot", "crm_queue_assignment_plan", "crm_queue_sla_risk_report"],
    events: ["crm.queue.snapshot_generated", "crm.queue.assignment_planned", "crm.queue.risk_flagged"],
    memory_scopes: ["organization", "project", "processing"],
    permissions: ["crm.workflow.mutate", "crm.ai.recommend", "crm.observability.inspect"],
    views: ["crm.work-queue", "crm.system-map", "crm.support-queue", "crm.document-queue"],
    validation_gates: [
      "queue actions require Forge workflow approval before mutation",
      "every queue item cites artifact or event evidence",
      "ownership gaps and SLA risks are returned to work before closure"
    ]
  },
  {
    id: "crm.design.system",
    title: "CRM design system and UI component catalog",
    domain: "user_experience",
    workflow_extension_id: "crm_design_system",
    object_types: [
      "tui",
      "web_interface",
      "workflow_visualization",
      "knowledge_graph",
      "document_management",
      "design_system",
      "design_tokens",
      "ui_component_catalog"
    ],
    states: ["brief_collected", "tokens_generated", "components_cataloged", "artifact_published", "adopted_by_surfaces", "rework_required"],
    transitions: [
      ["brief_collected", "tokens_generated", "brand and operating context attached"],
      ["tokens_generated", "components_cataloged", "token manifest validates"],
      ["components_cataloged", "artifact_published", "component catalog attached"],
      ["artifact_published", "adopted_by_surfaces", "web and TUI surfaces reference Forge artifacts"],
      ["artifact_published", "rework_required", "token or component evidence missing"]
    ],
    runtime_contracts: ["crm.design_system.executor"],
    artifacts: ["crm_design_system", "crm_design_token_manifest", "crm_ui_component_catalog"],
    events: ["crm.design.system_generated", "crm.design.tokens_published"],
    memory_scopes: ["organization", "project"],
    permissions: ["crm.observability.inspect"],
    views: ["crm.design-system", "crm.system-map"],
    validation_gates: [
      "design tokens are published as Forge artifacts before UI consumption",
      "components cite workflow artifact state sources",
      "browser rendering does not create CRM-local design state"
    ]
  },
  {
    id: "crm.operational.observability",
    title: "Operational observability, audit and lineage",
    domain: "operations",
    workflow_extension_id: "crm_operational_observability",
    object_types: ["audit", "lineage", "cost", "event", "log", "metric", "state_inspection"],
    states: ["inspection_requested", "context_collected", "audit_reported", "risk_review_wait", "remediation_started", "closed"],
    transitions: [
      ["inspection_requested", "context_collected", "Forge observability context collected"],
      ["context_collected", "audit_reported", "audit, lineage, cost and metric artifacts attached"],
      ["audit_reported", "risk_review_wait", "attention required by warning logs or missing events"],
      ["risk_review_wait", "remediation_started", "owner action started through Forge workflow"],
      ["audit_reported", "closed", "inspection accepted"]
    ],
    runtime_contracts: ["crm.observability.inspector.executor"],
    artifacts: ["crm_audit_report", "crm_lineage_map", "crm_cost_report", "crm_metric_snapshot"],
    events: ["crm.observability.inspected", "crm.audit.reported", "crm.cost.reviewed", "crm.metric.reviewed"],
    memory_scopes: ["organization", "project"],
    permissions: ["crm.observability.inspect"],
    views: ["crm.system-map"],
    validation_gates: [
      "audit lineage cost metrics and logs sourced from Forge",
      "inspection does not create CRM-local observability state",
      "remediation requires Forge workflow mutation"
    ]
  },
  {
    id: "crm.enterprise.readiness",
    title: "Enterprise CRM operating readiness",
    domain: "operations",
    workflow_extension_id: "crm_enterprise_readiness",
    object_types: ["enterprise_readiness", "user_outcome", "business_runbook", "domain_coverage", "success_criteria"],
    states: ["criteria_collected", "evidence_mapped", "readiness_reported", "rework_required", "operable"],
    transitions: [
      ["criteria_collected", "evidence_mapped", "workflow pack and validation evidence collected"],
      ["evidence_mapped", "readiness_reported", "user-facing deliverables mapped to Forge evidence"],
      ["readiness_reported", "operable", "all required domains have workflow artifacts, events and validation gates"],
      ["readiness_reported", "rework_required", "missing domain coverage or external dependency found"],
      ["rework_required", "criteria_collected", "rework reason returned to Forge workflow tasks"]
    ],
    runtime_contracts: ["crm.operating.readiness.executor"],
    artifacts: [
      "crm_operating_readiness_report",
      "crm_user_outcome_manifest",
      "crm_domain_coverage_matrix",
      "crm_business_runbook"
    ],
    events: ["crm.operating.readiness_reported", "crm.outcome.deliverables_mapped"],
    memory_scopes: ["organization", "project"],
    permissions: ["crm.observability.inspect"],
    views: ["crm.system-map"],
    validation_gates: [
      "success criteria mapped to user-facing deliverables",
      "readiness evidence sourced from Forge workflows artifacts events and validation gates",
      "rework reason recorded before any operable claim"
    ]
  },
  {
    id: "crm.enterprise.customer_journey",
    title: "Enterprise customer journey acceptance",
    domain: "operations",
    workflow_extension_id: "crm_enterprise_customer_journey",
    object_types: ["customer_journey", "operating_acceptance", "cross_domain_handoff", "user_outcome", "business_runbook"],
    states: [
      "lead_capture",
      "opportunity",
      "proposal",
      "contract",
      "account",
      "support",
      "handoff",
      "operating_acceptance",
      "rework_required"
    ],
    transitions: [
      ["lead_capture", "opportunity", "qualified lead evidence exists"],
      ["opportunity", "proposal", "opportunity stage evidence exists"],
      ["proposal", "contract", "approved proposal artifact exists"],
      ["contract", "account", "contract signature receipt exists"],
      ["account", "support", "active account support evidence exists"],
      ["support", "handoff", "ticket SLA or resolution evidence exists"],
      ["handoff", "operating_acceptance", "project handoff evidence exists"],
      ["operating_acceptance", "rework_required", "required stage evidence missing"]
    ],
    runtime_contracts: [
      "crm.enterprise.journey.executor",
      "crm.marketing.form_capture.executor",
      "crm.pipeline.stage_move.executor",
      "crm.proposal.generator.executor",
      "crm.commercial.contract_signature.executor",
      "crm.commercial.account_management.executor",
      "crm.support.ticket_sla.executor",
      "crm.operations.project_handoff.executor"
    ],
    depends_on_workflows: [
      "crm.lead.lifecycle",
      "crm.opportunity.pipeline",
      "crm.proposal.approval",
      "crm.contract.signature",
      "crm.account.management",
      "crm.ticket.sla",
      "crm.project.handoff"
    ],
    artifacts: ["crm_enterprise_journey_map", "crm_operating_acceptance_evidence", "crm_cross_domain_handoff_map", "crm_business_runbook"],
    events: ["crm.journey.started", "crm.journey.stage_completed", "crm.journey.acceptance_reported"],
    memory_scopes: ["organization", "project"],
    permissions: ["crm.workflow.mutate", "crm.document.generate", "crm.omnichannel.ingest"],
    views: ["crm.system-map", "crm.commercial-command", "crm.support-queue", "crm.document-queue"],
    validation_gates: [
      "all required customer lifecycle stages have Forge artifact and event evidence",
      "main CRM flow has no external system dependency",
      "cross-domain handoffs preserve workflow and artifact lineage"
    ]
  },
  {
    id: "crm.workflow.evolution",
    title: "Adaptive CRM workflow evolution",
    domain: "ai_automation",
    workflow_extension_id: "crm_workflow_evolution",
    object_types: ["workflow_evolution", "benchmark", "controlled_promotion", "workflow_automation", "risk_analysis"],
    states: ["candidate_scan", "experiment_designed", "benchmark_wait", "promotion_blocked", "promoted", "core_gap_reported"],
    transitions: [
      ["candidate_scan", "experiment_designed", "candidate includes changelog and rollback plan"],
      ["experiment_designed", "benchmark_wait", "Forge benchmark command prepared"],
      ["benchmark_wait", "promotion_blocked", "benchmark evidence missing or below threshold"],
      ["benchmark_wait", "promoted", "benchmark and validation evidence passed"],
      ["experiment_designed", "core_gap_reported", "missing Forge primitive blocks safe experiment"]
    ],
    runtime_contracts: ["crm.workflow.evolution.executor", "crm.observability.inspector.executor"],
    artifacts: [
      "crm_workflow_evolution_plan",
      "crm_evolution_experiment",
      "crm_benchmark_report",
      "crm_promotion_decision",
      "crm_core_gap_report"
    ],
    events: [
      "crm.evolution.candidate_generated",
      "crm.evolution.experiment_designed",
      "crm.evolution.benchmark_reported",
      "crm.evolution.promotion_decision_recorded",
      "crm.core_gap.reported"
    ],
    memory_scopes: ["organization", "project", "processing"],
    permissions: ["crm.observability.inspect", "crm.workflow.mutate"],
    views: ["crm.system-map", "crm.ai-workbench"],
    validation_gates: [
      "experiment candidate includes changelog and rollback plan",
      "promotion is blocked until benchmark evidence passes",
      "Core primitive gaps are reported to forge-core before CRM workaround"
    ]
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
    runtime_contracts: [
      "crm.lead.classifier.executor",
      "crm.ai.operating_copilot.executor",
      "crm.ai.area_copilot.executor",
      "crm.memory.promotion.executor",
      "crm.proposal.generator.executor"
    ],
    artifacts: ["crm_area_copilot_brief", "crm_ai_recommendation", "crm_risk_analysis", "crm_report", "crm_knowledge_summary", "crm_memory_promotion_request"],
    events: [
      "crm.ai.area_copilot_generated",
      "crm.ai.recommendation_generated",
      "crm.ai.risk_flagged",
      "crm.next_action.approved",
      "crm.memory.knowledge_curated",
      "crm.memory.promotion_requested"
    ],
    memory_scopes: ["organization", "project", "processing"],
    permissions: ["crm.ai.recommend"],
    views: ["crm.ai-workbench"],
    validation_gates: [
      "recommendation includes evidence",
      "specialized copilot recommendations are scoped by area and cite Forge evidence",
      "state mutation requires workflow approval",
      "memory promotion uses Forge memory governance"
    ]
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

function workflowsForView(workflows, viewId) {
  return workflows.filter((workflow) => workflow.views.includes(viewId));
}

function operatorSurface(workflows, viewId, surfaceType, title) {
  const linkedWorkflows = workflowsForView(workflows, viewId);
  return {
    view_id: viewId,
    surface_type: surfaceType,
    title,
    state_source: "forge_workflow_artifacts_and_events",
    workflow_ids: linkedWorkflows.map((workflow) => workflow.id),
    lanes: unique(linkedWorkflows.flatMap((workflow) => workflow.states)),
    artifact_types: unique(linkedWorkflows.flatMap((workflow) => workflow.artifacts)).sort(),
    event_types: unique(linkedWorkflows.flatMap((workflow) => workflow.events)).sort(),
    mutation_policy: {
      state_owner: "forge_workflow_runtime",
      direct_external_mutation: false,
      allowed_mutation_path: "Forge workflow command, runtime contract or approved event"
    }
  };
}

export function buildCrmOperatingModel(options = {}) {
  const tenantId = slug(options.tenant_id || options.tenant || "default");
  const workflows = (options.workflows || WORKFLOWS.map(workflowWithPolicies)).map((workflow) =>
    workflow.forge_state_owner ? workflow : workflowWithPolicies(workflow)
  );
  const coverage = options.coverage || scopeCoverage(workflows);
  const businessModules = {};

  for (const [domain, domainCoverage] of Object.entries(coverage)) {
    const domainWorkflows = workflows.filter(
      (workflow) =>
        workflow.domain === domain ||
        workflow.object_types.some((item) => domainCoverage.required.includes(item))
    );
    businessModules[domain] = {
      complete: domainCoverage.complete,
      required_scope: domainCoverage.required,
      workflow_ids: domainWorkflows.map((workflow) => workflow.id),
      states: unique(domainWorkflows.flatMap((workflow) => workflow.states)).sort(),
      artifact_types: unique(domainWorkflows.flatMap((workflow) => workflow.artifacts)).sort(),
      event_types: unique(domainWorkflows.flatMap((workflow) => workflow.events)).sort(),
      memory_scopes: unique(domainWorkflows.flatMap((workflow) => workflow.memory_scopes)).sort(),
      validation_gates: unique(domainWorkflows.flatMap((workflow) => workflow.validation_gates)).sort()
    };
  }

  return {
    schema_version: "forge.crm_operating_model.v1",
    tenant_id: tenantId,
    addon_id: "forge.addon.crm",
    state_owner: "forge_workflow_runtime",
    external_database_required: false,
    durable_identity: {
      primary: "workflow_id",
      artifacts: "artifact_id",
      events: "event_id"
    },
    mutation_policy: {
      requires_forge_workflow: true,
      requires_permission_gate: true,
      direct_external_persistence: false,
      external_delivery_requires_approval: true
    },
    operator_surfaces: {
      system_map: operatorSurface(workflows, "crm.system-map", "graph", "CRM system map"),
      relationship_graph: operatorSurface(workflows, "crm.relationship-graph", "graph", "Relationship graph"),
      pipeline_kanban: operatorSurface(workflows, "crm.pipeline-kanban", "board", "Pipeline Kanban"),
      commercial_command: operatorSurface(workflows, "crm.commercial-command", "panel", "Commercial command"),
      support_queue: operatorSurface(workflows, "crm.support-queue", "queue", "Support queue"),
      marketing_calendar: operatorSurface(workflows, "crm.marketing-calendar", "calendar", "Marketing calendar"),
      document_queue: operatorSurface(workflows, "crm.document-queue", "queue", "Document queue"),
      work_queue: operatorSurface(workflows, "crm.work-queue", "queue", "Cross-domain work queue"),
      design_system: operatorSurface(workflows, "crm.design-system", "system", "Design system"),
      ai_workbench: operatorSurface(workflows, "crm.ai-workbench", "workbench", "AI workbench")
    },
    business_modules: businessModules,
    operating_queues: {
      approvals: {
        workflow_ids: workflows.filter((workflow) => workflow.states.includes("approval_wait")).map((workflow) => workflow.id),
        artifact_types: ["crm_document", "crm_proposal", "crm_campaign"],
        permission: "crm.document.generate"
      },
      waiting_states: {
        workflow_ids: workflows.filter((workflow) => workflow.states.some((state) => state.includes("wait"))).map((workflow) => workflow.id),
        scheduler_owner: "forge_runtime"
      },
      next_actions: {
        source: "crm_ai_recommendation artifacts plus Forge validation gates",
        approval_required_before_state_mutation: true
      }
    },
    observability: {
      audit_required: true,
      lineage_required: true,
      cost_visible_for_runtime_contracts: true,
      event_timeline_source: "forge.events.timeline",
      artifact_source: "forge.workflow.artifacts"
    }
  };
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
  const operatingModel = buildCrmOperatingModel({ tenant_id: tenantId, workflows, coverage });

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
    operating_model: operatingModel,
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
      },
      {
        kind: "crm_operating_model",
        id: `crm-operating-model-${pack.tenant_id}`,
        title: `CRM operating model for ${pack.tenant_id}`,
        content_type: "application/json",
        data: pack.operating_model
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
