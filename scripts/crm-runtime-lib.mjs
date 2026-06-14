import { buildCrmPlan } from "./crm-plan-lib.mjs";
import { buildCrmOperatingModel, buildTenantBootstrapResult } from "./crm-workflow-pack-lib.mjs";

export { buildTenantBootstrapResult };

const ADDON_ID = "forge.addon.crm";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(items) {
  return [...new Set(items)];
}

function dispatchEnvelope(request) {
  return asObject(request?.input);
}

function dispatchPayload(request) {
  return asObject(dispatchEnvelope(request).input);
}

function providedContext(request) {
  const context = dispatchEnvelope(request).context;
  return asObject(context?.provided_context ?? context);
}

function contextTenant(request) {
  const context = providedContext(request);
  return context.tenant || context.organization || context.project || "unknown";
}

function slug(value, fallback) {
  const raw = String(value || fallback || "crm-record").trim().toLowerCase();
  const normalized = raw
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || fallback || "crm-record";
}

function numberFrom(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function textIncludes(value, patterns) {
  const text = String(value || "").toLowerCase();
  return patterns.some((pattern) => text.includes(pattern));
}

function probabilityFrom(value) {
  const probability = numberFrom(value, 0);
  if (probability > 1) {
    return Math.max(0, Math.min(1, probability / 100));
  }
  return Math.max(0, Math.min(1, probability));
}

function leadId(lead) {
  return String(lead.id || lead.lead_id || lead.email || lead.company || "lead-unknown");
}

function scoreLead(lead) {
  const budget = numberFrom(lead.budget ?? lead.estimated_value ?? lead.value);
  const companySize = numberFrom(lead.company_size ?? lead.employees ?? lead.employee_count);
  const timeline = lead.timeline || lead.buying_timeline || lead.urgency;
  const role = lead.role || lead.title || lead.authority;
  const source = lead.source || lead.channel;
  const pain = lead.pain || lead.problem || lead.notes;

  let score = 25;
  const evidence = [];

  if (budget >= 500_000) {
    score += 25;
    evidence.push("enterprise_budget");
  } else if (budget >= 100_000) {
    score += 18;
    evidence.push("strong_budget");
  } else if (budget >= 25_000) {
    score += 10;
    evidence.push("qualified_budget");
  }

  if (companySize >= 1_000) {
    score += 15;
    evidence.push("enterprise_account");
  } else if (companySize >= 100) {
    score += 10;
    evidence.push("mid_market_account");
  } else if (companySize >= 20) {
    score += 5;
    evidence.push("team_scale_account");
  }

  if (textIncludes(timeline, ["urgent", "now", "30", "this quarter", "immediate"])) {
    score += 15;
    evidence.push("near_term_timeline");
  } else if (textIncludes(timeline, ["90", "quarter", "soon"])) {
    score += 8;
    evidence.push("active_timeline");
  }

  if (role === true || textIncludes(role, ["founder", "owner", "ceo", "cfo", "coo", "director", "head", "vp"])) {
    score += 10;
    evidence.push("decision_authority");
  }

  if (String(pain || "").trim().length >= 24) {
    score += 10;
    evidence.push("clear_business_pain");
  }

  if (textIncludes(source, ["referral", "inbound", "partner", "demo"])) {
    score += 5;
    evidence.push("high_intent_source");
  }

  const boundedScore = Math.max(0, Math.min(100, score));
  const tier = boundedScore >= 80 ? "priority" : boundedScore >= 60 ? "qualified" : boundedScore >= 40 ? "nurture" : "research";
  const recommendedStage = tier === "priority" ? "sales-qualified" : tier === "qualified" ? "discovery" : tier === "nurture" ? "nurture" : "research";
  const confidence = tier === "priority" ? 0.88 : tier === "qualified" ? 0.78 : tier === "nurture" ? 0.64 : 0.52;

  return {
    score: boundedScore,
    tier,
    recommended_stage: recommendedStage,
    confidence,
    evidence: evidence.length ? evidence : ["insufficient_signal"],
    risk_flags: boundedScore < 40 ? ["low_fit_or_missing_context"] : []
  };
}

export function buildLeadClassifierResult(request) {
  const input = dispatchPayload(request);
  const lead = asObject(input.lead_profile ?? input.lead ?? input);
  const scoring = scoreLead(lead);
  const id = leadId(lead);
  const taskRef = dispatchEnvelope(request).task_ref || `classify-${slug(id, "lead")}`;

  return {
    schema_version: "forge.addon_executor_result.v1",
    status: "completed",
    task_ref: taskRef,
    summary: `Lead ${id} classified as ${scoring.tier}`,
    outputs: {
      lead_id: id,
      score: scoring.score,
      tier: scoring.tier,
      confidence: scoring.confidence,
      recommended_stage: scoring.recommended_stage,
      next_best_actions: [
        scoring.tier === "priority" ? "schedule_executive_discovery" : "collect_missing_qualification_context",
        "attach_classification_to_forge_timeline",
        "request_workflow_approval_before_state_change"
      ],
      evidence: scoring.evidence,
      risk_flags: scoring.risk_flags,
      mutates_crm_state: false
    },
    artifacts: [
      {
        kind: "crm_ai_recommendation",
        id: `lead-classification-${slug(id, "lead")}`,
        title: `Lead classification for ${id}`,
        data: {
          lead,
          scoring,
          policy: "recommendation_only_until_forge_workflow_approval"
        }
      }
    ],
    events: [
      {
        kind: "crm.lead.classified",
        lead_id: id,
        score: scoring.score,
        tier: scoring.tier,
        recommended_stage: scoring.recommended_stage
      }
    ],
    context_tenant: contextTenant(request)
  };
}

function entityId(entity, fallback = "crm-entity") {
  return String(entity.id || entity.entity_id || entity.lead_id || entity.contact_id || entity.company_id || entity.opportunity_id || fallback);
}

function entityKind(entity, fallback = "record") {
  return String(entity.kind || entity.entity_kind || entity.type || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || fallback;
}

function relationshipWorkflowFor(kind) {
  return kind === "opportunity" ? "crm.opportunity.pipeline" : "crm.lead.lifecycle";
}

export function buildRelationshipTimelineResult(request) {
  const input = dispatchPayload(request);
  const context = providedContext(request);
  const tenantId = input.tenant_id || input.tenant_context?.tenant_id || input.tenant_context?.id || context.tenant || "default";
  const entity = asObject(input.entity ?? input.lead ?? input.contact ?? input.company ?? input.opportunity);
  const kind = entityKind(entity, input.entity_kind || "record");
  const id = entityId(entity, dispatchEnvelope(request).task_ref || "crm-entity");
  const relationships = asArray(input.relationships);
  const timelineEvent = asObject(input.timeline_event ?? input.event);
  const pipeline = asObject(input.pipeline);
  const workflowId = String(input.workflow_id || timelineEvent.workflow_id || pipeline.workflow_id || relationshipWorkflowFor(kind));
  const taskRef = dispatchEnvelope(request).task_ref || `record-relationship-${slug(id, "entity")}`;
  const fromStage = pipeline.from_stage || timelineEvent.from_stage || entity.previous_stage || null;
  const toStage = pipeline.to_stage || timelineEvent.to_stage || entity.stage || null;
  const funnelId = pipeline.funnel_id || entity.funnel_id || "default";
  const amount = numberFrom(pipeline.amount ?? entity.amount ?? entity.value, 0);
  const probability = probabilityFrom(pipeline.probability ?? pipeline.close_probability ?? entity.close_probability);
  const forecastAmount = Math.round(amount * probability);
  const timelineRecord = {
    event_id: timelineEvent.id || `event-${slug(id, "entity")}-${slug(timelineEvent.kind || "relationship")}`,
    kind: timelineEvent.kind || (toStage ? "stage_changed" : "relationship_recorded"),
    from_stage: fromStage,
    to_stage: toStage,
    reason: timelineEvent.reason || input.reason || "Forge relationship event recorded",
    owner: timelineEvent.owner || input.owner || "forge",
    workflow_id: workflowId
  };
  const lineage = {
    workflow_id: workflowId,
    task_ref: taskRef,
    source_contract: "crm.relationship.timeline.executor",
    tenant_id: tenantId,
    entity_id: id
  };

  const events = [
    {
      kind: "crm.relationship.recorded",
      tenant_id: tenantId,
      entity_id: id,
      entity_kind: kind,
      workflow_id: workflowId,
      relationship_count: relationships.length,
      timeline_event_kind: timelineRecord.kind
    }
  ];

  if (kind === "opportunity" && toStage) {
    events.push({
      kind: "crm.opportunity.stage_changed",
      tenant_id: tenantId,
      opportunity_id: id,
      workflow_id: workflowId,
      funnel_id: funnelId,
      from_stage: fromStage,
      to_stage: toStage
    });
  }
  if (kind === "opportunity" && amount > 0) {
    events.push({
      kind: "crm.forecast.updated",
      tenant_id: tenantId,
      opportunity_id: id,
      workflow_id: workflowId,
      funnel_id: funnelId,
      amount,
      probability,
      forecast_amount: forecastAmount
    });
  }

  return {
    schema_version: "forge.addon_executor_result.v1",
    status: "completed",
    task_ref: taskRef,
    summary: `Recorded ${kind} ${id} relationship timeline event through Forge`,
    outputs: {
      tenant_id: tenantId,
      entity_id: id,
      entity_kind: kind,
      workflow_id: workflowId,
      relationship_count: relationships.length,
      timeline_event_count: 1,
      pipeline_stage: toStage,
      funnel_id: funnelId,
      forecast_amount: forecastAmount,
      mutates_crm_state: false,
      forge_event_sourced: true
    },
    artifacts: [
      {
        kind: "crm_timeline_snapshot",
        id: `timeline-${slug(kind, "entity")}-${slug(id, "entity")}`,
        title: `CRM timeline snapshot for ${id}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          entity,
          entity_id: id,
          entity_kind: kind,
          relationships,
          timeline_events: [timelineRecord],
          pipeline: {
            ...pipeline,
            funnel_id: funnelId,
            from_stage: fromStage,
            to_stage: toStage,
            amount,
            probability,
            forecast_amount: forecastAmount
          },
          lineage,
          state_owner: "forge_workflow_runtime",
          external_database_required: false
        }
      },
      {
        kind: "crm_entity_model",
        id: `entity-${slug(kind, "entity")}-${slug(id, "entity")}`,
        title: `CRM entity model for ${id}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          entity_id: id,
          entity_kind: kind,
          workflow_id: workflowId,
          record_identity: {
            primary: "workflow_id",
            external_primary_key_allowed: false
          },
          entity,
          relationships,
          current_stage: toStage,
          funnel_id: funnelId,
          lineage,
          mutation_policy: "state_changes_must_be_promoted_by_forge_workflow"
        }
      }
    ],
    events,
    context_tenant: context.tenant || tenantId
  };
}

function opportunityId(opportunity) {
  return String(opportunity.id || opportunity.opportunity_id || opportunity.account || opportunity.company || "opportunity-unknown");
}

function opportunityAccount(opportunity) {
  return String(opportunity.account || opportunity.company || opportunity.name || opportunityId(opportunity));
}

function stageWeight(stage) {
  const normalized = String(stage || "").toLowerCase();
  if (["negotiation", "signature", "contract", "closing"].some((item) => normalized.includes(item))) {
    return 22;
  }
  if (["proposal", "approval"].some((item) => normalized.includes(item))) {
    return 18;
  }
  if (["discovery", "qualified"].some((item) => normalized.includes(item))) {
    return 12;
  }
  return 6;
}

function scoreOpportunity(opportunity) {
  const amount = numberFrom(opportunity.amount ?? opportunity.value ?? opportunity.forecast_amount, 0);
  const probability = probabilityFrom(opportunity.close_probability ?? opportunity.probability ?? opportunity.win_probability);
  const lastActivityDays = numberFrom(opportunity.last_activity_days ?? opportunity.days_since_activity, 0);
  const riskFlags = asArray(opportunity.risk_flags);
  const score = Math.max(
    0,
    Math.min(100, Math.round(Math.min(30, amount / 8000) + probability * 38 + stageWeight(opportunity.stage) - Math.min(12, lastActivityDays / 2) - riskFlags.length * 2))
  );

  return {
    id: opportunityId(opportunity),
    account: opportunityAccount(opportunity),
    score,
    amount,
    probability,
    stage: opportunity.stage || "unknown",
    risk_flags: riskFlags,
    recommended_action:
      score >= 70
        ? "request_forge_approval_for_priority_opportunity_next_step"
        : "collect_missing_context_before_stage_change"
  };
}

function buildOperatingRiskSignals({ opportunityPriorities, tickets, documents }) {
  const risks = [];
  for (const opportunity of opportunityPriorities) {
    for (const flag of opportunity.risk_flags) {
      risks.push({
        code: "opportunity_risk_flag",
        severity: "medium",
        subject: opportunity.id,
        message: flag
      });
    }
  }
  for (const ticket of tickets) {
    const minutes = numberFrom(ticket.sla_minutes_remaining ?? ticket.sla_remaining_minutes, 99999);
    const highSeverity = textIncludes(ticket.severity, ["high", "urgent", "critical"]);
    if (minutes <= 60 || highSeverity) {
      risks.push({
        code: "support_sla_attention",
        severity: minutes <= 30 || highSeverity ? "high" : "medium",
        subject: String(ticket.id || ticket.ticket_id || "ticket"),
        message: "support ticket needs SLA attention"
      });
    }
  }
  for (const document of documents) {
    if (textIncludes(document.state || document.status, ["approval_wait", "review", "rework"])) {
      risks.push({
        code: "document_queue_attention",
        severity: "medium",
        subject: String(document.id || document.artifact_id || "document"),
        message: "document workflow is waiting for approval or rework"
      });
    }
  }
  return risks;
}

export function buildOperatingCopilotResult(request) {
  const input = dispatchPayload(request);
  const context = providedContext(request);
  const tenantId = input.tenant_id || input.tenant_context?.tenant_id || input.tenant_context?.id || context.tenant || "default";
  const opportunities = asArray(input.opportunities);
  const tickets = asArray(input.tickets);
  const documents = asArray(input.documents);
  const campaigns = asArray(input.campaigns);
  const taskRef = dispatchEnvelope(request).task_ref || `crm-operating-copilot-${slug(tenantId, "tenant")}`;
  const opportunityPriorities = opportunities.map(scoreOpportunity).sort((left, right) => right.score - left.score);
  const priority = opportunityPriorities[0] || {
    id: "none",
    account: "No active account",
    score: 0,
    recommended_action: "collect_missing_operating_context"
  };
  const risks = buildOperatingRiskSignals({ opportunityPriorities, tickets, documents });
  const nextBestActions = [
    priority.recommended_action,
    risks.some((risk) => risk.code === "support_sla_attention") ? "resolve_high_risk_sla_ticket" : "monitor_support_queue",
    risks.some((risk) => risk.code === "document_queue_attention") ? "clear_document_approval_queue" : "keep_document_queue_current",
    campaigns.length > 0 ? "review_campaign_follow_up_workflows" : "plan_next_segmented_campaign"
  ];
  const executiveSummary = `Top opportunity is ${priority.account} (${priority.id}) with score ${priority.score}; ${risks.length} operating risks require Forge-tracked follow-up.`;

  return {
    schema_version: "forge.addon_executor_result.v1",
    status: "completed",
    task_ref: taskRef,
    summary: `CRM operating copilot generated ${nextBestActions.length} recommended actions for tenant ${tenantId}`,
    outputs: {
      tenant_id: tenantId,
      priority_opportunity_id: priority.id,
      priority_opportunity_score: priority.score,
      executive_summary: executiveSummary,
      risk_count: risks.length,
      next_best_actions: nextBestActions,
      mutates_crm_state: false,
      approval_required_before_state_mutation: true
    },
    artifacts: [
      {
        kind: "crm_ai_recommendation",
        id: `crm-operating-copilot-${slug(tenantId, "tenant")}`,
        title: `CRM operating copilot recommendations for ${tenantId}`,
        content_type: "application/json",
        data: {
          opportunity_priorities: opportunityPriorities,
          next_best_actions: nextBestActions,
          policy: "recommendation_only_until_forge_workflow_approval"
        }
      },
      {
        kind: "crm_risk_analysis",
        id: `crm-risk-analysis-${slug(tenantId, "tenant")}`,
        title: `CRM risk analysis for ${tenantId}`,
        content_type: "application/json",
        data: {
          risks,
          source: "forge_workflow_artifacts_and_events",
          requires_workflow_rework_for_risk_closure: true
        }
      },
      {
        kind: "crm_report",
        id: `crm-executive-summary-${slug(tenantId, "tenant")}`,
        title: `CRM executive summary for ${tenantId}`,
        content_type: "application/json",
        data: {
          executive_summary: executiveSummary,
          opportunity_count: opportunities.length,
          ticket_count: tickets.length,
          document_count: documents.length,
          campaign_count: campaigns.length,
          state_owner: "forge_workflow_runtime"
        }
      }
    ],
    events: [
      {
        kind: "crm.ai.operating_copilot_generated",
        tenant_id: tenantId,
        priority_opportunity_id: priority.id,
        risk_count: risks.length
      },
      ...(risks.length > 0
        ? [
            {
              kind: "crm.ai.risk_flagged",
              tenant_id: tenantId,
              risk_count: risks.length
            }
          ]
        : [])
    ],
    context_tenant: context.tenant || tenantId
  };
}

export function buildProposalGeneratorResult(request) {
  const input = dispatchPayload(request);
  const opportunity = asObject(input.opportunity ?? input);
  const account = asObject(input.account_context ?? input.account);
  const terms = asObject(input.approved_offer_terms ?? input.terms);
  const opportunityId = String(opportunity.id || opportunity.opportunity_id || dispatchEnvelope(request).task_ref || "opportunity-unknown");
  const accountName = account.name || opportunity.account || opportunity.company || "Target account";
  const amount = numberFrom(terms.amount ?? opportunity.amount ?? opportunity.value, 0);
  const proposalId = `proposal-${slug(opportunityId, "opportunity")}`;

  return {
    schema_version: "forge.addon_executor_result.v1",
    status: "completed",
    task_ref: dispatchEnvelope(request).task_ref || `generate-proposal-${slug(opportunityId, "opportunity")}`,
    summary: `Draft proposal ${proposalId} generated for ${accountName}`,
    outputs: {
      proposal_id: proposalId,
      opportunity_id: opportunityId,
      account: accountName,
      amount,
      currency: terms.currency || opportunity.currency || "USD",
      approval_state: "draft_requires_forge_approval",
      external_delivery_allowed: false
    },
    artifacts: [
      {
        kind: "crm_proposal",
        id: proposalId,
        title: `Proposal for ${accountName}`,
        content_type: "application/json",
        data: {
          opportunity,
          account_context: account,
          approved_offer_terms: terms,
          sections: [
            "business_context",
            "proposed_solution",
            "commercial_terms",
            "implementation_workflow",
            "approval_and_signature_steps"
          ],
          delivery_policy: "attach_to_workflow_and_request_approval_before_external_delivery"
        }
      }
    ],
    events: [
      {
        kind: "crm.proposal.generated",
        proposal_id: proposalId,
        opportunity_id: opportunityId,
        approval_state: "draft_requires_forge_approval"
      }
    ],
    context_tenant: contextTenant(request)
  };
}

const DOCUMENT_ARTIFACT_KINDS = [
  "crm_document",
  "crm_contract",
  "crm_report",
  "crm_email",
  "crm_campaign",
  "crm_landing_page",
  "crm_presentation"
];

const DEFAULT_DOCUMENT_ARTIFACTS = {
  contract: ["crm_contract", "crm_document"],
  contract_pack: ["crm_contract", "crm_document", "crm_report"],
  campaign: ["crm_campaign", "crm_email", "crm_landing_page", "crm_report"],
  campaign_asset_pack: ["crm_campaign", "crm_email", "crm_landing_page", "crm_report", "crm_presentation"],
  report: ["crm_report", "crm_document"],
  presentation: ["crm_presentation", "crm_document"],
  landing_page: ["crm_landing_page", "crm_email", "crm_document"],
  email: ["crm_email", "crm_document"],
  document: ["crm_document"]
};

function documentArtifactKinds(input, documentKind) {
  const requested = asArray(input.requested_artifacts)
    .map((kind) => String(kind))
    .filter((kind) => DOCUMENT_ARTIFACT_KINDS.includes(kind));
  const defaults = DEFAULT_DOCUMENT_ARTIFACTS[documentKind] || DEFAULT_DOCUMENT_ARTIFACTS.document;
  return unique(["crm_document", ...defaults, ...requested]);
}

function artifactTitle(kind, subjectName) {
  const labels = {
    crm_document: "Document",
    crm_contract: "Contract",
    crm_report: "Report",
    crm_email: "Email",
    crm_campaign: "Campaign",
    crm_landing_page: "Landing page",
    crm_presentation: "Presentation"
  };
  return `${labels[kind] || "Document"} draft for ${subjectName}`;
}

function artifactOutline(kind) {
  const outlines = {
    crm_contract: ["parties", "scope", "commercial_terms", "approval_and_signature_steps"],
    crm_report: ["executive_summary", "evidence", "risks", "next_steps"],
    crm_email: ["subject_line", "personalized_body", "call_to_action", "approval_note"],
    crm_campaign: ["campaign_goal", "target_segment", "message_pillars", "automation_steps"],
    crm_landing_page: ["headline", "offer", "proof_points", "form_fields"],
    crm_presentation: ["context", "problem", "solution", "workflow_plan", "decision_slide"],
    crm_document: ["context", "draft_content", "lineage", "approval_policy"]
  };
  return outlines[kind] || outlines.crm_document;
}

function documentKindKey(value, fallback = "document") {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

export function buildDocumentGeneratorResult(request) {
  const input = dispatchPayload(request);
  const context = providedContext(request);
  const tenantId = input.tenant_id || input.tenant_context?.tenant_id || input.tenant_context?.id || context.tenant || "default";
  const documentKind = documentKindKey(input.document_kind || input.kind || "document");
  const subject = asObject(input.subject ?? input.account_context ?? input.opportunity ?? input.campaign);
  const subjectId = String(subject.id || subject.opportunity_id || subject.campaign_id || input.subject_id || dispatchEnvelope(request).task_ref || "crm-document");
  const subjectName = subject.account || subject.company || subject.name || subject.title || subjectId;
  const workflowId = String(input.workflow_id || input.lineage?.workflow_id || dispatchEnvelope(request).workflow_id || "crm.document.approval");
  const taskRef = dispatchEnvelope(request).task_ref || `generate-document-${slug(subjectId, "subject")}`;
  const brief = asObject(input.brief);
  const artifactKinds = documentArtifactKinds(input, documentKind);
  const documentId = `document-${slug(documentKind, "document")}-${slug(subjectId, "subject")}`;
  const lineage = {
    workflow_id: workflowId,
    task_ref: taskRef,
    source_contract: "crm.document.generator.executor",
    subject_id: subjectId,
    tenant_id: tenantId
  };
  const approvalPolicy = {
    approval_state: "draft_requires_forge_approval",
    external_delivery_allowed: false,
    validation_contract: "crm.document.validator"
  };

  const artifacts = artifactKinds.map((kind) => ({
    kind,
    id: kind === "crm_document" ? documentId : `${documentId}-${kind.replace(/^crm_/, "")}`,
    title: artifactTitle(kind, subjectName),
    content_type: "application/json",
    data: {
      tenant_id: tenantId,
      document_kind: documentKind,
      subject,
      brief,
      sections: artifactOutline(kind),
      lineage,
      approval_policy: approvalPolicy,
      delivery_policy: "attach_to_workflow_and_request_approval_before_external_delivery"
    }
  }));

  return {
    schema_version: "forge.addon_executor_result.v1",
    status: "completed",
    task_ref: taskRef,
    summary: `Generated ${artifactKinds.length} CRM document artifacts for ${subjectName}`,
    outputs: {
      tenant_id: tenantId,
      document_id: documentId,
      document_kind: documentKind,
      workflow_id: workflowId,
      generated_artifact_kinds: artifactKinds,
      approval_state: "draft_requires_forge_approval",
      external_delivery_allowed: false,
      mutates_crm_state: false
    },
    artifacts,
    events: [
      {
        kind: "crm.document.generated",
        tenant_id: tenantId,
        document_id: documentId,
        document_kind: documentKind,
        workflow_id: workflowId,
        artifact_count: artifactKinds.length,
        approval_state: "draft_requires_forge_approval"
      },
      {
        kind: "crm.document.approval_requested",
        tenant_id: tenantId,
        document_id: documentId,
        workflow_id: workflowId
      }
    ],
    context_tenant: context.tenant || tenantId
  };
}

export function buildOperatingSnapshotResult(request) {
  const input = dispatchPayload(request);
  const context = providedContext(request);
  const tenantId = input.tenant_id || input.tenant_context?.tenant_id || input.tenant_context?.id || context.tenant || "default";
  const model = buildCrmOperatingModel({ tenant_id: tenantId });
  const taskRef = dispatchEnvelope(request).task_ref || `crm-operating-snapshot-${slug(tenantId, "tenant")}`;
  const operatorSurfaceKeys = Object.keys(model.operator_surfaces);
  const businessModuleKeys = Object.keys(model.business_modules);

  return {
    schema_version: "forge.addon_executor_result.v1",
    status: "completed",
    task_ref: taskRef,
    summary: `CRM operating snapshot generated for tenant ${model.tenant_id}`,
    outputs: {
      tenant_id: model.tenant_id,
      business_module_count: businessModuleKeys.length,
      operator_surface_count: operatorSurfaceKeys.length,
      approval_queue_workflow_count: model.operating_queues.approvals.workflow_ids.length,
      waiting_state_workflow_count: model.operating_queues.waiting_states.workflow_ids.length,
      external_database_required: model.external_database_required,
      state_owner: model.state_owner
    },
    artifacts: [
      {
        kind: "crm_operating_snapshot",
        id: `crm-operating-snapshot-${model.tenant_id}`,
        title: `CRM operating snapshot for ${model.tenant_id}`,
        content_type: "application/json",
        data: model
      }
    ],
    events: [
      {
        kind: "crm.operating.snapshot_generated",
        tenant_id: model.tenant_id,
        business_module_count: businessModuleKeys.length,
        operator_surface_count: operatorSurfaceKeys.length
      }
    ],
    context_tenant: context.tenant || model.tenant_id
  };
}

export function buildDocumentValidatorResult(request) {
  const input = dispatchPayload(request);
  const subject = dispatchEnvelope(request).subject || input.subject || "crm-document";
  const artifact = asObject(input.artifact_ref ?? input.artifact);
  const policy = asObject(input.approval_policy);
  const lineage = asObject(input.lineage);
  const artifactPresent = Boolean(artifact.id || artifact.path || artifact.sha256 || input.artifact_id);
  const lineagePresent = Boolean(lineage.workflow_id || lineage.artifact_id || lineage.source_event || input.workflow_id);
  const approvalRequired = policy.requires_human_approval === true || policy.external_delivery_requires_approval === true;
  const approved = policy.approved === true || policy.external_delivery_approved === true || policy.approver;

  const issues = [];
  if (!artifactPresent) {
    issues.push({ code: "missing_artifact_ref", message: "document validation requires a Forge artifact reference" });
  }
  if (!lineagePresent) {
    issues.push({ code: "missing_lineage", message: "document validation requires workflow or artifact lineage" });
  }
  if (approvalRequired && !approved) {
    issues.push({ code: "approval_required", message: "external delivery requires a recorded Forge approval" });
  }

  const decision = !artifactPresent || !lineagePresent ? "failed" : issues.length > 0 ? "review_required" : "passed";

  return {
    schema_version: "forge.addon_validator_result.v1",
    decision,
    subject,
    summary: decision === "passed" ? "CRM document passed validation" : "CRM document needs workflow rework or approval",
    issues,
    checks: [
      { id: "artifact-reference", status: artifactPresent ? "passed" : "failed" },
      { id: "lineage", status: lineagePresent ? "passed" : "failed" },
      { id: "approval-policy", status: approvalRequired && !approved ? "review_required" : "passed" }
    ],
    context_tenant: contextTenant(request)
  };
}

function ticketId(ticket, fallback = "crm-ticket") {
  return String(ticket.id || ticket.ticket_id || fallback);
}

function ticketSeverity(ticket) {
  const severity = String(ticket.severity || ticket.priority || "normal").toLowerCase();
  if (["critical", "urgent", "high"].some((item) => severity.includes(item))) {
    return severity.includes("critical") ? "critical" : "high";
  }
  if (severity.includes("low")) {
    return "low";
  }
  return "normal";
}

export function buildTicketSlaResult(request) {
  const input = dispatchPayload(request);
  const context = providedContext(request);
  const tenantId = input.tenant_id || input.tenant_context?.tenant_id || input.tenant_context?.id || context.tenant || "default";
  const ticket = asObject(input.ticket_context ?? input.ticket);
  const messages = asArray(input.messages ?? input.message_events);
  const policy = asObject(input.sla_policy);
  const routingPolicy = asObject(input.routing_policy);
  const id = ticketId(ticket, dispatchEnvelope(request).task_ref || "ticket");
  const channel = input.channel || ticket.channel || messages[0]?.channel || "unknown";
  const severity = ticketSeverity(ticket);
  const elapsedMinutes = numberFrom(policy.elapsed_minutes ?? ticket.elapsed_minutes ?? ticket.sla_elapsed_minutes, 0);
  const firstResponseMinutes = numberFrom(policy.first_response_minutes ?? policy.first_response_sla_minutes, 60);
  const resolutionMinutes = numberFrom(policy.resolution_minutes ?? policy.resolution_sla_minutes, 480);
  const firstResponseRemaining = Math.max(0, firstResponseMinutes - elapsedMinutes);
  const resolutionRemaining = Math.max(0, resolutionMinutes - elapsedMinutes);
  const escalationRequired = severity === "critical" || severity === "high" || firstResponseRemaining === 0;
  const slaState = escalationRequired ? "sla_escalation" : "owner_assigned";
  const ownerQueue = escalationRequired
    ? routingPolicy.escalation_queue || routingPolicy.default_queue || "support-escalation"
    : routingPolicy.default_queue || "support";
  const workflowId = String(input.workflow_id || "crm.ticket.sla");
  const taskRef = dispatchEnvelope(request).task_ref || `triage-ticket-${slug(id, "ticket")}`;
  const lineage = {
    workflow_id: workflowId,
    task_ref: taskRef,
    source_contract: "crm.support.ticket_sla.executor",
    tenant_id: tenantId,
    ticket_id: id
  };
  const supportSummaryId = `support-summary-${slug(id, "ticket")}`;
  const handoffRecordId = `support-routing-${slug(id, "ticket")}`;

  return {
    schema_version: "forge.addon_executor_result.v1",
    status: "completed",
    task_ref: taskRef,
    summary: `Ticket ${id} triaged into ${ownerQueue} with SLA state ${slaState}`,
    outputs: {
      tenant_id: tenantId,
      ticket_id: id,
      channel,
      severity,
      sla_state: slaState,
      owner_queue: ownerQueue,
      escalation_required: escalationRequired,
      first_response_minutes_remaining: firstResponseRemaining,
      resolution_minutes_remaining: resolutionRemaining,
      mutates_crm_state: false,
      forge_event_sourced: true
    },
    artifacts: [
      {
        kind: "crm_support_summary",
        id: supportSummaryId,
        title: `Support summary for ${id}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          ticket,
          ticket_id: id,
          channel,
          severity,
          messages,
          sla: {
            policy,
            state: slaState,
            first_response_minutes_remaining: firstResponseRemaining,
            resolution_minutes_remaining: resolutionRemaining,
            escalation_required: escalationRequired
          },
          lineage,
          state_owner: "forge_workflow_runtime",
          external_database_required: false
        }
      },
      {
        kind: "crm_handoff_record",
        id: handoffRecordId,
        title: `Support routing record for ${id}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          ticket_id: id,
          source_channel: channel,
          owner_queue: ownerQueue,
          next_state: slaState,
          escalation_required: escalationRequired,
          handoff_policy: "route_through_forge_ticket_sla_workflow_before_external_reply",
          lineage
        }
      }
    ],
    events: [
      {
        kind: "crm.message.received",
        tenant_id: tenantId,
        ticket_id: id,
        channel,
        message_count: messages.length,
        workflow_id: workflowId
      },
      {
        kind: "crm.ticket.created",
        tenant_id: tenantId,
        ticket_id: id,
        channel,
        severity,
        owner_queue: ownerQueue,
        workflow_id: workflowId
      },
      ...(escalationRequired
        ? [
            {
              kind: "crm.sla.escalated",
              tenant_id: tenantId,
              ticket_id: id,
              channel,
              owner_queue: ownerQueue,
              first_response_minutes_remaining: firstResponseRemaining,
              workflow_id: workflowId
            }
          ]
        : [
            {
              kind: "crm.ticket.triaged",
              tenant_id: tenantId,
              ticket_id: id,
              channel,
              owner_queue: ownerQueue,
              workflow_id: workflowId
            }
          ])
    ],
    context_tenant: context.tenant || tenantId
  };
}

export function buildOmnichannelHandoffResult(request) {
  const input = dispatchPayload(request);
  const handoffRef = dispatchEnvelope(request).handoff_ref || input.handoff_ref || "crm-handoff";
  const ticket = asObject(input.ticket_context ?? input.ticket);
  const message = asObject(input.approved_message ?? input.message);
  const policy = asObject(input.integration_policy ?? input.channel_policy);
  const channel = input.channel || ticket.channel || policy.channel || "internal";
  const approved = message.approved === true || policy.approved === true || policy.delivery_approved === true;
  const ticketId = String(ticket.id || ticket.ticket_id || handoffRef);

  if (!approved) {
    return {
      schema_version: "forge.addon_handoff_result.v1",
      status: "review_required",
      handoff_ref: handoffRef,
      target: {
        type: "crm_approval_queue",
        channel
      },
      receipt: {
        ticket_id: ticketId,
        status: "approval_required"
      },
      artifacts: [
        {
          kind: "crm_support_summary",
          id: `handoff-review-${slug(ticketId, "ticket")}`,
          data: { ticket, channel, reason: "missing_delivery_approval" }
        }
      ],
      events: [
        {
          kind: "crm.handoff.review_required",
          ticket_id: ticketId,
          channel
        }
      ],
      context_tenant: contextTenant(request)
    };
  }

  return {
    schema_version: "forge.addon_handoff_result.v1",
    status: "delivered",
    handoff_ref: handoffRef,
    target: {
      type: "crm_channel",
      channel,
      queue: policy.queue || "support"
    },
    receipt: {
      id: `handoff-${slug(ticketId, "ticket")}`,
      ticket_id: ticketId,
      status: "accepted",
      delivery_mode: "forge_controlled_runtime_contract"
    },
    artifacts: [
      {
        kind: "handoff_receipt",
        id: `handoff-receipt-${slug(ticketId, "ticket")}`,
        data: {
          ticket,
          channel,
          message_summary: message.summary || message.text || "approved CRM handoff"
        }
      }
    ],
    events: [
      {
        kind: "crm.handoff.delivered",
        ticket_id: ticketId,
        channel
      }
    ],
    context_tenant: contextTenant(request)
  };
}

export function executeCrmRuntimeRequest(request) {
  const entrypoint = request?.entrypoint || dispatchEnvelope(request).entrypoint;
  switch (entrypoint) {
    case "forge_crm.plan_system": {
      const envelope = dispatchEnvelope(request);
      const goal = envelope.goal || request?.goal || "Create a workflow-first enterprise CRM on Forge";
      return buildCrmPlan(goal);
    }
    case "forge_crm.bootstrap_tenant":
      return buildTenantBootstrapResult(request);
    case "forge_crm.operating_snapshot":
      return buildOperatingSnapshotResult(request);
    case "forge_crm.classify_lead":
      return buildLeadClassifierResult(request);
    case "forge_crm.record_relationship_event":
      return buildRelationshipTimelineResult(request);
    case "forge_crm.operating_copilot":
      return buildOperatingCopilotResult(request);
    case "forge_crm.generate_proposal":
      return buildProposalGeneratorResult(request);
    case "forge_crm.generate_document":
      return buildDocumentGeneratorResult(request);
    case "forge_crm.validate_document":
      return buildDocumentValidatorResult(request);
    case "forge_crm.triage_ticket_sla":
      return buildTicketSlaResult(request);
    case "forge_crm.deliver_handoff":
      return buildOmnichannelHandoffResult(request);
    default:
      throw new Error(`unsupported Forge CRM runtime entrypoint: ${entrypoint || "unknown"}`);
  }
}

export function buildWorkerResponse(request) {
  return {
    status: "completed",
    result: executeCrmRuntimeRequest(request),
    attestation: {
      schema_version: "forge.addon_runtime_worker_attestation.v1",
      execution_mode: "external_api",
      addon_id: ADDON_ID,
      worker_id: request?.worker_id || "forge-crm-runtime-worker",
      dispatch_id: request?.dispatch_id || "direct-test-dispatch",
      request_schema: request?.schema_version || "direct-test"
    }
  };
}
