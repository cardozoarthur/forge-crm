import { buildCrmPlan } from "./crm-plan-lib.mjs";
import { buildCrmOperatingModel, buildCrmWorkflowPack, buildTenantBootstrapResult } from "./crm-workflow-pack-lib.mjs";

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

function roundCurrency(value) {
  return Math.round(numberFrom(value, 0) * 100) / 100;
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

export function buildRelationshipProfileEnrichmentResult(request) {
  const input = dispatchPayload(request);
  const context = providedContext(request);
  const tenantId = input.tenant_id || input.tenant_context?.tenant_id || input.tenant_context?.id || context.tenant || "default";
  const profile = asObject(input.entity_profile ?? input.profile ?? input.contact ?? input.company);
  const kind = entityKind(profile, input.entity_kind || "contact");
  const id = entityId(profile, dispatchEnvelope(request).task_ref || "relationship-profile");
  const workflowId = String(input.workflow_id || profile.workflow_id || "crm.relationship.profile_enrichment");
  const taskRef = dispatchEnvelope(request).task_ref || `enrich-relationship-${slug(id, "profile")}`;
  const enrichmentSources = asArray(input.enrichment_sources ?? input.sources);
  const relationshipSignals = asArray(input.relationship_signals ?? input.signals);
  const timelineEvent = asObject(input.timeline_event ?? input.event);
  const confidenceValues = enrichmentSources
    .map((source) => numberFrom(asObject(source).confidence, NaN))
    .filter((confidence) => Number.isFinite(confidence));
  const confidence =
    confidenceValues.length > 0
      ? Math.round((confidenceValues.reduce((total, value) => total + value, 0) / confidenceValues.length) * 100) / 100
      : 0.5;
  const enrichmentState = enrichmentSources.length > 0 && relationshipSignals.length > 0 ? "ready_for_approval" : "rework_required";
  const owner = timelineEvent.owner || input.owner || "revenue-operations";
  const companyId = profile.company_id || profile.account_id || (kind === "company" ? id : null);
  const relationshipProfile = {
    tenant_id: tenantId,
    entity_id: id,
    entity_kind: kind,
    name: profile.name || profile.company_name || profile.account || id,
    title: profile.title || profile.role || null,
    company_id: companyId,
    company_name: profile.company_name || profile.account || null,
    lifecycle_stage: profile.lifecycle_stage || profile.stage || "enrichment_wait",
    enrichment_state: enrichmentState,
    confidence,
    source_count: enrichmentSources.length,
    signal_count: relationshipSignals.length,
    relationship_signals: relationshipSignals,
    source_refs: enrichmentSources.map((source, index) => ({
      id: asObject(source).id || asObject(source).source_id || `source-${index + 1}`,
      kind: asObject(source).kind || asObject(source).type || "enrichment_source",
      confidence: numberFrom(asObject(source).confidence, null),
      fields: asArray(asObject(source).fields)
    })),
    state_owner: "forge_workflow_runtime",
    external_database_required: false
  };
  const lineage = {
    workflow_id: workflowId,
    task_ref: taskRef,
    source_contract: "crm.relationship.profile_enrichment.executor",
    tenant_id: tenantId,
    entity_id: id
  };
  const timelineRecord = {
    event_id: timelineEvent.id || `event-${slug(id, "profile")}-profile-enriched`,
    kind: timelineEvent.kind || "profile_enriched",
    reason: timelineEvent.reason || "Forge relationship profile enrichment package generated",
    owner,
    workflow_id: workflowId
  };
  const events = [
    {
      kind: kind === "company" ? "crm.company.enriched" : "crm.contact.enriched",
      tenant_id: tenantId,
      entity_id: id,
      entity_kind: kind,
      workflow_id: workflowId,
      enrichment_state: enrichmentState,
      source_count: enrichmentSources.length,
      signal_count: relationshipSignals.length
    }
  ];
  if (kind !== "company" && companyId) {
    events.push({
      kind: "crm.company.enriched",
      tenant_id: tenantId,
      company_id: companyId,
      workflow_id: workflowId,
      source_contact_id: id
    });
  }
  events.push({
    kind: "crm.relationship.profile_updated",
    tenant_id: tenantId,
    entity_id: id,
    entity_kind: kind,
    workflow_id: workflowId,
    approval_required: true
  });

  return {
    schema_version: "forge.addon_executor_result.v1",
    status: "completed",
    task_ref: taskRef,
    summary: `Prepared ${kind} ${id} relationship profile enrichment through Forge`,
    outputs: {
      tenant_id: tenantId,
      entity_id: id,
      entity_kind: kind,
      workflow_id: workflowId,
      enrichment_source_count: enrichmentSources.length,
      relationship_signal_count: relationshipSignals.length,
      enrichment_state: enrichmentState,
      confidence,
      next_best_actions: [
        "request_forge_approval_for_profile_promotion",
        "attach_enrichment_record_to_relationship_timeline",
        enrichmentState === "ready_for_approval" ? "promote_profile_after_validation" : "return_to_rework_with_missing_source_reason"
      ],
      mutates_crm_state: false,
      forge_event_sourced: true
    },
    artifacts: [
      {
        kind: "crm_relationship_profile",
        id: `relationship-profile-${slug(kind, "entity")}-${slug(id, "profile")}`,
        title: `Relationship profile for ${relationshipProfile.name}`,
        content_type: "application/json",
        data: {
          ...relationshipProfile,
          lineage,
          mutation_policy: "profile_changes_require_forge_workflow_approval"
        }
      },
      {
        kind: "crm_enrichment_record",
        id: `enrichment-record-${slug(kind, "entity")}-${slug(id, "profile")}`,
        title: `Enrichment record for ${relationshipProfile.name}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          entity_id: id,
          entity_kind: kind,
          enrichment_sources: enrichmentSources,
          relationship_signals: relationshipSignals,
          confidence,
          approval_required: true,
          lineage,
          state_owner: "forge_workflow_runtime"
        }
      },
      {
        kind: "crm_timeline_snapshot",
        id: `timeline-profile-${slug(kind, "entity")}-${slug(id, "profile")}`,
        title: `Relationship enrichment timeline for ${relationshipProfile.name}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          entity_id: id,
          entity_kind: kind,
          timeline_events: [timelineRecord],
          lineage,
          state_owner: "forge_workflow_runtime",
          external_database_required: false
        }
      }
    ],
    events,
    context_tenant: context.tenant || tenantId
  };
}

export function buildOpportunityPipelineMoveResult(request) {
  const input = dispatchPayload(request);
  const context = providedContext(request);
  const tenantId = input.tenant_id || input.tenant_context?.tenant_id || input.tenant_context?.id || context.tenant || "default";
  const opportunity = asObject(input.opportunity);
  const pipelineMove = asObject(input.pipeline_move ?? input.move);
  const boardContext = asObject(input.board_context ?? input.pipeline_board);
  const forecastPolicy = asObject(input.forecast_policy);
  const opportunityIdValue = opportunityId(opportunity);
  const account = opportunityAccount(opportunity);
  const workflowId = String(input.workflow_id || pipelineMove.workflow_id || "crm.opportunity.pipeline");
  const taskRef = dispatchEnvelope(request).task_ref || `move-opportunity-${slug(opportunityIdValue, "opportunity")}`;
  const funnelId = String(pipelineMove.funnel_id || opportunity.funnel_id || boardContext.funnel_id || "default");
  const fromStage = String(pipelineMove.from_stage || opportunity.stage || "research");
  const toStage = String(pipelineMove.to_stage || opportunity.next_stage || "discovery");
  const owner = pipelineMove.owner || opportunity.owner || input.owner || "sales-operations";
  const reason = pipelineMove.reason || input.reason || "Forge pipeline movement requested";
  const amount = numberFrom(forecastPolicy.amount ?? opportunity.amount ?? opportunity.value, 0);
  const probability = probabilityFrom(
    forecastPolicy.probability ?? forecastPolicy.close_probability ?? opportunity.close_probability ?? opportunity.probability
  );
  const forecastAmount = Math.round(amount * probability);
  const lanes = asArray(boardContext.lanes).length > 0
    ? asArray(boardContext.lanes).map((lane) => String(lane))
    : ["research", "discovery", "proposal", "negotiation", "won", "lost"];
  const wipLimits = asObject(boardContext.wip_limits);
  const lineage = {
    workflow_id: workflowId,
    task_ref: taskRef,
    source_contract: "crm.pipeline.stage_move.executor",
    tenant_id: tenantId,
    opportunity_id: opportunityIdValue,
    funnel_id: funnelId
  };

  return {
    schema_version: "forge.addon_executor_result.v1",
    status: "completed",
    task_ref: taskRef,
    summary: `Opportunity ${opportunityIdValue} moved from ${fromStage} to ${toStage} in ${funnelId}`,
    outputs: {
      tenant_id: tenantId,
      opportunity_id: opportunityIdValue,
      account,
      workflow_id: workflowId,
      funnel_id: funnelId,
      from_stage: fromStage,
      to_stage: toStage,
      stage_move_state: "moved",
      owner,
      forecast_amount: forecastAmount,
      mutates_crm_state: false,
      forge_event_sourced: true
    },
    artifacts: [
      {
        kind: "crm_pipeline_board",
        id: `pipeline-board-${slug(funnelId, "funnel")}`,
        title: `Pipeline board for ${funnelId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          workflow_id: workflowId,
          funnel_id: funnelId,
          lanes,
          wip_limits: wipLimits,
          moved_card: {
            opportunity_id: opportunityIdValue,
            account,
            from_stage: fromStage,
            to_stage: toStage,
            owner,
            reason
          },
          lineage,
          state_owner: "forge_workflow_runtime",
          external_database_required: false
        }
      },
      {
        kind: "crm_stage_change",
        id: `stage-change-${slug(opportunityIdValue, "opportunity")}-${slug(toStage, "stage")}`,
        title: `Stage change for ${account}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          opportunity_id: opportunityIdValue,
          account,
          funnel_id: funnelId,
          from_stage: fromStage,
          to_stage: toStage,
          owner,
          reason,
          lineage,
          mutation_policy: "stage changes are promoted as Forge workflow events"
        }
      },
      {
        kind: "crm_forecast_report",
        id: `pipeline-forecast-${slug(opportunityIdValue, "opportunity")}`,
        title: `Pipeline forecast for ${account}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          opportunity_id: opportunityIdValue,
          funnel_id: funnelId,
          amount,
          probability,
          forecast_amount: forecastAmount,
          period: forecastPolicy.period || null,
          lineage,
          state_owner: "forge_workflow_runtime"
        }
      }
    ],
    events: [
      {
        kind: "crm.opportunity.stage_changed",
        tenant_id: tenantId,
        opportunity_id: opportunityIdValue,
        workflow_id: workflowId,
        funnel_id: funnelId,
        from_stage: fromStage,
        to_stage: toStage,
        owner,
        reason
      },
      {
        kind: "crm.forecast.updated",
        tenant_id: tenantId,
        opportunity_id: opportunityIdValue,
        workflow_id: workflowId,
        funnel_id: funnelId,
        amount,
        probability,
        forecast_amount: forecastAmount
      }
    ],
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

const AREA_COPILOT_BASELINES = [
  {
    area: "commercial",
    title: "Commercial copilot",
    workflow_id: "crm.opportunity.pipeline",
    surface_id: "crm.commercial-command",
    default_action: "review_revenue_risk_and_next_commercial_step"
  },
  {
    area: "support",
    title: "Support copilot",
    workflow_id: "crm.ticket.sla",
    surface_id: "crm.support-queue",
    default_action: "prioritize_sla_recovery_and_customer_response"
  },
  {
    area: "marketing",
    title: "Marketing copilot",
    workflow_id: "crm.campaign.lifecycle",
    surface_id: "crm.marketing-calendar",
    default_action: "adjust_segment_campaign_and_nurture_workflows"
  },
  {
    area: "operations",
    title: "Operations copilot",
    workflow_id: "crm.project.handoff",
    surface_id: "crm.commercial-command",
    default_action: "unblock_handoff_owner_and_internal_tasks"
  },
  {
    area: "documents",
    title: "Documents copilot",
    workflow_id: "crm.document.approval",
    surface_id: "crm.document-queue",
    default_action: "clear_document_approval_or_rework_queue"
  }
];

function normalizeAreaCopilotContext(areaContext) {
  const context = asObject(areaContext);
  const area = slug(context.area || context.domain || context.id, "area").replace(/-/g, "_");
  const baseline = AREA_COPILOT_BASELINES.find((candidate) => candidate.area === area) || {};
  const signals = asArray(context.signals ?? context.risk_signals ?? context.evidence_signals).map((signal) => String(signal));
  const evidenceArtifacts = asArray(context.evidence_artifacts ?? context.artifacts ?? context.artifact_refs).map((artifact) => String(artifact));
  const riskSignals = signals.filter((signal) =>
    textIncludes(signal, ["risk", "breach", "blocked", "stale", "below", "waiting", "missing", "critical"])
  );

  return {
    area,
    title: context.title || baseline.title || `${area.replace(/_/g, " ")} copilot`,
    workflow_id: context.workflow_id || baseline.workflow_id || null,
    surface_id: context.surface_id || baseline.surface_id || "crm.ai-workbench",
    objective: context.objective || context.goal || "Recommend the next Forge-tracked action",
    requested_outcome: context.requested_outcome || "area recommendation",
    evidence_artifacts: evidenceArtifacts,
    signals,
    risk_signals: riskSignals,
    recommended_action: context.recommended_action || baseline.default_action || "request_forge_approval_for_next_area_step",
    state_owner: "forge_workflow_runtime",
    mutates_crm_state: false
  };
}

export function buildAreaCopilotResult(request) {
  const input = dispatchPayload(request);
  const context = providedContext(request);
  const tenantId = input.tenant_id || input.tenant_context?.tenant_id || input.tenant_context?.id || context.tenant || "default";
  const taskRef = dispatchEnvelope(request).task_ref || `area-copilot-${slug(tenantId, "tenant")}`;
  const policy = asObject(input.copilot_policy ?? input.recommendation_policy);
  const providedContexts = asArray(input.area_contexts ?? input.areas);
  const requiredAreas = asArray(policy.required_areas).length > 0
    ? asArray(policy.required_areas).map((area) => slug(area, "area").replace(/-/g, "_"))
    : AREA_COPILOT_BASELINES.map((area) => area.area);
  const providedByArea = new Map(providedContexts.map((areaContext) => {
    const normalized = normalizeAreaCopilotContext(areaContext);
    return [normalized.area, normalized];
  }));
  const specializedCopilots = requiredAreas
    .map((area) => normalizeAreaCopilotContext({ ...(providedByArea.get(area) || {}), area }))
    .sort((left, right) => left.area.localeCompare(right.area));
  const requireEvidenceRefs = policy.require_evidence_refs !== false;
  const readyCopilots = specializedCopilots.filter((copilot) => copilot.workflow_id && (!requireEvidenceRefs || copilot.evidence_artifacts.length > 0));
  const riskSignals = specializedCopilots.flatMap((copilot) =>
    copilot.risk_signals.map((signal) => ({
      area: copilot.area,
      workflow_id: copilot.workflow_id,
      signal
    }))
  );
  const mutationPolicy = policy.mutation_policy || "recommendation_only_until_forge_approval";
  const acceptanceStatus = readyCopilots.length === specializedCopilots.length ? "ready_for_area_review" : "missing_area_evidence";

  return {
    schema_version: "forge.addon_executor_result.v1",
    status: "completed",
    task_ref: taskRef,
    summary: `CRM area copilots generated ${specializedCopilots.length} specialized recommendation briefs for ${tenantId}`,
    outputs: {
      tenant_id: tenantId,
      workflow_id: input.workflow_id || "crm.ai.copilot.recommendation",
      acceptance_status: acceptanceStatus,
      area_count: specializedCopilots.length,
      ready_area_count: readyCopilots.length,
      risk_signal_count: riskSignals.length,
      copilot_modes: specializedCopilots.map((copilot) => copilot.area),
      specialized_copilots: specializedCopilots,
      mutates_crm_state: false,
      mutation_requires_workflow_approval: true,
      forge_event_sourced: true
    },
    artifacts: [
      {
        kind: "crm_area_copilot_brief",
        id: `crm-area-copilot-brief-${slug(tenantId, "tenant")}`,
        title: `CRM area copilot brief for ${tenantId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          specialized_copilots: specializedCopilots,
          policy: mutationPolicy,
          state_owner: "forge_workflow_runtime"
        }
      },
      {
        kind: "crm_ai_recommendation",
        id: `crm-area-copilot-recommendations-${slug(tenantId, "tenant")}`,
        title: `CRM area recommendations for ${tenantId}`,
        content_type: "application/json",
        data: {
          recommendations: specializedCopilots.map((copilot) => ({
            area: copilot.area,
            workflow_id: copilot.workflow_id,
            recommended_action: copilot.recommended_action,
            requires_forge_approval: true
          })),
          policy: mutationPolicy
        }
      },
      {
        kind: "crm_risk_analysis",
        id: `crm-area-copilot-risks-${slug(tenantId, "tenant")}`,
        title: `CRM area copilot risk signals for ${tenantId}`,
        content_type: "application/json",
        data: {
          risk_signals: riskSignals,
          risk_count: riskSignals.length,
          closure_policy: "risk closure requires Forge workflow evidence"
        }
      }
    ],
    events: [
      {
        kind: "crm.ai.area_copilot_generated",
        tenant_id: tenantId,
        area_count: specializedCopilots.length,
        ready_area_count: readyCopilots.length
      },
      {
        kind: "crm.ai.recommendation_generated",
        tenant_id: tenantId,
        recommendation_count: specializedCopilots.length,
        source_contract: "crm.ai.area_copilot.executor"
      },
      ...(riskSignals.length > 0
        ? [
            {
              kind: "crm.ai.risk_flagged",
              tenant_id: tenantId,
              risk_count: riskSignals.length,
              source_contract: "crm.ai.area_copilot.executor"
            }
          ]
        : [])
    ],
    context_tenant: context.tenant || tenantId
  };
}

const WORK_QUEUE_BASELINES = [
  {
    queue: "approvals",
    title: "Approval queue",
    workflow_ids: ["crm.proposal.approval", "crm.document.approval", "crm.campaign.lifecycle"],
    default_owner: "operations.approvals",
    permission: "crm.workflow.mutate",
    recommended_action: "review_pending_approval_with_forge_evidence"
  },
  {
    queue: "sla",
    title: "SLA queue",
    workflow_ids: ["crm.ticket.sla"],
    default_owner: "support.lead",
    permission: "crm.omnichannel.ingest",
    recommended_action: "prioritize_sla_recovery_workflow"
  },
  {
    queue: "documents",
    title: "Document queue",
    workflow_ids: ["crm.document.approval", "crm.contract.signature", "crm.proposal.approval"],
    default_owner: "document.ops",
    permission: "crm.document.generate",
    recommended_action: "clear_document_validation_or_rework"
  },
  {
    queue: "campaigns",
    title: "Campaign queue",
    workflow_ids: ["crm.campaign.lifecycle", "crm.lead.nurture"],
    default_owner: "marketing.ops",
    permission: "crm.workflow.mutate",
    recommended_action: "approve_or_reschedule_campaign_workflow"
  },
  {
    queue: "handoffs",
    title: "Handoff queue",
    workflow_ids: ["crm.project.handoff", "crm.account.management"],
    default_owner: "delivery.ops",
    permission: "crm.workflow.mutate",
    recommended_action: "assign_handoff_owner_and_unblock_tasks"
  },
  {
    queue: "blocked_waits",
    title: "Blocked wait queue",
    workflow_ids: ["crm.followup.forecast", "crm.contract.signature", "crm.project.handoff"],
    default_owner: "ops.commander",
    permission: "crm.observability.inspect",
    recommended_action: "inspect_wait_state_and_request_resolution"
  }
];

function queueKey(value, fallback = "work_queue") {
  return slug(value, fallback).replace(/-/g, "_");
}

function workQueueBaseline(queue) {
  return WORK_QUEUE_BASELINES.find((baseline) => baseline.queue === queue) || {
    queue,
    title: `${queue.replace(/_/g, " ")} queue`,
    workflow_ids: [],
    default_owner: "ops.commander",
    permission: "crm.workflow.mutate",
    recommended_action: "review_queue_item_with_forge_evidence"
  };
}

function defaultWorkQueueItems() {
  return WORK_QUEUE_BASELINES.map((baseline, index) => ({
    id: `${baseline.queue}-default-${index + 1}`,
    queue: baseline.queue,
    workflow_id: baseline.workflow_ids[0] || "crm.work.queue.orchestration",
    state: baseline.queue === "sla" ? "sla_escalation" : baseline.queue === "handoffs" ? "blocked_wait" : "approval_wait",
    owner: baseline.default_owner,
    artifact_refs: [`crm_work_queue_snapshot:${baseline.queue}`],
    event_refs: ["crm.queue.snapshot_generated"],
    priority: baseline.queue === "sla" || baseline.queue === "handoffs" ? "high" : "medium",
    sla_minutes_remaining: baseline.queue === "sla" ? 30 : undefined
  }));
}

function normalizeWorkQueueItem(item, policy, index) {
  const source = asObject(item);
  const queue = queueKey(source.queue || source.queue_id || source.kind || source.type, "work_queue");
  const baseline = workQueueBaseline(queue);
  const rawOwner = source.owner || source.assignee || source.owner_id || source.assigned_to || null;
  const owner = rawOwner || policy.default_owner || baseline.default_owner;
  const workflowId = String(source.workflow_id || baseline.workflow_ids[0] || "crm.work.queue.orchestration");
  const state = String(source.state || source.status || "review_wait");
  const priority = String(source.priority || source.severity || "medium").toLowerCase();
  const artifactRefs = asArray(source.artifact_refs ?? source.artifacts ?? source.evidence_artifacts).map((artifact) => String(artifact));
  const eventRefs = asArray(source.event_refs ?? source.events ?? source.evidence_events).map((event) => String(event));
  const slaMinutesRemaining = source.sla_minutes_remaining === undefined ? null : numberFrom(source.sla_minutes_remaining, null);
  const threshold = numberFrom(policy.risk_threshold_minutes, 60);
  const riskReasons = [];

  if (!rawOwner) {
    riskReasons.push("missing_owner");
  }
  if (["critical", "high"].includes(priority)) {
    riskReasons.push("high_priority");
  }
  if (slaMinutesRemaining !== null && slaMinutesRemaining <= threshold) {
    riskReasons.push("sla_threshold");
  }
  if (textIncludes(state, ["blocked", "escalation", "rework", "breach"])) {
    riskReasons.push("blocked_or_rework_state");
  }

  return {
    id: String(source.id || source.item_id || `${queue}-${index + 1}`),
    queue,
    title: source.title || source.summary || `${baseline.title} item`,
    workflow_id: workflowId,
    state,
    owner,
    owner_missing: !rawOwner,
    priority,
    sla_minutes_remaining: slaMinutesRemaining,
    artifact_refs: artifactRefs,
    event_refs: eventRefs,
    ready: Boolean(workflowId && state && artifactRefs.length + eventRefs.length > 0),
    risk_reasons: unique(riskReasons),
    state_owner: "forge_workflow_runtime",
    mutates_crm_state: false
  };
}

function buildWorkQueueAssignments(queueSummaries, itemsByQueue, policy) {
  const queueOwners = asObject(policy.queue_owners);
  return queueSummaries.map((queueSummary) => {
    const baseline = workQueueBaseline(queueSummary.queue);
    const items = itemsByQueue.get(queueSummary.queue) || [];
    const owner = queueOwners[queueSummary.queue] || items.find((item) => !item.owner_missing)?.owner || policy.default_owner || baseline.default_owner;

    return {
      queue: queueSummary.queue,
      title: baseline.title,
      owner,
      workflow_ids: queueSummary.workflow_ids,
      item_ids: items.map((item) => item.id),
      risk_item_count: queueSummary.risk_item_count,
      recommended_action: baseline.recommended_action,
      command_action_id: "crm.run-work-queue",
      contract_id: "crm.queue.orchestrator.executor",
      permission: baseline.permission,
      requires_forge_approval: true,
      state_owner: "forge_workflow_runtime"
    };
  });
}

export function buildWorkQueueOrchestrationResult(request) {
  const input = dispatchPayload(request);
  const context = providedContext(request);
  const tenantId = input.tenant_id || input.tenant_context?.tenant_id || input.tenant_context?.id || context.tenant || "default";
  const taskRef = dispatchEnvelope(request).task_ref || `crm-work-queue-${slug(tenantId, "tenant")}`;
  const policy = asObject(input.assignment_policy ?? input.queue_policy);
  const providedItems = asArray(input.queue_items ?? input.items);
  const queueItems = (providedItems.length > 0 ? providedItems : defaultWorkQueueItems()).map((item, index) =>
    normalizeWorkQueueItem(item, policy, index)
  );
  const requiredQueues = asArray(policy.required_queues).length > 0
    ? asArray(policy.required_queues).map((queue) => queueKey(queue, "work_queue"))
    : WORK_QUEUE_BASELINES.map((baseline) => baseline.queue);
  const queueModes = unique([...requiredQueues, ...queueItems.map((item) => item.queue)]).sort((left, right) => left.localeCompare(right));
  const itemsByQueue = new Map(queueModes.map((queue) => [queue, queueItems.filter((item) => item.queue === queue)]));
  const queueSummaries = queueModes.map((queue) => {
    const items = itemsByQueue.get(queue) || [];
    const baseline = workQueueBaseline(queue);
    return {
      queue,
      title: baseline.title,
      workflow_ids: unique([...baseline.workflow_ids, ...items.map((item) => item.workflow_id)]).filter(Boolean).sort(),
      item_count: items.length,
      ready_item_count: items.filter((item) => item.ready).length,
      risk_item_count: items.filter((item) => item.risk_reasons.length > 0).length,
      ownership_gap_count: items.filter((item) => item.owner_missing).length,
      action_id: "crm.run-work-queue",
      state_owner: "forge_workflow_runtime"
    };
  });
  const assignments = buildWorkQueueAssignments(queueSummaries, itemsByQueue, policy);
  const riskItems = queueItems.filter((item) => item.risk_reasons.length > 0);
  const ownershipGapCount = queueItems.filter((item) => item.owner_missing).length;
  const readyItemCount = queueItems.filter((item) => item.ready).length;
  const mutationPolicy = policy.mutation_policy || "recommendation_only_until_forge_approval";

  return {
    schema_version: "forge.addon_executor_result.v1",
    status: "completed",
    task_ref: taskRef,
    summary: `CRM work queue orchestration packaged ${queueItems.length} items across ${queueSummaries.length} queues for ${tenantId}`,
    outputs: {
      tenant_id: tenantId,
      workflow_id: "crm.work.queue.orchestration",
      queue_count: queueSummaries.length,
      item_count: queueItems.length,
      ready_item_count: readyItemCount,
      risk_item_count: riskItems.length,
      ownership_gap_count: ownershipGapCount,
      queue_modes: queueModes,
      queues: queueSummaries,
      assignments,
      recommended_actions: assignments.map((assignment) => ({
        queue: assignment.queue,
        action_id: assignment.command_action_id,
        recommended_action: assignment.recommended_action,
        requires_forge_approval: assignment.requires_forge_approval
      })),
      mutates_crm_state: false,
      mutation_requires_workflow_approval: true,
      forge_event_sourced: true,
      state_owner: "forge_workflow_runtime"
    },
    artifacts: [
      {
        kind: "crm_work_queue_snapshot",
        id: `crm-work-queue-snapshot-${slug(tenantId, "tenant")}`,
        title: `CRM work queue snapshot for ${tenantId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          queue_modes: queueModes,
          queues: queueSummaries,
          items: queueItems,
          state_owner: "forge_workflow_runtime"
        }
      },
      {
        kind: "crm_queue_assignment_plan",
        id: `crm-queue-assignment-plan-${slug(tenantId, "tenant")}`,
        title: `CRM queue assignment plan for ${tenantId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          assignments,
          mutation_policy: mutationPolicy,
          approval_policy: "queue assignments require Forge workflow approval before mutation"
        }
      },
      {
        kind: "crm_queue_sla_risk_report",
        id: `crm-queue-sla-risk-report-${slug(tenantId, "tenant")}`,
        title: `CRM queue SLA and risk report for ${tenantId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          risk_item_count: riskItems.length,
          ownership_gap_count: ownershipGapCount,
          risk_items: riskItems,
          closure_policy: "risk closure requires Forge workflow artifact or event evidence"
        }
      }
    ],
    events: [
      {
        kind: "crm.queue.snapshot_generated",
        tenant_id: tenantId,
        queue_count: queueSummaries.length,
        item_count: queueItems.length
      },
      {
        kind: "crm.queue.assignment_planned",
        tenant_id: tenantId,
        assignment_count: assignments.length,
        ownership_gap_count: ownershipGapCount
      },
      ...(riskItems.length > 0
        ? [
            {
              kind: "crm.queue.risk_flagged",
              tenant_id: tenantId,
              risk_item_count: riskItems.length,
              source_contract: "crm.queue.orchestrator.executor"
            }
          ]
        : [])
    ],
    context_tenant: context.tenant || tenantId
  };
}

const DESIGN_SYSTEM_BASE_TOKENS = {
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

const DESIGN_SYSTEM_COMPONENTS = [
  {
    id: "workflow_node",
    title: "Workflow node",
    surface_ids: ["crm.system-map"],
    states: ["ready", "waiting", "risk", "complete"]
  },
  {
    id: "queue_card",
    title: "Queue card",
    surface_ids: ["crm.support-queue", "crm.document-queue", "crm.work-queue"],
    states: ["normal", "at_risk", "blocked", "approval_wait"]
  },
  {
    id: "document_row",
    title: "Document row",
    surface_ids: ["crm.document-queue"],
    states: ["draft", "approval_wait", "approved", "rework_required"]
  },
  {
    id: "command_action",
    title: "Command action",
    surface_ids: ["crm.operational-cockpit", "crm.ai-workbench"],
    states: ["enabled", "permission_wait", "executing", "completed"]
  },
  {
    id: "metric_tile",
    title: "Metric tile",
    surface_ids: ["crm.commercial-command", "crm.system-map"],
    states: ["neutral", "positive", "attention", "risk"]
  }
];

function mergeDesignTokens(overrides) {
  const overrideObject = asObject(overrides);
  const merged = {
    ...DESIGN_SYSTEM_BASE_TOKENS,
    color: {
      ...DESIGN_SYSTEM_BASE_TOKENS.color,
      ...asObject(overrideObject.color)
    },
    radius: {
      ...DESIGN_SYSTEM_BASE_TOKENS.radius,
      ...asObject(overrideObject.radius)
    }
  };
  if (overrideObject.density) {
    merged.density = String(overrideObject.density);
  }
  return merged;
}

function requestedDesignComponents(componentRequests) {
  const requestedIds = asArray(componentRequests).map((component) => slug(component, "component").replace(/-/g, "_"));
  const selected = requestedIds.length > 0
    ? DESIGN_SYSTEM_COMPONENTS.filter((component) => requestedIds.includes(component.id))
    : DESIGN_SYSTEM_COMPONENTS;
  const selectedOrDefault = selected.length > 0 ? selected : DESIGN_SYSTEM_COMPONENTS;
  return selectedOrDefault.map((component) => ({
    ...component,
    state_source: "forge_workflow_artifacts_and_events",
    artifact_type: "crm_ui_component_catalog"
  }));
}

export function buildDesignSystemResult(request) {
  const input = dispatchPayload(request);
  const context = providedContext(request);
  const tenantId = input.tenant_id || input.tenant_context?.tenant_id || input.tenant_context?.id || context.tenant || "default";
  const taskRef = dispatchEnvelope(request).task_ref || `crm-design-system-${slug(tenantId, "tenant")}`;
  const brandContext = asObject(input.brand_context ?? input.brand);
  const designPolicy = asObject(input.design_policy ?? input.policy);
  const tokens = mergeDesignTokens(input.token_overrides ?? input.tokens);
  const components = requestedDesignComponents(input.component_requests ?? input.components);
  const inspiration = asArray(designPolicy.inspiration).length > 0 ? asArray(designPolicy.inspiration) : ["penpot", "open_design"];
  const stateSource = designPolicy.state_source || "forge_workflow_artifacts_and_events";
  const directBrowserPersistence = designPolicy.direct_browser_persistence === true;

  return {
    schema_version: "forge.addon_executor_result.v1",
    status: "completed",
    task_ref: taskRef,
    summary: `CRM design system generated ${components.length} components and Forge-owned tokens for ${tenantId}`,
    outputs: {
      tenant_id: tenantId,
      workflow_id: input.workflow_id || "crm.design.system",
      design_system: "penpot_open_design_inspired_tokens",
      token_count: Object.values(tokens).reduce((count, value) => count + (typeof value === "object" ? Object.keys(value).length : 1), 0),
      component_count: components.length,
      tokens,
      components,
      inspiration,
      state_source: stateSource,
      direct_browser_persistence: directBrowserPersistence,
      mutates_crm_state: false,
      forge_event_sourced: true
    },
    artifacts: [
      {
        kind: "crm_design_system",
        id: `crm-design-system-${slug(tenantId, "tenant")}`,
        title: `CRM design system for ${tenantId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          brand_context: brandContext,
          design_system: "penpot_open_design_inspired_tokens",
          inspiration,
          state_source: stateSource,
          direct_browser_persistence: directBrowserPersistence
        }
      },
      {
        kind: "crm_design_token_manifest",
        id: `crm-design-tokens-${slug(tenantId, "tenant")}`,
        title: `CRM design token manifest for ${tenantId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          tokens,
          policy: "tokens are consumed from Forge artifacts before UI rendering"
        }
      },
      {
        kind: "crm_ui_component_catalog",
        id: `crm-ui-component-catalog-${slug(tenantId, "tenant")}`,
        title: `CRM UI component catalog for ${tenantId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          components,
          state_source: stateSource
        }
      }
    ],
    events: [
      {
        kind: "crm.design.system_generated",
        tenant_id: tenantId,
        component_count: components.length,
        design_system: "penpot_open_design_inspired_tokens"
      },
      {
        kind: "crm.design.tokens_published",
        tenant_id: tenantId,
        token_count: Object.values(tokens).reduce((count, value) => count + (typeof value === "object" ? Object.keys(value).length : 1), 0)
      }
    ],
    context_tenant: context.tenant || tenantId
  };
}

export function buildMemoryPromotionCandidateResult(request) {
  const input = dispatchPayload(request);
  const context = providedContext(request);
  const tenantId = input.tenant_id || input.tenant_context?.tenant_id || input.tenant_context?.id || context.tenant || "default";
  const sourceMemory = asObject(input.source_memory ?? input.memory);
  const curatedKnowledge = asObject(input.curated_knowledge ?? input.knowledge);
  const policy = asObject(input.promotion_policy ?? input.memory_policy);
  const workflowId = String(input.workflow_id || sourceMemory.workflow_id || dispatchEnvelope(request).workflow_id || "crm.ai.copilot.recommendation");
  const taskRef = dispatchEnvelope(request).task_ref || `memory-promotion-${slug(tenantId, "tenant")}`;
  const fromScope = String(policy.from_scope || sourceMemory.scope || "processing");
  const toScope = String(policy.to_scope || policy.scope || "project");
  const memoryLevel = String(policy.memory_level || (toScope === "processing" ? "short_term" : "standard"));
  const visibility = String(policy.visibility || policy.audience || "internal");
  const shareability = String(policy.shareability || `${toScope}_shared`);
  const approvedBy = policy.approved_by || policy.approver || null;
  const reason = policy.reason || "Curated CRM knowledge is reusable for future workflow context";
  const summary = String(curatedKnowledge.summary || sourceMemory.summary || "Curated CRM knowledge");
  const sourceRefs = asArray(curatedKnowledge.source_refs ?? curatedKnowledge.sources);
  const evidence = asArray(curatedKnowledge.evidence);
  const sourcePath = String(sourceMemory.source_path || sourceMemory.path || `artifacts/${workflowId}/crm-knowledge-summary.json`);
  const commandApprover = approvedBy || "<approver>";
  const promotionCommand = [
    "forge memory promote",
    `--workflow ${workflowId}`,
    `--from-scope ${fromScope}`,
    `--to-scope ${toScope}`,
    `--source-path ${sourcePath}`,
    `--summary ${JSON.stringify(summary)}`,
    `--approved-by ${commandApprover}`,
    `--reason ${JSON.stringify(reason)}`,
    `--visibility ${visibility}`,
    `--shareability ${shareability}`
  ].join(" ");
  const lineage = {
    workflow_id: workflowId,
    task_ref: taskRef,
    source_contract: "crm.memory.promotion.executor",
    tenant_id: tenantId,
    source_scope: fromScope,
    target_scope: toScope
  };

  return {
    schema_version: "forge.addon_executor_result.v1",
    status: "completed",
    task_ref: taskRef,
    summary: `Prepared governed CRM memory promotion from ${fromScope} to ${toScope}`,
    outputs: {
      tenant_id: tenantId,
      workflow_id: workflowId,
      from_scope: fromScope,
      to_scope: toScope,
      memory_level: memoryLevel,
      visibility,
      shareability,
      approval_required: true,
      approved_by: approvedBy,
      core_promotion_owner: "forge.memory.promote",
      promotion_command: promotionCommand,
      mutates_crm_state: false,
      forge_event_sourced: true
    },
    artifacts: [
      {
        kind: "crm_knowledge_summary",
        id: `crm-knowledge-summary-${slug(tenantId, "tenant")}-${slug(toScope, "scope")}`,
        title: `CRM curated knowledge for ${tenantId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          summary,
          source_refs: sourceRefs,
          evidence,
          source_scope: fromScope,
          target_scope: toScope,
          visibility,
          shareability,
          memory_level: memoryLevel,
          lineage,
          raw_private_memory_included: false
        }
      },
      {
        kind: "crm_memory_promotion_request",
        id: `crm-memory-promotion-${slug(tenantId, "tenant")}-${slug(toScope, "scope")}`,
        title: `CRM memory promotion request for ${tenantId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          workflow_id: workflowId,
          source_path: sourcePath,
          from_scope: fromScope,
          to_scope: toScope,
          memory_level: memoryLevel,
          visibility,
          shareability,
          approved_by: approvedBy,
          reason,
          promotion_command: promotionCommand,
          core_promotion_owner: "forge.memory.promote",
          approval_required: true,
          lineage
        }
      }
    ],
    events: [
      {
        kind: "crm.memory.knowledge_curated",
        tenant_id: tenantId,
        workflow_id: workflowId,
        source_scope: fromScope,
        target_scope: toScope,
        source_ref_count: sourceRefs.length
      },
      {
        kind: "crm.memory.promotion_requested",
        tenant_id: tenantId,
        workflow_id: workflowId,
        from_scope: fromScope,
        to_scope: toScope,
        approved_by: approvedBy,
        approval_required: true
      }
    ],
    context_tenant: context.tenant || tenantId
  };
}

function metricValue(metrics, name, fallback = 0) {
  const found = asArray(metrics).find((metric) => String(metric.name || metric.id) === name);
  return numberFrom(found?.value, fallback);
}

export function buildWorkflowEvolutionResult(request) {
  const input = dispatchPayload(request);
  const context = providedContext(request);
  const tenantId = input.tenant_id || input.tenant_context?.tenant_id || input.tenant_context?.id || context.tenant || "default";
  const workflowState = asObject(input.workflow_state ?? input.workflow);
  const observabilityReport = asObject(input.observability_report ?? input.observability);
  const benchmarkPolicy = asObject(input.benchmark_policy ?? input.policy);
  const workflowId = String(workflowState.workflow_id || input.workflow_id || "crm.workflow.evolution");
  const taskRef = dispatchEnvelope(request).task_ref || `workflow-evolution-${slug(workflowId, "workflow")}`;
  const candidates = asArray(input.candidate_changes ?? input.candidates).map((candidate, index) => {
    const candidateObject = asObject(candidate);
    const id = String(candidateObject.id || `candidate-${index + 1}`);
    return {
      id,
      title: candidateObject.title || `CRM workflow evolution candidate ${index + 1}`,
      target_workflow_id: candidateObject.target_workflow_id || workflowId,
      expected_metric: candidateObject.expected_metric || benchmarkPolicy.required_metric || "cycle_time_minutes",
      expected_delta: numberFrom(candidateObject.expected_delta, 0),
      changelog: candidateObject.changelog || `Evolve ${candidateObject.target_workflow_id || workflowId} through Forge-controlled experiment ${id}.`,
      rollback_plan: candidateObject.rollback_plan || "rollback through Forge improve rollback gate before promotion"
    };
  });
  const fallbackCandidate = {
    id: `observe-${slug(workflowId, "workflow")}`,
    title: `Inspect ${workflowId} for controlled evolution`,
    target_workflow_id: workflowId,
    expected_metric: benchmarkPolicy.required_metric || "cycle_time_minutes",
    expected_delta: 0,
    changelog: `Collect stronger observability before mutating ${workflowId}.`,
    rollback_plan: "no mutation proposed until benchmark evidence exists"
  };
  const plannedCandidates = candidates.length > 0 ? candidates : [fallbackCandidate];
  const requiredMetric = String(benchmarkPolicy.required_metric || plannedCandidates[0].expected_metric);
  const baselineMetric = metricValue(observabilityReport.metric_samples ?? observabilityReport.metrics, requiredMetric, 0);
  const acceptanceThreshold = numberFrom(benchmarkPolicy.acceptance_threshold, 0);
  const projectedBenchmarkPass =
    baselineMetric > 0 &&
    acceptanceThreshold > 0 &&
    (plannedCandidates[0].expected_delta < 0
      ? baselineMetric + plannedCandidates[0].expected_delta <= acceptanceThreshold
      : baselineMetric + plannedCandidates[0].expected_delta >= acceptanceThreshold);
  const benchmarkReceipt = asObject(input.benchmark_receipt ?? input.benchmark_result);
  const benchmarkPassed =
    benchmarkPolicy.benchmark_passed === true ||
    benchmarkReceipt.passed === true ||
    benchmarkReceipt.status === "passed";
  const candidateId = plannedCandidates[0].id;
  const validationCommand =
    benchmarkPolicy.validation_command ||
    `forge improve benchmark-event-policy --workflow ${workflowId} --policy ${candidateId} --output json`;
  const recommendedCommands = [
    `forge improve --workflow ${workflowId} --target-version ${slug(candidateId, "candidate")} --output json`,
    validationCommand,
    `forge improve promote-event-policy --workflow ${workflowId} --policy ${candidateId} --approved-by ${benchmarkPolicy.approved_by || "<operator>"} --output json`
  ];
  const lineage = {
    workflow_id: workflowId,
    task_ref: taskRef,
    source_contract: "crm.workflow.evolution.executor",
    tenant_id: tenantId,
    candidate_id: candidateId
  };
  const promotionAllowed = Boolean(benchmarkPassed && benchmarkPolicy.approved_by);
  const promotionDecision = promotionAllowed ? "ready_for_governed_promotion" : "blocked_until_benchmark_and_approval";
  const gapReasons = asArray(input.core_gap_reasons ?? input.core_gaps);

  return {
    schema_version: "forge.addon_executor_result.v1",
    status: "completed",
    task_ref: taskRef,
    summary: `CRM workflow evolution prepared ${plannedCandidates.length} Forge-governed candidate(s) for ${workflowId}`,
    outputs: {
      tenant_id: tenantId,
      workflow_id: workflowId,
      evolution_state: promotionAllowed ? "promotion_ready" : "benchmark_wait",
      candidate_count: plannedCandidates.length,
      benchmark_metric: requiredMetric,
      baseline_metric: baselineMetric,
      acceptance_threshold: acceptanceThreshold,
      promotion_allowed: promotionAllowed,
      promotion_decision: promotionDecision,
      requires_forge_improve: true,
      recommended_commands: recommendedCommands,
      mutates_crm_state: false,
      forge_event_sourced: true
    },
    artifacts: [
      {
        kind: "crm_workflow_evolution_plan",
        id: `crm-workflow-evolution-plan-${slug(workflowId, "workflow")}`,
        title: `CRM workflow evolution plan for ${workflowId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          workflow_state: workflowState,
          observability_report: observabilityReport,
          candidates: plannedCandidates,
          recommended_commands: recommendedCommands,
          state_owner: "forge_workflow_runtime",
          local_self_modification_allowed: false,
          lineage
        }
      },
      {
        kind: "crm_evolution_experiment",
        id: `crm-evolution-experiment-${slug(candidateId, "candidate")}`,
        title: `CRM evolution experiment ${candidateId}`,
        content_type: "application/json",
        data: {
          candidate: plannedCandidates[0],
          required_changelog: plannedCandidates[0].changelog,
          rollback_plan: plannedCandidates[0].rollback_plan,
          benchmark_command: validationCommand,
          promotion_requires_validation: true,
          lineage
        }
      },
      {
        kind: "crm_benchmark_report",
        id: `crm-benchmark-report-${slug(candidateId, "candidate")}`,
        title: `CRM benchmark report for ${candidateId}`,
        content_type: "application/json",
        data: {
          required_metric: requiredMetric,
          baseline_metric: baselineMetric,
          expected_delta: plannedCandidates[0].expected_delta,
          acceptance_threshold: acceptanceThreshold,
          projected_benchmark_pass: projectedBenchmarkPass,
          benchmark_passed: benchmarkPassed,
          benchmark_command: validationCommand,
          lineage
        }
      },
      {
        kind: "crm_promotion_decision",
        id: `crm-promotion-decision-${slug(candidateId, "candidate")}`,
        title: `CRM promotion decision for ${candidateId}`,
        content_type: "application/json",
        data: {
          decision: promotionDecision,
          promotion_allowed: promotionAllowed,
          approved_by: benchmarkPolicy.approved_by || null,
          blocked_reason: promotionAllowed ? null : "benchmark evidence and explicit approval required",
          promote_command: recommendedCommands[2],
          lineage
        }
      },
      {
        kind: "crm_core_gap_report",
        id: `crm-core-gap-report-${slug(workflowId, "workflow")}`,
        title: `CRM Core gap report for ${workflowId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          workflow_id: workflowId,
          gap_count: gapReasons.length,
          gaps: gapReasons,
          policy: "Core primitive gaps must be implemented in forge-core before CRM-local workarounds",
          target_repository: "forge-core",
          lineage
        }
      }
    ],
    events: [
      {
        kind: "crm.evolution.candidate_generated",
        tenant_id: tenantId,
        workflow_id: workflowId,
        candidate_count: plannedCandidates.length
      },
      {
        kind: "crm.evolution.experiment_designed",
        tenant_id: tenantId,
        workflow_id: workflowId,
        candidate_id: candidateId
      },
      {
        kind: "crm.evolution.benchmark_reported",
        tenant_id: tenantId,
        workflow_id: workflowId,
        candidate_id: candidateId,
        benchmark_passed: benchmarkPassed
      },
      {
        kind: "crm.evolution.promotion_decision_recorded",
        tenant_id: tenantId,
        workflow_id: workflowId,
        candidate_id: candidateId,
        promotion_allowed: promotionAllowed
      },
      ...(gapReasons.length > 0
        ? [
            {
              kind: "crm.core_gap.reported",
              tenant_id: tenantId,
              workflow_id: workflowId,
              gap_count: gapReasons.length
            }
          ]
        : [])
    ],
    context_tenant: context.tenant || tenantId
  };
}

const ENTERPRISE_JOURNEY_STAGES = [
  {
    id: "lead_capture",
    title: "Lead captured",
    domain: "marketing",
    workflow_id: "crm.lead.lifecycle",
    contract_id: "crm.marketing.form_capture.executor",
    required_artifacts: ["crm_lead_capture"],
    required_events: ["crm.lead.created"]
  },
  {
    id: "opportunity",
    title: "Opportunity opened",
    domain: "relationship",
    workflow_id: "crm.opportunity.pipeline",
    contract_id: "crm.pipeline.stage_move.executor",
    required_artifacts: ["crm_pipeline_board"],
    required_events: ["crm.opportunity.stage_changed"]
  },
  {
    id: "proposal",
    title: "Proposal generated and approved",
    domain: "commercial",
    workflow_id: "crm.proposal.approval",
    contract_id: "crm.proposal.generator.executor",
    required_artifacts: ["crm_proposal"],
    required_events: ["crm.proposal.generated"]
  },
  {
    id: "contract",
    title: "Contract signed",
    domain: "commercial",
    workflow_id: "crm.contract.signature",
    contract_id: "crm.commercial.contract_signature.executor",
    required_artifacts: ["crm_contract", "crm_signature_receipt"],
    required_events: ["crm.contract.signed"]
  },
  {
    id: "account",
    title: "Account managed",
    domain: "commercial",
    workflow_id: "crm.account.management",
    contract_id: "crm.commercial.account_management.executor",
    required_artifacts: ["crm_account_plan"],
    required_events: ["crm.account.health_reviewed"]
  },
  {
    id: "support",
    title: "Support ticket handled",
    domain: "support",
    workflow_id: "crm.ticket.sla",
    contract_id: "crm.support.ticket_sla.executor",
    required_artifacts: ["crm_support_summary"],
    required_events: ["crm.ticket.created"]
  },
  {
    id: "handoff",
    title: "Project handoff accepted",
    domain: "operations",
    workflow_id: "crm.project.handoff",
    contract_id: "crm.operations.project_handoff.executor",
    required_artifacts: ["crm_project_plan", "crm_task_plan"],
    required_events: ["crm.project.handoff_requested"]
  }
];

function normalizeJourneyStage(stage) {
  const stageObject = asObject(stage);
  const stageId = String(stageObject.id || stageObject.stage_id || "");
  const baseline = ENTERPRISE_JOURNEY_STAGES.find((candidate) => candidate.id === stageId) || {};
  return {
    id: stageId || baseline.id || "unknown_stage",
    title: stageObject.title || baseline.title || stageId || "Unknown stage",
    domain: stageObject.domain || baseline.domain || "operations",
    workflow_id: stageObject.workflow_id || baseline.workflow_id || null,
    contract_id: stageObject.contract_id || baseline.contract_id || null,
    artifact_refs: asArray(stageObject.artifact_refs ?? stageObject.artifacts),
    event_refs: asArray(stageObject.event_refs ?? stageObject.events),
    required_artifacts: asArray(stageObject.required_artifacts ?? baseline.required_artifacts),
    required_events: asArray(stageObject.required_events ?? baseline.required_events),
    owner: stageObject.owner || "forge_workflow_runtime",
    external_dependency: stageObject.external_dependency === true
  };
}

export function buildEnterpriseJourneyResult(request) {
  const input = dispatchPayload(request);
  const context = providedContext(request);
  const tenantId = input.tenant_id || input.tenant_context?.tenant_id || input.tenant_context?.id || context.tenant || "default";
  const taskRef = dispatchEnvelope(request).task_ref || `enterprise-journey-${slug(tenantId, "tenant")}`;
  const journey = asObject(input.journey_context ?? input.journey);
  const journeyId = String(journey.id || journey.journey_id || `journey-${slug(tenantId, "tenant")}`);
  const account = journey.account || journey.account_name || input.account || "Unknown account";
  const acceptancePolicy = asObject(input.acceptance_policy ?? input.policy);
  const requiredStageIds = asArray(acceptancePolicy.required_stage_ids).length > 0
    ? asArray(acceptancePolicy.required_stage_ids).map((stage) => String(stage))
    : ENTERPRISE_JOURNEY_STAGES.map((stage) => stage.id);
  const requiredDomains = asArray(acceptancePolicy.required_domains).length > 0
    ? asArray(acceptancePolicy.required_domains).map((domain) => String(domain))
    : ["relationship", "commercial", "support", "marketing", "operations"];
  const providedStages = asArray(input.stage_evidence ?? input.stages).map(normalizeJourneyStage);
  const stageById = new Map(providedStages.map((stage) => [stage.id, stage]));
  const normalizedStages = requiredStageIds.map((stageId) => {
    const provided = stageById.get(stageId);
    const baseline = normalizeJourneyStage({ id: stageId });
    return provided || baseline;
  });
  const stageReceipts = normalizedStages.map((stage) => {
    const missingArtifacts = stage.required_artifacts.filter((artifact) => !stage.artifact_refs.includes(artifact));
    const missingEvents = stage.required_events.filter((event) => !stage.event_refs.includes(event));
    const ready = Boolean(stage.workflow_id && stage.contract_id && missingArtifacts.length === 0 && missingEvents.length === 0);
    return {
      ...stage,
      ready,
      missing_artifacts: missingArtifacts,
      missing_events: missingEvents,
      state_owner: "forge_workflow_runtime"
    };
  });
  const coveredDomains = unique(stageReceipts.filter((stage) => stage.ready).map((stage) => stage.domain));
  const missingDomains = requiredDomains.filter((domain) => !coveredDomains.includes(domain));
  const missingStages = stageReceipts.filter((stage) => !stage.ready);
  const externalDependency = stageReceipts.some((stage) => stage.external_dependency);
  const acceptanceStatus = missingStages.length === 0 && missingDomains.length === 0 && !externalDependency
    ? "operable_end_to_end"
    : "rework_required";
  const workflowId = "crm.enterprise.customer_journey";
  const lineage = {
    workflow_id: workflowId,
    task_ref: taskRef,
    source_contract: "crm.enterprise.journey.executor",
    tenant_id: tenantId,
    journey_id: journeyId
  };

  return {
    schema_version: "forge.addon_executor_result.v1",
    status: "completed",
    task_ref: taskRef,
    summary: `Enterprise CRM journey ${journeyId} packaged for ${account} with ${acceptanceStatus}`,
    outputs: {
      tenant_id: tenantId,
      journey_id: journeyId,
      account,
      workflow_id: workflowId,
      acceptance_status: acceptanceStatus,
      stage_count: stageReceipts.length,
      missing_stage_count: missingStages.length,
      missing_domain_count: missingDomains.length,
      main_flow_dependency_external: externalDependency,
      mutates_crm_state: false,
      forge_event_sourced: true
    },
    artifacts: [
      {
        kind: "crm_enterprise_journey_map",
        id: `crm-enterprise-journey-map-${slug(journeyId, "journey")}`,
        title: `Enterprise CRM journey map for ${account}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          journey_id: journeyId,
          account,
          goal: journey.goal || "Operate the full customer lifecycle through Forge CRM",
          stages: stageReceipts,
          state_owner: "forge_workflow_runtime",
          external_database_required: false,
          lineage
        }
      },
      {
        kind: "crm_operating_acceptance_evidence",
        id: `crm-operating-acceptance-${slug(journeyId, "journey")}`,
        title: `Operating acceptance evidence for ${account}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          journey_id: journeyId,
          acceptance_status: acceptanceStatus,
          required_stage_ids: requiredStageIds,
          required_domains: requiredDomains,
          covered_domains: coveredDomains,
          missing_stage_ids: missingStages.map((stage) => stage.id),
          missing_domains: missingDomains,
          approved_by: acceptancePolicy.approved_by || null,
          validation_policy: "all required customer lifecycle stages must have Forge artifact and event evidence",
          lineage
        }
      },
      {
        kind: "crm_cross_domain_handoff_map",
        id: `crm-cross-domain-handoff-map-${slug(journeyId, "journey")}`,
        title: `Cross-domain handoff map for ${account}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          journey_id: journeyId,
          handoffs: stageReceipts.slice(1).map((stage, index) => ({
            from_stage_id: stageReceipts[index].id,
            to_stage_id: stage.id,
            from_workflow_id: stageReceipts[index].workflow_id,
            to_workflow_id: stage.workflow_id,
            owner: "forge_workflow_runtime"
          })),
          no_parallel_crm_persistence: true,
          lineage
        }
      }
    ],
    events: [
      {
        kind: "crm.journey.started",
        tenant_id: tenantId,
        journey_id: journeyId,
        workflow_id: workflowId
      },
      ...stageReceipts
        .filter((stage) => stage.ready)
        .map((stage) => ({
          kind: "crm.journey.stage_completed",
          tenant_id: tenantId,
          journey_id: journeyId,
          stage_id: stage.id,
          workflow_id: stage.workflow_id,
          contract_id: stage.contract_id
        })),
      {
        kind: "crm.journey.acceptance_reported",
        tenant_id: tenantId,
        journey_id: journeyId,
        workflow_id: workflowId,
        acceptance_status: acceptanceStatus,
        missing_stage_count: missingStages.length
      }
    ],
    context_tenant: context.tenant || tenantId
  };
}

export function buildSubworkflowOrchestrationResult(request) {
  const input = dispatchPayload(request);
  const context = providedContext(request);
  const tenantId = input.tenant_id || input.tenant_context?.tenant_id || input.tenant_context?.id || context.tenant || "default";
  const taskRef = dispatchEnvelope(request).task_ref || `subworkflow-orchestration-${slug(tenantId, "tenant")}`;
  const parent = asObject(input.parent_workflow ?? input.parent);
  const parentWorkflowId = String(parent.id || parent.workflow_id || "crm.enterprise.customer_journey");
  const handoffPolicy = asObject(input.handoff_policy ?? input.policy);
  const bindings = asArray(input.subworkflow_bindings ?? input.child_workflows ?? input.bindings).map((binding, index) => {
    const source = asObject(binding);
    const workflowId = String(source.workflow_id || source.child_workflow_id || `crm.child.workflow.${index + 1}`);
    const taskId = String(source.task_id || source.child_task_id || `child-task-${index + 1}`);
    const validationGate = String(source.validation_gate || source.gate || "child workflow validation gate required");
    const hasLineage = asArray(source.artifact_refs).length > 0 || asArray(source.event_refs).length > 0 || Boolean(validationGate);
    return {
      binding_id: String(source.id || source.binding_id || `subflow-${index + 1}`),
      parent_workflow_id: parentWorkflowId,
      child_workflow_id: workflowId,
      child_task_id: taskId,
      validation_gate: validationGate,
      artifact_refs: asArray(source.artifact_refs),
      event_refs: asArray(source.event_refs),
      lifecycle_state: source.lifecycle_state || "validated",
      lineage_hash: `lineage-${slug(parentWorkflowId, "parent")}-${slug(workflowId, `child-${index + 1}`)}`,
      valid: hasLineage && validationGate.length > 0,
      state_owner: "forge_workflow_runtime"
    };
  });
  const validBindings = bindings.filter((binding) => binding.valid);
  const promoteParentAllowed = Boolean(handoffPolicy.promote_parent_only_after_children_validated ?? true)
    ? validBindings.length === bindings.length && bindings.length > 0
    : validBindings.length > 0;
  const orchestrationState = promoteParentAllowed ? "validation_ready" : "rework_required";
  const workflowId = "crm.subworkflow.orchestration";
  const lineage = {
    workflow_id: workflowId,
    task_ref: taskRef,
    source_contract: "crm.workflow.subworkflow_orchestrator.executor",
    tenant_id: tenantId,
    parent_workflow_id: parentWorkflowId,
    parent_run_id: parent.run_id || null
  };

  return {
    schema_version: "forge.addon_executor_result.v1",
    status: "completed",
    task_ref: taskRef,
    summary: `CRM subworkflow orchestration bound ${bindings.length} child workflows for ${parentWorkflowId}`,
    outputs: {
      tenant_id: tenantId,
      workflow_id: workflowId,
      parent_workflow_id: parentWorkflowId,
      child_subworkflow_count: bindings.length,
      validated_subworkflow_count: validBindings.length,
      orchestration_state: orchestrationState,
      promote_parent_allowed: promoteParentAllowed,
      mutates_crm_state: false,
      forge_event_sourced: true
    },
    artifacts: [
      {
        kind: "crm_subworkflow_plan",
        id: `crm-subworkflow-plan-${slug(parentWorkflowId, "parent")}`,
        title: `CRM subworkflow plan for ${parentWorkflowId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          parent_workflow: parent,
          child_bindings: bindings,
          handoff_policy: handoffPolicy,
          operation_plan: [
            "bind child workflows through Forge child_subflows",
            "validate child workflow artifact and event lineage",
            "promote parent workflow only after child gates pass"
          ],
          state_owner: "forge_workflow_runtime",
          local_execution_allowed: false,
          lineage
        }
      },
      {
        kind: "crm_subworkflow_lineage_map",
        id: `crm-subworkflow-lineage-${slug(parentWorkflowId, "parent")}`,
        title: `CRM subworkflow lineage map for ${parentWorkflowId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          parent_workflow_id: parentWorkflowId,
          child_lineage: bindings.map((binding) => ({
            binding_id: binding.binding_id,
            child_workflow_id: binding.child_workflow_id,
            child_task_id: binding.child_task_id,
            lineage_hash: binding.lineage_hash,
            artifact_refs: binding.artifact_refs,
            event_refs: binding.event_refs
          })),
          lineage
        }
      },
      {
        kind: "crm_subworkflow_validation_report",
        id: `crm-subworkflow-validation-${slug(parentWorkflowId, "parent")}`,
        title: `CRM subworkflow validation report for ${parentWorkflowId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          parent_workflow_id: parentWorkflowId,
          orchestration_state: orchestrationState,
          promote_parent_allowed: promoteParentAllowed,
          child_subworkflow_count: bindings.length,
          validated_subworkflow_count: validBindings.length,
          failed_bindings: bindings.filter((binding) => !binding.valid).map((binding) => binding.binding_id),
          validation_policy: "child subworkflows are validated before parent journey promotion",
          lineage
        }
      }
    ],
    events: [
      {
        kind: "crm.subworkflow.bound",
        tenant_id: tenantId,
        workflow_id: workflowId,
        parent_workflow_id: parentWorkflowId,
        child_subworkflow_count: bindings.length
      },
      {
        kind: "crm.subworkflow.validated",
        tenant_id: tenantId,
        workflow_id: workflowId,
        parent_workflow_id: parentWorkflowId,
        validated_subworkflow_count: validBindings.length
      },
      {
        kind: "crm.subworkflow.promoted",
        tenant_id: tenantId,
        workflow_id: workflowId,
        parent_workflow_id: parentWorkflowId,
        promote_parent_allowed: promoteParentAllowed
      }
    ],
    context_tenant: context.tenant || tenantId
  };
}

export function buildObservabilityInspectorResult(request) {
  const input = dispatchPayload(request);
  const context = providedContext(request);
  const tenantId = input.tenant_id || input.tenant_context?.tenant_id || input.tenant_context?.id || context.tenant || "default";
  const workflowState = asObject(input.workflow_state ?? input.workflow);
  const workflowId = String(workflowState.workflow_id || input.workflow_id || dispatchEnvelope(request).workflow_id || "crm.operational.observability");
  const taskRef = dispatchEnvelope(request).task_ref || `observability-${slug(workflowId, "workflow")}`;
  const eventTimeline = asArray(input.event_timeline ?? input.events).map((event, index) => ({
    sequence: numberFrom(asObject(event).sequence, index + 1),
    ...asObject(event)
  }));
  const artifactLineage = asArray(input.artifact_lineage ?? input.lineage).map((lineage) => asObject(lineage));
  const costEntries = asArray(input.cost_entries ?? input.costs).map((entry) => ({
    ...asObject(entry),
    amount_usd: roundCurrency(asObject(entry).amount_usd ?? asObject(entry).cost_usd ?? asObject(entry).amount)
  }));
  const metricSamples = asArray(input.metric_samples ?? input.metrics).map((metric) => asObject(metric));
  const logEntries = asArray(input.log_entries ?? input.logs).map((log) => asObject(log));
  const costTotal = roundCurrency(costEntries.reduce((total, entry) => total + numberFrom(entry.amount_usd, 0), 0));
  const lineageEdges = artifactLineage.map((lineage) => ({
    artifact_id: lineage.artifact_id || lineage.id || "artifact-unknown",
    artifact_kind: lineage.kind || lineage.artifact_kind || "artifact",
    produced_by: lineage.produced_by || lineage.runtime_contract_id || lineage.source_contract || "forge_runtime",
    source_event_ids: asArray(lineage.source_event_ids ?? lineage.events),
    source_artifact_ids: asArray(lineage.source_artifact_ids ?? lineage.sources)
  }));
  const costByContract = costEntries.reduce((totals, entry) => {
    const contractId = String(entry.runtime_contract_id || entry.contract_id || "unknown_contract");
    totals[contractId] = roundCurrency((totals[contractId] || 0) + numberFrom(entry.amount_usd, 0));
    return totals;
  }, {});
  const warningLogs = logEntries.filter((entry) => textIncludes(entry.level, ["warn", "error"]) || textIncludes(entry.severity, ["warn", "error"]));
  const inspectionStatus = warningLogs.length > 0 || eventTimeline.length === 0 ? "attention_required" : "observed";
  const lineage = {
    workflow_id: workflowId,
    task_ref: taskRef,
    source_contract: "crm.observability.inspector.executor",
    tenant_id: tenantId
  };

  return {
    schema_version: "forge.addon_executor_result.v1",
    status: "completed",
    task_ref: taskRef,
    summary: `CRM observability inspection for ${workflowId} produced audit, lineage, cost and metric artifacts`,
    outputs: {
      tenant_id: tenantId,
      workflow_id: workflowId,
      workflow_status: workflowState.status || "unknown",
      workflow_revision: workflowState.revision ?? null,
      inspection_status: inspectionStatus,
      audit_event_count: eventTimeline.length,
      lineage_edge_count: lineageEdges.length,
      cost_total_usd: costTotal,
      metric_count: metricSamples.length,
      log_count: logEntries.length,
      warning_log_count: warningLogs.length,
      mutates_crm_state: false,
      forge_event_sourced: true,
      state_source: "forge_observability_state"
    },
    artifacts: [
      {
        kind: "crm_audit_report",
        id: `crm-audit-report-${slug(workflowId, "workflow")}`,
        title: `CRM audit report for ${workflowId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          workflow_id: workflowId,
          workflow_state: workflowState,
          events: eventTimeline,
          log_summary: {
            log_count: logEntries.length,
            warning_log_count: warningLogs.length
          },
          lineage,
          state_owner: "forge_workflow_runtime",
          external_database_required: false
        }
      },
      {
        kind: "crm_lineage_map",
        id: `crm-lineage-map-${slug(workflowId, "workflow")}`,
        title: `CRM lineage map for ${workflowId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          workflow_id: workflowId,
          edges: lineageEdges,
          event_ids: eventTimeline.map((event) => event.id || event.event_id).filter(Boolean),
          lineage,
          source: "forge.workflow.artifacts"
        }
      },
      {
        kind: "crm_cost_report",
        id: `crm-cost-report-${slug(workflowId, "workflow")}`,
        title: `CRM cost report for ${workflowId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          workflow_id: workflowId,
          total_usd: costTotal,
          by_runtime_contract: costByContract,
          entries: costEntries,
          lineage,
          source: "forge.cost.events"
        }
      },
      {
        kind: "crm_metric_snapshot",
        id: `crm-metric-snapshot-${slug(workflowId, "workflow")}`,
        title: `CRM metric snapshot for ${workflowId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          workflow_id: workflowId,
          metrics: metricSamples,
          logs: logEntries,
          waiting_states: asArray(workflowState.waiting_states),
          inspection_status: inspectionStatus,
          lineage,
          source: "forge.metrics.logs"
        }
      }
    ],
    events: [
      {
        kind: "crm.observability.inspected",
        tenant_id: tenantId,
        workflow_id: workflowId,
        inspection_status: inspectionStatus
      },
      {
        kind: "crm.audit.reported",
        tenant_id: tenantId,
        workflow_id: workflowId,
        event_count: eventTimeline.length
      },
      {
        kind: "crm.cost.reviewed",
        tenant_id: tenantId,
        workflow_id: workflowId,
        total_usd: costTotal
      },
      {
        kind: "crm.metric.reviewed",
        tenant_id: tenantId,
        workflow_id: workflowId,
        metric_count: metricSamples.length,
        log_count: logEntries.length
      }
    ],
    context_tenant: context.tenant || tenantId
  };
}

const READINESS_OUTCOME_DOMAINS = [
  {
    id: "relationship",
    title: "Relationship workspace",
    deliverable: "relationship workspace",
    workflow_ids: ["crm.lead.lifecycle", "crm.opportunity.pipeline"],
    required_artifacts: ["crm_timeline_snapshot", "crm_pipeline_board", "crm_entity_model"],
    required_events: ["crm.relationship.recorded", "crm.opportunity.stage_changed"]
  },
  {
    id: "commercial",
    title: "Commercial command center",
    deliverable: "commercial command center",
    workflow_ids: ["crm.proposal.approval", "crm.contract.signature", "crm.followup.forecast", "crm.account.management"],
    required_artifacts: ["crm_proposal", "crm_contract", "crm_forecast_report", "crm_health_report"],
    required_events: ["crm.proposal.generated", "crm.contract.signed", "crm.forecast.updated"]
  },
  {
    id: "support",
    title: "Support inbox and SLA lane",
    deliverable: "support inbox",
    workflow_ids: ["crm.ticket.sla"],
    required_artifacts: ["crm_message_thread", "crm_channel_receipt", "crm_support_summary"],
    required_events: ["crm.message.received", "crm.ticket.created", "crm.sla.escalated"]
  },
  {
    id: "marketing",
    title: "Marketing automation and capture",
    deliverable: "marketing automation",
    workflow_ids: ["crm.campaign.lifecycle", "crm.lead.nurture"],
    required_artifacts: ["crm_campaign", "crm_segment", "crm_form_submission", "crm_automation_plan"],
    required_events: ["crm.campaign.scheduled", "crm.form.submitted", "crm.nurture.scheduled"]
  },
  {
    id: "documents",
    title: "Document generation and approvals",
    deliverable: "document approvals",
    workflow_ids: ["crm.document.approval", "crm.proposal.approval", "crm.contract.signature"],
    required_artifacts: ["crm_document", "crm_presentation", "crm_approval_record"],
    required_events: ["crm.document.generated", "crm.document.approved"]
  },
  {
    id: "operations",
    title: "Project handoff and internal operations",
    deliverable: "project handoff",
    workflow_ids: ["crm.project.handoff", "crm.operational.observability"],
    required_artifacts: ["crm_project_plan", "crm_task_plan", "crm_handoff_record", "crm_audit_report"],
    required_events: ["crm.project.handoff_requested", "crm.task.created", "crm.observability.inspected"]
  },
  {
    id: "enterprise_journey",
    title: "Enterprise customer journey",
    deliverable: "enterprise customer journey",
    workflow_ids: ["crm.enterprise.customer_journey"],
    required_artifacts: ["crm_enterprise_journey_map", "crm_operating_acceptance_evidence", "crm_cross_domain_handoff_map"],
    required_events: ["crm.journey.started", "crm.journey.acceptance_reported"]
  },
  {
    id: "subworkflow_orchestration",
    title: "Subworkflow orchestration",
    deliverable: "subworkflow orchestration",
    workflow_ids: ["crm.subworkflow.orchestration", "crm.enterprise.customer_journey"],
    required_artifacts: ["crm_subworkflow_plan", "crm_subworkflow_lineage_map", "crm_subworkflow_validation_report"],
    required_events: ["crm.subworkflow.bound", "crm.subworkflow.validated", "crm.subworkflow.promoted"]
  },
  {
    id: "user_experience",
    title: "Forge CRM design system",
    deliverable: "design system",
    workflow_ids: ["crm.design.system"],
    required_artifacts: ["crm_design_system", "crm_design_token_manifest", "crm_ui_component_catalog"],
    required_events: ["crm.design.system_generated", "crm.design.tokens_published"]
  }
];

function workflowReady(workflow) {
  return Boolean(
    workflow &&
      asArray(workflow.runtime_contracts).length > 0 &&
      asArray(workflow.artifacts).length > 0 &&
      asArray(workflow.events).length > 0 &&
      asArray(workflow.validation_gates).length > 0
  );
}

function readinessWorkflowPack(input, tenantId) {
  const candidate = asObject(input.workflow_pack);
  return Array.isArray(candidate.workflows) ? candidate : buildCrmWorkflowPack({ tenant_id: tenantId });
}

export function buildOperatingReadinessResult(request) {
  const input = dispatchPayload(request);
  const context = providedContext(request);
  const tenantId = input.tenant_id || input.tenant_context?.tenant_id || input.tenant_context?.id || context.tenant || "default";
  const taskRef = dispatchEnvelope(request).task_ref || `operating-readiness-${slug(tenantId, "tenant")}`;
  const pack = readinessWorkflowPack(input, tenantId);
  const operatingSnapshot = asObject(input.operating_snapshot);
  const validationEvidence = asObject(input.validation_evidence ?? input.evidence);
  const successCriteria = asObject(input.success_criteria ?? input.criteria);
  const workflowById = new Map(asArray(pack.workflows).map((workflow) => [workflow.id, workflow]));
  const packArtifactTypes = new Set(asArray(pack.indexes?.artifact_types));
  const packEventTypes = new Set(asArray(pack.indexes?.event_types));
  const packRuntimeContracts = new Set(asArray(pack.indexes?.runtime_contracts));

  const domainCoverage = READINESS_OUTCOME_DOMAINS.map((domain) => {
    const workflows = domain.workflow_ids.map((workflowId) => workflowById.get(workflowId)).filter(Boolean);
    const missingWorkflowIds = domain.workflow_ids.filter((workflowId) => !workflowById.has(workflowId));
    const workflowArtifactTypes = new Set(workflows.flatMap((workflow) => asArray(workflow.artifacts)));
    const workflowEventTypes = new Set(workflows.flatMap((workflow) => asArray(workflow.events)));
    const workflowRuntimeContracts = new Set(workflows.flatMap((workflow) => asArray(workflow.runtime_contracts)));
    const artifactEvidence = domain.required_artifacts.filter((artifact) => workflowArtifactTypes.has(artifact) || packArtifactTypes.has(artifact));
    const eventEvidence = domain.required_events.filter((event) => workflowEventTypes.has(event) || packEventTypes.has(event));
    const runtimeEvidence = [...workflowRuntimeContracts].filter((contract) => packRuntimeContracts.size === 0 || packRuntimeContracts.has(contract));
    const ready =
      missingWorkflowIds.length === 0 &&
      workflows.every(workflowReady) &&
      artifactEvidence.length > 0 &&
      eventEvidence.length > 0 &&
      runtimeEvidence.length > 0;

    return {
      domain: domain.id,
      title: domain.title,
      user_facing_deliverable: domain.deliverable,
      ready,
      workflow_ids: domain.workflow_ids,
      missing_workflow_ids: missingWorkflowIds,
      artifact_evidence: artifactEvidence,
      event_evidence: eventEvidence,
      runtime_contract_evidence: runtimeEvidence,
      validation_gates: unique(workflows.flatMap((workflow) => asArray(workflow.validation_gates)))
    };
  });

  const readyDomainCount = domainCoverage.filter((domain) => domain.ready).length;
  const requiredDeliverables = asArray(successCriteria.required_deliverables ?? successCriteria.deliverables);
  const userOutcomeManifest = READINESS_OUTCOME_DOMAINS.map((domain) => ({
    deliverable: domain.deliverable,
    domain: domain.id,
    workflow_ids: domain.workflow_ids,
    acceptance: "delivered when Forge workflow artifacts, events and validation gates are present",
    requested_by_success_criteria:
      requiredDeliverables.length === 0 ||
      requiredDeliverables.some((deliverable) => slug(deliverable, "deliverable").includes(slug(domain.deliverable, "deliverable")))
  }));
  const forgeOnlyOperations =
    operatingSnapshot.external_database_required !== true &&
    asObject(pack.state_model).external_database_required !== true &&
    operatingSnapshot.direct_browser_persistence !== true;
  const successCriteriaStatus =
    readyDomainCount === READINESS_OUTCOME_DOMAINS.length && forgeOnlyOperations ? "operable_with_evidence" : "rework_required";
  const lineage = {
    workflow_id: input.workflow_id || "crm.enterprise.readiness",
    task_ref: taskRef,
    source_contract: "crm.operating.readiness.executor",
    tenant_id: tenantId
  };

  return {
    schema_version: "forge.addon_executor_result.v1",
    status: "completed",
    task_ref: taskRef,
    summary: `CRM operating readiness for ${tenantId} mapped ${userOutcomeManifest.length} user-facing deliverables to Forge evidence`,
    outputs: {
      tenant_id: tenantId,
      workflow_id: lineage.workflow_id,
      success_criteria_status: successCriteriaStatus,
      user_facing_deliverable_count: userOutcomeManifest.length,
      ready_domain_count: readyDomainCount,
      workflow_count: asArray(pack.workflows).length,
      runtime_contract_count: asArray(pack.indexes?.runtime_contracts).length || numberFrom(validationEvidence.runtime_contract_count, 0),
      workflow_artifact_count: numberFrom(validationEvidence.workflow_artifact_count, 0),
      forge_only_operations: forgeOnlyOperations,
      main_flow_dependency_external: !forgeOnlyOperations,
      mutates_crm_state: false,
      forge_event_sourced: true
    },
    artifacts: [
      {
        kind: "crm_operating_readiness_report",
        id: `crm-operating-readiness-${slug(tenantId, "tenant")}`,
        title: `CRM operating readiness report for ${tenantId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          success_criteria: successCriteria,
          status: successCriteriaStatus,
          ready_domain_count: readyDomainCount,
          user_facing_deliverable_count: userOutcomeManifest.length,
          forge_only_operations: forgeOnlyOperations,
          validation_evidence: validationEvidence,
          lineage,
          state_owner: "forge_workflow_runtime",
          external_database_required: false
        }
      },
      {
        kind: "crm_user_outcome_manifest",
        id: `crm-user-outcomes-${slug(tenantId, "tenant")}`,
        title: `CRM user-facing outcomes for ${tenantId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          outcomes: userOutcomeManifest,
          source: "forge.workflow_pack"
        }
      },
      {
        kind: "crm_domain_coverage_matrix",
        id: `crm-domain-coverage-${slug(tenantId, "tenant")}`,
        title: `CRM domain coverage matrix for ${tenantId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          domains: domainCoverage,
          complete: readyDomainCount === READINESS_OUTCOME_DOMAINS.length,
          lineage
        }
      },
      {
        kind: "crm_business_runbook",
        id: `crm-business-runbook-${slug(tenantId, "tenant")}`,
        title: `CRM business runbook for ${tenantId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          daily_operations: userOutcomeManifest.map((outcome) => ({
            deliverable: outcome.deliverable,
            command_owner: "forge",
            workflow_ids: outcome.workflow_ids,
            rework_path: "return incomplete goals to Forge workflow tasks with reason"
          })),
          escalation_policy: "readiness gaps require Forge workflow mutation, validation evidence and artifact lineage",
          lineage
        }
      }
    ],
    events: [
      {
        kind: "crm.operating.readiness_reported",
        tenant_id: tenantId,
        workflow_id: lineage.workflow_id,
        success_criteria_status: successCriteriaStatus,
        ready_domain_count: readyDomainCount
      },
      {
        kind: "crm.outcome.deliverables_mapped",
        tenant_id: tenantId,
        workflow_id: lineage.workflow_id,
        deliverable_count: userOutcomeManifest.length
      }
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

export function buildCommercialFollowupForecastResult(request) {
  const input = dispatchPayload(request);
  const context = providedContext(request);
  const tenantId = input.tenant_id || input.tenant_context?.tenant_id || input.tenant_context?.id || context.tenant || "default";
  const opportunity = asObject(input.opportunity);
  const followupPolicy = asObject(input.followup_policy);
  const forecastPolicy = asObject(input.forecast_policy);
  const commissionPolicy = asObject(input.commission_policy);
  const opportunityId = String(opportunity.id || opportunity.opportunity_id || dispatchEnvelope(request).task_ref || "opportunity");
  const account = opportunity.account || opportunity.company || opportunity.name || opportunityId;
  const owner = opportunity.owner || followupPolicy.owner || "sales";
  const amount = numberFrom(opportunity.amount ?? opportunity.value, 0);
  const probability = probabilityFrom(opportunity.probability ?? opportunity.close_probability ?? forecastPolicy.probability);
  const forecastAmount = Math.round(amount * probability);
  const goalAmount = numberFrom(forecastPolicy.goal_amount ?? forecastPolicy.target_amount, 0);
  const goalAttainmentPercent = goalAmount > 0 ? Math.round((forecastAmount / goalAmount) * 100) : 0;
  const commissionRate = probabilityFrom(commissionPolicy.rate ?? commissionPolicy.commission_rate);
  const commissionAmount = Math.round(amount * commissionRate);
  const workflowId = String(input.workflow_id || "crm.followup.forecast");
  const taskRef = dispatchEnvelope(request).task_ref || `commercial-followup-${slug(opportunityId, "opportunity")}`;
  const dueAt = followupPolicy.due_at || followupPolicy.scheduled_at || "forge_schedule_pending";
  const channel = followupPolicy.channel || "email";
  const followupState = dueAt === "forge_schedule_pending" ? "scheduled" : "waiting_due_date";
  const period = forecastPolicy.period || "current";
  const lineage = {
    workflow_id: workflowId,
    task_ref: taskRef,
    source_contract: "crm.commercial.followup_forecast.executor",
    tenant_id: tenantId,
    opportunity_id: opportunityId
  };
  const followupPlanId = `followup-plan-${slug(opportunityId, "opportunity")}`;
  const forecastReportId = `forecast-report-${slug(opportunityId, "opportunity")}-${slug(period, "period")}`;
  const commissionRecordId = `commission-${slug(opportunityId, "opportunity")}-${slug(period, "period")}`;

  return {
    schema_version: "forge.addon_executor_result.v1",
    status: "completed",
    task_ref: taskRef,
    summary: `Commercial follow-up scheduled for ${account}; forecast ${forecastAmount} and commission ${commissionAmount}`,
    outputs: {
      tenant_id: tenantId,
      opportunity_id: opportunityId,
      workflow_id: workflowId,
      followup_state: followupState,
      due_at: dueAt,
      forecast_period: period,
      forecast_amount: forecastAmount,
      goal_amount: goalAmount,
      goal_attainment_percent: goalAttainmentPercent,
      commission_amount: commissionAmount,
      mutates_crm_state: false,
      forge_event_sourced: true
    },
    artifacts: [
      {
        kind: "crm_followup_plan",
        id: followupPlanId,
        title: `Follow-up plan for ${account}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          opportunity_id: opportunityId,
          account,
          owner,
          due_at: dueAt,
          channel,
          sequence_id: followupPolicy.sequence_id || `followup-${slug(opportunityId, "opportunity")}`,
          next_state: followupState,
          lineage,
          state_owner: "forge_workflow_runtime",
          external_database_required: false
        }
      },
      {
        kind: "crm_email",
        id: `followup-email-${slug(opportunityId, "opportunity")}`,
        title: `Follow-up email draft for ${account}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          opportunity_id: opportunityId,
          account,
          channel,
          approval_state: "draft_requires_forge_approval",
          external_delivery_allowed: false,
          sections: ["subject_line", "context", "next_step", "call_to_action"],
          lineage
        }
      },
      {
        kind: "crm_forecast_report",
        id: forecastReportId,
        title: `Forecast report for ${account}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          opportunity,
          period,
          amount,
          probability,
          forecast_amount: forecastAmount,
          goal_amount: goalAmount,
          goal_attainment_percent: goalAttainmentPercent,
          lineage
        }
      },
      {
        kind: "crm_commission_record",
        id: commissionRecordId,
        title: `Commission evidence for ${account}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          opportunity_id: opportunityId,
          owner,
          period,
          amount,
          commission_rate: commissionRate,
          commission_amount: commissionAmount,
          accrual_policy: commissionPolicy.accrual_policy || "forecast_evidence_until_contract_signed",
          lineage
        }
      }
    ],
    events: [
      {
        kind: "crm.followup.scheduled",
        tenant_id: tenantId,
        opportunity_id: opportunityId,
        workflow_id: workflowId,
        due_at: dueAt,
        channel,
        owner
      },
      {
        kind: "crm.forecast.reviewed",
        tenant_id: tenantId,
        opportunity_id: opportunityId,
        workflow_id: workflowId,
        period,
        forecast_amount: forecastAmount
      },
      {
        kind: "crm.goal.progress_reviewed",
        tenant_id: tenantId,
        opportunity_id: opportunityId,
        workflow_id: workflowId,
        period,
        goal_amount: goalAmount,
        goal_attainment_percent: goalAttainmentPercent
      },
      {
        kind: "crm.commission.accrued",
        tenant_id: tenantId,
        opportunity_id: opportunityId,
        workflow_id: workflowId,
        owner,
        commission_amount: commissionAmount
      }
    ],
    context_tenant: context.tenant || tenantId
  };
}

function accountId(account, fallback = "crm-account") {
  return String(account.id || account.account_id || account.company_id || account.name || fallback);
}

function engagementScore(value) {
  const normalized = String(value || "").toLowerCase();
  if (["high", "strong", "executive", "champion"].some((pattern) => normalized.includes(pattern))) {
    return 10;
  }
  if (["medium", "regular", "normal"].some((pattern) => normalized.includes(pattern))) {
    return 5;
  }
  if (["low", "weak", "stale"].some((pattern) => normalized.includes(pattern))) {
    return -10;
  }
  return 0;
}

function healthState(score) {
  if (score >= 75) {
    return "healthy";
  }
  if (score >= 50) {
    return "watch";
  }
  return "at_risk";
}

export function buildCommercialAccountManagementResult(request) {
  const input = dispatchPayload(request);
  const context = providedContext(request);
  const tenantId = input.tenant_id || input.tenant_context?.tenant_id || input.tenant_context?.id || context.tenant || "default";
  const account = asObject(input.account ?? input.account_context);
  const signals = asObject(input.health_signals);
  const expansionOpportunities = asArray(input.expansion_opportunities ?? input.expansions).map((opportunity, index) => {
    const record = asObject(opportunity);
    const amount = numberFrom(record.amount ?? record.value, 0);
    const probability = probabilityFrom(record.probability ?? record.close_probability);
    return {
      id: String(record.id || record.opportunity_id || `expansion-${index + 1}`),
      name: record.name || record.title || `Expansion ${index + 1}`,
      amount,
      probability,
      forecast_amount: Math.round(amount * probability)
    };
  });
  const successPlan = asObject(input.success_plan);
  const requiredActions = asArray(successPlan.required_actions ?? input.required_actions)
    .map((action) => String(action).trim())
    .filter(Boolean);
  const id = accountId(account, dispatchEnvelope(request).task_ref || "account");
  const name = account.name || account.account || id;
  const owner = account.owner || successPlan.owner || "account-management";
  const workflowId = String(input.workflow_id || "crm.account.management");
  const taskRef = dispatchEnvelope(request).task_ref || `account-management-${slug(id, "account")}`;
  const usageScore = numberFrom(signals.product_usage_percent ?? signals.usage_percent, 0);
  const criticalTickets = numberFrom(signals.open_critical_tickets ?? signals.critical_ticket_count, 0);
  const invoiceDelta = String(signals.invoice_status || "").toLowerCase() === "current" ? 5 : -10;
  const score = Math.max(0, Math.min(100, Math.round(usageScore - criticalTickets * 25 + engagementScore(signals.stakeholder_engagement) + invoiceDelta)));
  const accountHealthState = healthState(score);
  const expansionForecastAmount = expansionOpportunities.reduce((total, opportunity) => total + opportunity.forecast_amount, 0);
  const renewalAt = account.renewal_at || input.renewal_at || null;
  const renewalState = renewalAt ? "renewal_planned" : "renewal_date_missing";
  const nextState = requiredActions.length > 0 || successPlan.objective ? "success_plan_active" : accountHealthState === "at_risk" ? "risk_mitigation" : "account_reviewed";
  const lineage = {
    workflow_id: workflowId,
    task_ref: taskRef,
    source_contract: "crm.commercial.account_management.executor",
    tenant_id: tenantId,
    account_id: id
  };
  const tasks = requiredActions.map((title, index) => ({
    id: `account-task-${slug(id, "account")}-${index + 1}`,
    title,
    owner,
    status: "ready",
    workflow_id: workflowId
  }));

  return {
    schema_version: "forge.addon_executor_result.v1",
    status: "completed",
    task_ref: taskRef,
    summary: `Account ${name} reviewed with ${accountHealthState} health and ${expansionForecastAmount} expansion forecast`,
    outputs: {
      tenant_id: tenantId,
      account_id: id,
      workflow_id: workflowId,
      owner,
      health_state: accountHealthState,
      health_score: score,
      renewal_state: renewalState,
      renewal_at: renewalAt,
      expansion_opportunity_count: expansionOpportunities.length,
      expansion_forecast_amount: expansionForecastAmount,
      next_state: nextState,
      mutates_crm_state: false,
      forge_event_sourced: true
    },
    artifacts: [
      {
        kind: "crm_account_plan",
        id: `account-plan-${slug(id, "account")}`,
        title: `Account plan for ${name}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          account_id: id,
          account,
          owner,
          lifecycle_stage: account.lifecycle_stage || "active",
          success_plan: successPlan,
          next_state: nextState,
          lineage,
          state_owner: "forge_workflow_runtime",
          external_database_required: false
        }
      },
      {
        kind: "crm_health_report",
        id: `account-health-${slug(id, "account")}`,
        title: `Account health report for ${name}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          account_id: id,
          health_signals: signals,
          health_score: score,
          health_state: accountHealthState,
          risk_flags: accountHealthState === "healthy" ? [] : ["account_needs_review"],
          lineage
        }
      },
      {
        kind: "crm_forecast_report",
        id: `account-expansion-forecast-${slug(id, "account")}`,
        title: `Expansion forecast for ${name}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          account_id: id,
          arr: numberFrom(account.arr ?? account.annual_recurring_revenue, 0),
          renewal_at: renewalAt,
          renewal_state: renewalState,
          expansion_opportunities: expansionOpportunities,
          expansion_forecast_amount: expansionForecastAmount,
          lineage
        }
      },
      {
        kind: "crm_task_plan",
        id: `account-task-plan-${slug(id, "account")}`,
        title: `Account task plan for ${name}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          account_id: id,
          tasks,
          task_workflow_policy: "account success actions are Forge workflow tasks with owner and lineage",
          lineage
        }
      }
    ],
    events: [
      {
        kind: "crm.account.health_reviewed",
        tenant_id: tenantId,
        account_id: id,
        workflow_id: workflowId,
        health_state: accountHealthState,
        health_score: score,
        owner
      },
      ...(renewalAt
        ? [
            {
              kind: "crm.account.renewal_planned",
              tenant_id: tenantId,
              account_id: id,
              workflow_id: workflowId,
              renewal_at: renewalAt,
              owner
            }
          ]
        : []),
      ...(expansionOpportunities.length > 0
        ? [
            {
              kind: "crm.account.expansion_identified",
              tenant_id: tenantId,
              account_id: id,
              workflow_id: workflowId,
              expansion_opportunity_count: expansionOpportunities.length,
              expansion_forecast_amount: expansionForecastAmount
            }
          ]
        : []),
      ...(tasks.length > 0
        ? [
            {
              kind: "crm.task.created",
              tenant_id: tenantId,
              account_id: id,
              workflow_id: workflowId,
              task_count: tasks.length
            }
          ]
        : [])
    ],
    context_tenant: context.tenant || tenantId
  };
}

export function buildCommercialContractSignatureResult(request) {
  const input = dispatchPayload(request);
  const context = providedContext(request);
  const tenantId = input.tenant_id || input.tenant_context?.tenant_id || input.tenant_context?.id || context.tenant || "default";
  const contract = asObject(input.contract ?? input.contract_context);
  const approvalPolicy = asObject(input.approval_policy);
  const signature = asObject(input.signature);
  const renewalPolicy = asObject(input.renewal_policy);
  const id = String(contract.id || contract.contract_id || dispatchEnvelope(request).task_ref || "contract");
  const account = String(contract.account || contract.company || contract.account_name || contract.name || id);
  const opportunityId = contract.opportunity_id || input.opportunity_id || null;
  const amount = numberFrom(contract.amount ?? contract.value, 0);
  const workflowId = String(input.workflow_id || contract.workflow_id || "crm.contract.signature");
  const taskRef = dispatchEnvelope(request).task_ref || `contract-signature-${slug(id, "contract")}`;
  const approved = approvalPolicy.approved === true || Boolean(approvalPolicy.approver);
  const signed = signature.status === "signed" || Boolean(signature.signed_at || signature.receipt_id);
  const renewalAt = renewalPolicy.renewal_at || renewalPolicy.renewal_date || null;
  const approvalState = approved ? "approved" : "approval_wait";
  const contractState = signed ? "signed" : approved ? "signature_wait" : "legal_review";
  const signatureState = signed ? "signed" : "signature_wait";
  const renewalState = renewalAt ? "renewal_wait" : "renewal_not_scheduled";
  const receiptId = signature.receipt_id || (signed ? `signature-receipt-${slug(id, "contract")}` : null);
  const owner = renewalPolicy.owner || contract.owner || approvalPolicy.approver || "commercial-operations";
  const lineage = {
    workflow_id: workflowId,
    task_ref: taskRef,
    source_contract: "crm.commercial.contract_signature.executor",
    tenant_id: tenantId,
    contract_id: id
  };

  return {
    schema_version: "forge.addon_executor_result.v1",
    status: "completed",
    task_ref: taskRef,
    summary: `Contract ${id} for ${account} moved to ${contractState} with ${renewalState} renewal state`,
    outputs: {
      tenant_id: tenantId,
      contract_id: id,
      opportunity_id: opportunityId,
      workflow_id: workflowId,
      account,
      amount,
      approval_state: approvalState,
      contract_state: contractState,
      signature_state: signatureState,
      renewal_state: renewalState,
      renewal_at: renewalAt,
      external_signature_delivery_allowed: false,
      mutates_crm_state: false,
      forge_event_sourced: true
    },
    artifacts: [
      {
        kind: "crm_contract",
        id: `contract-${slug(id, "contract")}`,
        title: `Contract lifecycle for ${account}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          contract_id: id,
          opportunity_id: opportunityId,
          account,
          amount,
          contract,
          approval_policy: approvalPolicy,
          approval_state: approvalState,
          contract_state: contractState,
          lineage,
          state_owner: "forge_workflow_runtime",
          external_database_required: false
        }
      },
      {
        kind: "crm_signature_receipt",
        id: receiptId || `signature-receipt-pending-${slug(id, "contract")}`,
        title: `Signature receipt for ${account}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          contract_id: id,
          signature_state: signatureState,
          provider: signature.provider || "signature_provider_pending",
          signer: signature.signer || signature.signer_email || null,
          signed_at: signature.signed_at || null,
          receipt_id: receiptId,
          external_signature_delivery_allowed: false,
          receipt_required_before_signed_state: true,
          lineage
        }
      },
      {
        kind: "crm_renewal_plan",
        id: `renewal-plan-${slug(id, "contract")}`,
        title: `Renewal plan for ${account}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          contract_id: id,
          account,
          renewal_at: renewalAt,
          reminder_days_before: numberFrom(renewalPolicy.reminder_days_before ?? renewalPolicy.reminder_days, 0),
          owner,
          next_wait_state: renewalState,
          renewal_policy: renewalPolicy,
          lineage
        }
      },
      {
        kind: "crm_report",
        id: `contract-signature-report-${slug(id, "contract")}`,
        title: `Contract signature report for ${account}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          contract_id: id,
          workflow_id: workflowId,
          account,
          approval_state: approvalState,
          contract_state: contractState,
          signature_state: signatureState,
          renewal_state: renewalState,
          policy: "signature and renewal state must be promoted by Forge workflow events",
          lineage
        }
      }
    ],
    events: [
      {
        kind: "crm.contract.reviewed",
        tenant_id: tenantId,
        contract_id: id,
        workflow_id: workflowId,
        approval_state: approvalState,
        owner
      },
      ...(signed
        ? [
            {
              kind: "crm.contract.signed",
              tenant_id: tenantId,
              contract_id: id,
              workflow_id: workflowId,
              signature_receipt_id: receiptId,
              signed_at: signature.signed_at || null
            }
          ]
        : []),
      ...(renewalAt
        ? [
            {
              kind: "crm.contract.renewal_scheduled",
              tenant_id: tenantId,
              contract_id: id,
              workflow_id: workflowId,
              renewal_at: renewalAt,
              owner
            }
          ]
        : [])
    ],
    context_tenant: context.tenant || tenantId
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

function documentId(document, fallback = "crm-document") {
  return String(document.id || document.document_id || document.artifact_id || document.path || fallback);
}

function approvalDecisionKind(decision) {
  const raw = String(decision.decision || decision.status || decision.state || (decision.approved === true ? "approved" : ""))
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (["approved", "approve", "accepted", "passed"].includes(raw)) {
    return "approved";
  }
  if (["rework_required", "changes_requested", "rejected", "declined", "failed"].includes(raw)) {
    return "rework_required";
  }
  return decision.approver ? "approved" : "rework_required";
}

export function buildDocumentApprovalDecisionResult(request) {
  const input = dispatchPayload(request);
  const context = providedContext(request);
  const tenantId = input.tenant_id || input.tenant_context?.tenant_id || input.tenant_context?.id || context.tenant || "default";
  const document = asObject(input.document ?? input.artifact_ref ?? input.artifact);
  const decision = asObject(input.approval_decision ?? input.decision ?? input.approval);
  const validationReport = asObject(input.validation_report ?? input.validation);
  const deliveryPolicy = asObject(input.delivery_policy);
  const id = documentId(document, dispatchEnvelope(request).subject || dispatchEnvelope(request).task_ref || "crm-document");
  const workflowId = String(input.workflow_id || document.workflow_id || input.lineage?.workflow_id || "crm.document.approval");
  const taskRef = dispatchEnvelope(request).task_ref || `document-approval-${slug(id, "document")}`;
  const approvalState = approvalDecisionKind(decision);
  const approved = approvalState === "approved";
  const approver = decision.approver || decision.approved_by || decision.owner || "approval-operator";
  const reason = decision.reason || decision.summary || (approved ? "Forge approval recorded" : "Forge rework required");
  const approvedAt = decision.approved_at || decision.decided_at || null;
  const externalDeliveryRequested = deliveryPolicy.external_delivery_requested === true || Boolean(deliveryPolicy.channel);
  const externalDeliveryAllowed = approved && externalDeliveryRequested;
  const validationDecision = validationReport.decision || validationReport.status || (approved ? "passed" : "review_required");
  const reworkReasons = asArray(decision.rework_reasons ?? decision.issues)
    .concat(asArray(validationReport.issues).map((issue) => asObject(issue).code || asObject(issue).message || issue))
    .filter(Boolean);
  const lineage = {
    workflow_id: workflowId,
    task_ref: taskRef,
    source_contract: "crm.document.approval.executor",
    tenant_id: tenantId,
    document_id: id,
    artifact_id: document.artifact_id || document.id || null
  };

  const events = [
    {
      kind: approved ? "crm.document.approved" : "crm.document.rework_required",
      tenant_id: tenantId,
      document_id: id,
      workflow_id: workflowId,
      approver,
      reason,
      approval_state: approvalState
    }
  ];

  if (externalDeliveryAllowed) {
    events.push({
      kind: "crm.document.delivery_unblocked",
      tenant_id: tenantId,
      document_id: id,
      workflow_id: workflowId,
      channel: deliveryPolicy.channel || "external",
      approver
    });
  }

  return {
    schema_version: "forge.addon_executor_result.v1",
    status: "completed",
    task_ref: taskRef,
    summary: approved ? `Document ${id} approved by ${approver}` : `Document ${id} returned for rework`,
    outputs: {
      tenant_id: tenantId,
      document_id: id,
      workflow_id: workflowId,
      approval_state: approvalState,
      approver,
      validation_decision: validationDecision,
      external_delivery_allowed: externalDeliveryAllowed,
      mutates_crm_state: false,
      forge_event_sourced: true
    },
    artifacts: [
      {
        kind: "crm_approval_record",
        id: `approval-record-${slug(id, "document")}`,
        title: `Approval record for ${document.title || id}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          document,
          approval_decision: {
            ...decision,
            decision: approvalState,
            approver,
            reason,
            approved_at: approvedAt
          },
          validation_report: validationReport,
          delivery_policy: deliveryPolicy,
          external_delivery_allowed: externalDeliveryAllowed,
          rework_reasons: reworkReasons,
          lineage,
          state_owner: "forge_workflow_runtime"
        }
      },
      {
        kind: "crm_handoff_record",
        id: `document-approval-handoff-${slug(id, "document")}`,
        title: `Document approval handoff for ${document.title || id}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          document_id: id,
          workflow_id: workflowId,
          approval_state: approvalState,
          next_queue: approved ? "delivery_or_archive" : "document_rework",
          external_delivery_allowed: externalDeliveryAllowed,
          rework_reasons: reworkReasons,
          lineage
        }
      }
    ],
    events,
    context_tenant: context.tenant || tenantId
  };
}

function documentLibraryVersionState(versionPolicy, approvalDecision) {
  const raw = String(approvalDecision.decision || approvalDecision.state || versionPolicy.version_state || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (["approved", "promoted"].includes(raw)) {
    return "promoted";
  }
  if (["rework_required", "changes_requested", "rejected", "blocked"].includes(raw)) {
    return "rework_required";
  }
  if (["approval_wait", "pending_approval", "review_wait"].includes(raw)) {
    return "approval_wait";
  }
  return versionPolicy.promotion_requires_approval === false ? "promoted" : "approval_wait";
}

export function buildDocumentLibraryResult(request) {
  const input = dispatchPayload(request);
  const context = providedContext(request);
  const tenantId = input.tenant_id || input.tenant_context?.tenant_id || input.tenant_context?.id || context.tenant || "default";
  const documentRequest = asObject(input.document_request ?? input.request);
  const fileRecord = asObject(input.file_record ?? input.file ?? input.document);
  const versionPolicy = asObject(input.version_policy ?? input.policy);
  const approvalDecision = asObject(input.approval_decision ?? input.approval);
  const documentIdValue = String(fileRecord.document_id || documentRequest.document_id || documentRequest.id || fileRecord.id || "crm-document");
  const fileId = String(fileRecord.id || fileRecord.file_id || fileRecord.artifact_id || `file-${slug(documentIdValue, "document")}`);
  const collectionId = String(documentRequest.collection_id || fileRecord.collection_id || input.collection_id || "crm-document-library");
  const workflowId = String(input.workflow_id || documentRequest.workflow_id || "crm.document.library");
  const taskRef = dispatchEnvelope(request).task_ref || `document-library-${slug(documentIdValue, "document")}`;
  const nextVersion = Math.max(1, numberFrom(versionPolicy.next_version ?? versionPolicy.version ?? fileRecord.version, 1));
  const currentVersion = Math.max(0, numberFrom(versionPolicy.current_version, Math.max(0, nextVersion - 1)));
  const versionId = String(versionPolicy.version_id || fileRecord.version_id || `${documentIdValue}-v${nextVersion}`);
  const versionState = documentLibraryVersionState(versionPolicy, approvalDecision);
  const approver = approvalDecision.approver || approvalDecision.approved_by || versionPolicy.approver_role || "document.owner";
  const lineage = {
    workflow_id: workflowId,
    approval_workflow_id: "crm.document.approval",
    task_ref: taskRef,
    source_contract: "crm.document.library.executor",
    tenant_id: tenantId,
    document_id: documentIdValue,
    file_id: fileId,
    artifact_id: fileRecord.artifact_id || fileRecord.id || null,
    version_id: versionId,
    collection_id: collectionId
  };

  return {
    schema_version: "forge.addon_executor_result.v1",
    status: "completed",
    task_ref: taskRef,
    summary: `Document ${documentIdValue} recorded as ${versionId} in Forge document library`,
    outputs: {
      tenant_id: tenantId,
      document_id: documentIdValue,
      file_id: fileId,
      version_id: versionId,
      collection_id: collectionId,
      workflow_id: workflowId,
      version_state: versionState,
      current_version: currentVersion,
      next_version: nextVersion,
      mutates_crm_state: false,
      forge_event_sourced: true
    },
    artifacts: [
      {
        kind: "crm_file_record",
        id: `file-record-${slug(fileId, "file")}`,
        title: `File record for ${fileRecord.filename || documentRequest.title || documentIdValue}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          document_id: documentIdValue,
          file_id: fileId,
          file_record: fileRecord,
          checksum: fileRecord.checksum || null,
          artifact_ref: fileRecord.artifact_ref || fileRecord.artifact_id || null,
          lineage,
          state_owner: "forge_workflow_runtime",
          external_database_required: false
        }
      },
      {
        kind: "crm_document_version",
        id: `document-version-${slug(versionId, "version")}`,
        title: `Document version ${versionId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          document_id: documentIdValue,
          version_id: versionId,
          current_version: currentVersion,
          next_version: nextVersion,
          version_state: versionState,
          promotion_requires_approval: versionPolicy.promotion_requires_approval !== false,
          approver,
          lineage,
          mutation_policy: "version promotion must be recorded by Forge workflow events"
        }
      },
      {
        kind: "crm_document_collection",
        id: `document-collection-${slug(collectionId, "collection")}`,
        title: `Document collection ${collectionId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          collection_id: collectionId,
          document_ids: unique([documentIdValue]),
          version_ids: unique([versionId]),
          update_state: versionState === "promoted" ? "collection_updated" : "approval_wait",
          lineage,
          state_owner: "forge_workflow_runtime"
        }
      },
      {
        kind: "crm_approval_record",
        id: `document-library-approval-${slug(versionId, "version")}`,
        title: `Version promotion approval for ${versionId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          document_id: documentIdValue,
          version_id: versionId,
          approval_decision: {
            ...approvalDecision,
            decision: versionState,
            approver,
            reason: approvalDecision.reason || "Version promotion waits for Forge approval"
          },
          version_policy: versionPolicy,
          lineage,
          state_owner: "forge_workflow_runtime"
        }
      }
    ],
    events: [
      {
        kind: "crm.file.recorded",
        tenant_id: tenantId,
        document_id: documentIdValue,
        file_id: fileId,
        workflow_id: workflowId
      },
      {
        kind: "crm.document.versioned",
        tenant_id: tenantId,
        document_id: documentIdValue,
        version_id: versionId,
        version_state: versionState,
        workflow_id: workflowId
      },
      {
        kind: "crm.document.collection_updated",
        tenant_id: tenantId,
        collection_id: collectionId,
        document_id: documentIdValue,
        version_id: versionId,
        workflow_id: workflowId
      }
    ],
    context_tenant: context.tenant || tenantId
  };
}

function campaignId(campaign, fallback = "crm-campaign") {
  return String(campaign.id || campaign.campaign_id || campaign.name || fallback);
}

function segmentId(segment, fallback = "crm-segment") {
  return String(segment.id || segment.segment_id || segment.name || fallback);
}

function submissionFields(submission) {
  return asObject(submission.fields ?? submission.data ?? submission.values);
}

function leadIdFromSubmission(submission, fields, fallback = "lead") {
  return String(submission.lead_id || fields.email || fields.phone || submission.email || submission.id || fallback);
}

function landingPageId(landingPage, fallback = "landing-page") {
  return String(landingPage.id || landingPage.landing_page_id || landingPage.slug || landingPage.name || fallback);
}

function formSchemaId(formSchema, fallback = "form-schema") {
  return String(formSchema.id || formSchema.form_id || formSchema.schema_id || fallback);
}

export function buildMarketingCampaignAutomationResult(request) {
  const input = dispatchPayload(request);
  const context = providedContext(request);
  const tenantId = input.tenant_id || input.tenant_context?.tenant_id || input.tenant_context?.id || context.tenant || "default";
  const campaign = asObject(input.campaign);
  const segment = asObject(input.segment ?? input.audience_segment);
  const assets = asArray(input.assets ?? input.approved_assets);
  const nurturePolicy = asObject(input.nurture_policy ?? input.automation_policy);
  const id = campaignId(campaign, dispatchEnvelope(request).task_ref || "campaign");
  const audienceSegmentId = segmentId(segment, "segment");
  const workflowId = String(input.workflow_id || "crm.campaign.lifecycle");
  const nurtureWorkflowId = String(input.nurture_workflow_id || "crm.lead.nurture");
  const taskRef = dispatchEnvelope(request).task_ref || `automate-campaign-${slug(id, "campaign")}`;
  const channels = unique(asArray(campaign.channels ?? input.channels).map((channel) => String(channel))).filter(Boolean);
  const leadIds = unique(asArray(segment.lead_ids ?? input.lead_ids).map((lead) => String(lead))).filter(Boolean);
  const scheduledAt = campaign.scheduled_at || input.scheduled_at || nurturePolicy.scheduled_at || "forge_schedule_pending";
  const waitMinutes = numberFrom(nurturePolicy.wait_minutes ?? nurturePolicy.step_wait_minutes, 1440);
  const maxSteps = Math.max(1, numberFrom(nurturePolicy.max_steps ?? nurturePolicy.steps, 3));
  const approvedAssetCount = assets.filter((asset) => asObject(asset).approval_state === "approved" || asObject(asset).approved === true).length;
  const scheduledState = approvedAssetCount === assets.length && assets.length > 0 ? "scheduled" : "approval_wait";
  const lineage = {
    workflow_id: workflowId,
    nurture_workflow_id: nurtureWorkflowId,
    task_ref: taskRef,
    source_contract: "crm.marketing.campaign_automation.executor",
    tenant_id: tenantId,
    campaign_id: id,
    segment_id: audienceSegmentId
  };
  const campaignArtifactId = `campaign-${slug(id, "campaign")}`;
  const segmentArtifactId = `segment-${slug(audienceSegmentId, "segment")}`;
  const automationPlanId = `automation-plan-${slug(id, "campaign")}`;

  return {
    schema_version: "forge.addon_executor_result.v1",
    status: "completed",
    task_ref: taskRef,
    summary: `Campaign ${id} scheduled for segment ${audienceSegmentId} through Forge marketing workflows`,
    outputs: {
      tenant_id: tenantId,
      campaign_id: id,
      segment_id: audienceSegmentId,
      workflow_id: workflowId,
      nurture_workflow_id: nurtureWorkflowId,
      scheduled_state: scheduledState,
      scheduled_at: scheduledAt,
      lead_count: leadIds.length,
      channel_count: channels.length,
      nurture_step_count: maxSteps,
      mutates_crm_state: false,
      forge_event_sourced: true
    },
    artifacts: [
      {
        kind: "crm_campaign",
        id: campaignArtifactId,
        title: `Campaign plan for ${campaign.name || id}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          campaign_id: id,
          campaign,
          channels,
          assets,
          scheduled_state: scheduledState,
          scheduled_at: scheduledAt,
          lineage,
          state_owner: "forge_workflow_runtime",
          external_database_required: false
        }
      },
      {
        kind: "crm_segment",
        id: segmentArtifactId,
        title: `Segment ${segment.name || audienceSegmentId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          segment_id: audienceSegmentId,
          segment,
          lead_ids: leadIds,
          criteria: asObject(segment.criteria),
          lineage,
          mutation_policy: "segment membership changes must be promoted by Forge workflow events"
        }
      },
      {
        kind: "crm_automation_plan",
        id: automationPlanId,
        title: `Nurture automation plan for ${id}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          campaign_id: id,
          segment_id: audienceSegmentId,
          workflow_id: workflowId,
          nurture_workflow_id: nurtureWorkflowId,
          sequence_id: nurturePolicy.sequence_id || `nurture-${slug(id, "campaign")}`,
          wait_minutes: waitMinutes,
          max_steps: maxSteps,
          next_wait_state: "wait_step",
          delivery_policy: "external sends require Forge approval and approved handoff contract",
          lineage
        }
      },
      {
        kind: "crm_landing_page",
        id: `landing-page-${slug(id, "campaign")}`,
        title: `Landing page routing for ${campaign.name || id}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          campaign_id: id,
          segment_id: audienceSegmentId,
          form_policy: "form submissions enter crm.lead.lifecycle through Forge events",
          approved_assets: assets,
          lineage
        }
      }
    ],
    events: [
      {
        kind: "crm.campaign.created",
        tenant_id: tenantId,
        campaign_id: id,
        segment_id: audienceSegmentId,
        workflow_id: workflowId
      },
      {
        kind: "crm.campaign.scheduled",
        tenant_id: tenantId,
        campaign_id: id,
        segment_id: audienceSegmentId,
        scheduled_at: scheduledAt,
        scheduled_state: scheduledState,
        workflow_id: workflowId
      },
      {
        kind: "crm.nurture.step_due",
        tenant_id: tenantId,
        campaign_id: id,
        segment_id: audienceSegmentId,
        lead_count: leadIds.length,
        wait_minutes: waitMinutes,
        workflow_id: nurtureWorkflowId
      }
    ],
    context_tenant: context.tenant || tenantId
  };
}

export function buildMarketingSegmentBuilderResult(request) {
  const input = dispatchPayload(request);
  const context = providedContext(request);
  const tenantId = input.tenant_id || input.tenant_context?.tenant_id || input.tenant_context?.id || context.tenant || "default";
  const segmentRequest = asObject(input.segment_request ?? input.segment ?? input.request);
  const audienceSource = asObject(input.audience_source ?? input.audience ?? input.source);
  const selectionPolicy = asObject(input.selection_policy ?? input.policy);
  const workflowId = String(input.workflow_id || "crm.marketing.segment_builder");
  const campaignWorkflowId = String(input.campaign_workflow_id || "crm.campaign.lifecycle");
  const campaignIdValue = String(segmentRequest.campaign_id || input.campaign_id || "campaign_pending");
  const id = segmentId(segmentRequest, dispatchEnvelope(request).task_ref || "segment");
  const taskRef = dispatchEnvelope(request).task_ref || `build-segment-${slug(id, "segment")}`;
  const minScore = numberFrom(selectionPolicy.min_score ?? selectionPolicy.minimum_score, 0);
  const maxAudience = Math.max(1, numberFrom(selectionPolicy.max_audience ?? selectionPolicy.limit, 50));
  const requiredSignals = unique(asArray(selectionPolicy.required_signals).map((signal) => String(signal).toLowerCase())).filter(Boolean);
  const leads = asArray(audienceSource.leads ?? input.leads).map(asObject);
  const relationshipProfiles = asArray(audienceSource.relationship_profiles ?? audienceSource.profiles ?? input.relationship_profiles).map(asObject);
  const signalByEntity = new Map();

  for (const profile of relationshipProfiles) {
    const entityId = String(profile.entity_id || profile.lead_id || profile.id || "");
    if (!entityId) {
      continue;
    }
    const signals = unique(asArray(profile.signals ?? profile.relationship_signals).map((signal) => String(signal).toLowerCase())).filter(Boolean);
    signalByEntity.set(entityId, signals);
  }

  const selectedLeads = leads
    .filter((lead) => {
      const idValue = leadId(lead);
      const score = numberFrom(lead.score ?? lead.fit_score ?? lead.qualification_score, 0);
      const signals = signalByEntity.get(idValue) || [];
      const signalMatches =
        requiredSignals.length === 0 || requiredSignals.every((signal) => signals.includes(signal) || String(lead.role || "").toLowerCase().includes(signal));
      return score >= minScore && signalMatches;
    })
    .slice(0, maxAudience);
  const selectedLeadIds = selectedLeads.map((lead) => leadId(lead));
  const approvalState = selectedLeadIds.length > 0 ? "ready_for_approval" : "rework_required";
  const lineage = {
    workflow_id: workflowId,
    campaign_workflow_id: campaignWorkflowId,
    task_ref: taskRef,
    source_contract: "crm.marketing.segment_builder.executor",
    tenant_id: tenantId,
    segment_id: id,
    campaign_id: campaignIdValue
  };
  const criteria = {
    min_score: minScore,
    required_signals: requiredSignals,
    target_personas: asArray(segmentRequest.target_personas),
    max_audience: maxAudience
  };

  return {
    schema_version: "forge.addon_executor_result.v1",
    status: "completed",
    task_ref: taskRef,
    summary: `Marketing segment ${id} selected ${selectedLeadIds.length} leads through Forge audience workflow evidence`,
    outputs: {
      tenant_id: tenantId,
      segment_id: id,
      workflow_id: workflowId,
      campaign_workflow_id: campaignWorkflowId,
      campaign_id: campaignIdValue,
      audience_count: selectedLeadIds.length,
      approval_state: approvalState,
      mutates_crm_state: false,
      forge_event_sourced: true
    },
    artifacts: [
      {
        kind: "crm_segment_definition",
        id: `segment-definition-${slug(id, "segment")}`,
        title: `Segment definition for ${segmentRequest.name || id}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          segment_id: id,
          segment_request: segmentRequest,
          criteria,
          selection_policy: selectionPolicy,
          approval_state: approvalState,
          lineage,
          state_owner: "forge_workflow_runtime",
          external_database_required: false
        }
      },
      {
        kind: "crm_segment_audience",
        id: `segment-audience-${slug(id, "segment")}`,
        title: `Selected audience for ${segmentRequest.name || id}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          segment_id: id,
          lead_ids: selectedLeadIds,
          selected_leads: selectedLeads,
          rejected_count: Math.max(0, leads.length - selectedLeadIds.length),
          source_profile_count: relationshipProfiles.length,
          approval_required: true,
          lineage
        }
      },
      {
        kind: "crm_segment",
        id: `segment-${slug(id, "segment")}`,
        title: `Campaign segment ${segmentRequest.name || id}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          segment_id: id,
          name: segmentRequest.name || id,
          lead_ids: selectedLeadIds,
          criteria,
          approval_state: approvalState,
          lineage,
          mutation_policy: "segment membership changes must be promoted by Forge workflow events"
        }
      },
      {
        kind: "crm_automation_plan",
        id: `segment-automation-plan-${slug(id, "segment")}`,
        title: `Campaign readiness plan for segment ${segmentRequest.name || id}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          segment_id: id,
          campaign_id: campaignIdValue,
          workflow_id: workflowId,
          campaign_workflow_id: campaignWorkflowId,
          next_contract_id: "crm.marketing.campaign_automation.executor",
          next_state: approvalState === "ready_for_approval" ? "approval_wait" : "rework_required",
          approval_role: selectionPolicy.approver_role || "marketing.approver",
          lineage
        }
      }
    ],
    events: [
      {
        kind: "crm.segment.defined",
        tenant_id: tenantId,
        segment_id: id,
        workflow_id: workflowId
      },
      {
        kind: "crm.segment.audience_selected",
        tenant_id: tenantId,
        segment_id: id,
        audience_count: selectedLeadIds.length,
        workflow_id: workflowId
      },
      {
        kind: "crm.segment.ready_for_campaign",
        tenant_id: tenantId,
        segment_id: id,
        campaign_id: campaignIdValue,
        approval_state: approvalState,
        workflow_id: campaignWorkflowId
      }
    ],
    context_tenant: context.tenant || tenantId
  };
}

export function buildMarketingLandingPageResult(request) {
  const input = dispatchPayload(request);
  const context = providedContext(request);
  const tenantId = input.tenant_id || input.tenant_context?.tenant_id || input.tenant_context?.id || context.tenant || "default";
  const campaign = asObject(input.campaign);
  const landingPage = asObject(input.landing_page ?? input.landingPage);
  const formSchema = asObject(input.form_schema ?? input.form);
  const approvalPolicy = asObject(input.approval_policy);
  const routingPolicy = asObject(input.routing_policy);
  const assets = asArray(input.assets ?? input.approved_assets);
  const campaignIdValue = campaignId(campaign, input.campaign_id || "campaign");
  const pageId = landingPageId(landingPage, `landing-page-${campaignIdValue}`);
  const schemaId = formSchemaId(formSchema, `form-${pageId}`);
  const workflowId = String(input.workflow_id || "crm.marketing.landing_page");
  const campaignWorkflowId = String(input.campaign_workflow_id || "crm.campaign.lifecycle");
  const leadWorkflowId = String(routingPolicy.lead_workflow_id || input.lead_workflow_id || "crm.lead.lifecycle");
  const nurtureWorkflowId = String(routingPolicy.nurture_workflow_id || input.nurture_workflow_id || "crm.lead.nurture");
  const taskRef = dispatchEnvelope(request).task_ref || `publish-landing-page-${slug(pageId, "landing-page")}`;
  const approvalRequired = approvalPolicy.requires_approval !== false;
  const approved =
    approvalPolicy.approved === true ||
    approvalPolicy.approval_state === "approved" ||
    approvalPolicy.state === "approved";
  const publicationState = approvalRequired && !approved ? "approval_wait" : "ready_for_publish";
  const externalPublicationAllowed = !approvalRequired || approved;
  const requiredFields = unique(asArray(formSchema.required_fields ?? formSchema.required).map((field) => String(field))).filter(Boolean);
  const optionalFields = unique(asArray(formSchema.optional_fields ?? formSchema.optional).map((field) => String(field))).filter(Boolean);
  const consentRequired = formSchema.consent_required !== false;
  const lineage = {
    workflow_id: workflowId,
    campaign_workflow_id: campaignWorkflowId,
    lead_workflow_id: leadWorkflowId,
    nurture_workflow_id: nurtureWorkflowId,
    task_ref: taskRef,
    source_contract: "crm.marketing.landing_page.executor",
    tenant_id: tenantId,
    campaign_id: campaignIdValue,
    landing_page_id: pageId,
    form_schema_id: schemaId
  };

  const events = [
    {
      kind: "crm.landing_page.composed",
      tenant_id: tenantId,
      campaign_id: campaignIdValue,
      landing_page_id: pageId,
      form_schema_id: schemaId,
      workflow_id: workflowId
    },
    {
      kind: "crm.form.schema_published",
      tenant_id: tenantId,
      campaign_id: campaignIdValue,
      landing_page_id: pageId,
      form_schema_id: schemaId,
      workflow_id: workflowId
    }
  ];

  if (approvalRequired && !approved) {
    events.push({
      kind: "crm.landing_page.approval_requested",
      tenant_id: tenantId,
      campaign_id: campaignIdValue,
      landing_page_id: pageId,
      approver_role: approvalPolicy.approver_role || "marketing.approver",
      workflow_id: workflowId
    });
  } else {
    events.push({
      kind: "crm.landing_page.ready_for_publish",
      tenant_id: tenantId,
      campaign_id: campaignIdValue,
      landing_page_id: pageId,
      workflow_id: workflowId
    });
  }

  return {
    schema_version: "forge.addon_executor_result.v1",
    status: "completed",
    task_ref: taskRef,
    summary: `Landing page ${pageId} composed for campaign ${campaignIdValue} through Forge marketing workflows`,
    outputs: {
      tenant_id: tenantId,
      campaign_id: campaignIdValue,
      landing_page_id: pageId,
      form_schema_id: schemaId,
      workflow_id: workflowId,
      campaign_workflow_id: campaignWorkflowId,
      lead_workflow_id: leadWorkflowId,
      nurture_workflow_id: nurtureWorkflowId,
      publication_state: publicationState,
      external_publication_allowed: externalPublicationAllowed,
      required_field_count: requiredFields.length,
      consent_required: consentRequired,
      mutates_crm_state: false,
      forge_event_sourced: true
    },
    artifacts: [
      {
        kind: "crm_landing_page",
        id: `landing-page-${slug(pageId, "landing-page")}`,
        title: `Landing page ${landingPage.title || landingPage.headline || pageId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          campaign_id: campaignIdValue,
          landing_page_id: pageId,
          slug: landingPage.slug || slug(pageId, "landing-page"),
          headline: landingPage.headline || landingPage.title || campaign.name || pageId,
          sections: asArray(landingPage.sections),
          assets,
          publication_state: publicationState,
          external_publication_allowed: externalPublicationAllowed,
          approval_policy: approvalPolicy,
          form_schema_id: schemaId,
          lineage,
          state_owner: "forge_workflow_runtime",
          external_database_required: false,
          direct_browser_persistence: false
        }
      },
      {
        kind: "crm_form_schema",
        id: `form-schema-${slug(schemaId, "form")}`,
        title: `Form schema ${formSchema.title || schemaId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          campaign_id: campaignIdValue,
          landing_page_id: pageId,
          form_schema_id: schemaId,
          required_fields: requiredFields,
          optional_fields: optionalFields,
          consent_required: consentRequired,
          consent_artifact_type: "crm_consent_record",
          capture_contract: "crm.marketing.form_capture.executor",
          next_workflow_id: leadWorkflowId,
          lineage,
          mutation_policy: "form schema changes must be promoted by Forge workflow events"
        }
      },
      {
        kind: "crm_automation_plan",
        id: `landing-page-routing-${slug(pageId, "landing-page")}`,
        title: `Landing page routing plan for ${pageId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          campaign_id: campaignIdValue,
          landing_page_id: pageId,
          form_schema_id: schemaId,
          publication_state: publicationState,
          capture_contract: "crm.marketing.form_capture.executor",
          lead_workflow_id: leadWorkflowId,
          nurture_workflow_id: nurtureWorkflowId,
          campaign_workflow_id: campaignWorkflowId,
          external_publication_policy: "external publication requires Forge approval and artifact lineage",
          form_submission_policy: "form submissions enter crm.lead.lifecycle through Forge events",
          lineage
        }
      }
    ],
    events,
    context_tenant: context.tenant || tenantId
  };
}

export function buildMarketingFormCaptureResult(request) {
  const input = dispatchPayload(request);
  const context = providedContext(request);
  const tenantId = input.tenant_id || input.tenant_context?.tenant_id || input.tenant_context?.id || context.tenant || "default";
  const campaign = asObject(input.campaign);
  const landingPage = asObject(input.landing_page ?? input.landingPage);
  const submission = asObject(input.form_submission ?? input.submission);
  const consentPolicy = asObject(input.consent_policy);
  const routingPolicy = asObject(input.routing_policy);
  const fields = submissionFields(submission);
  const submissionId = String(submission.id || submission.submission_id || dispatchEnvelope(request).task_ref || "form-submission");
  const leadId = leadIdFromSubmission(submission, fields, submissionId);
  const campaignIdValue = campaignId(campaign, input.campaign_id || "campaign");
  const workflowId = String(input.workflow_id || "crm.campaign.lifecycle");
  const leadWorkflowId = String(input.lead_workflow_id || "crm.lead.lifecycle");
  const nurtureWorkflowId = String(input.nurture_workflow_id || "crm.lead.nurture");
  const taskRef = dispatchEnvelope(request).task_ref || `capture-form-${slug(submissionId, "submission")}`;
  const consentCaptured = consentPolicy.consent_given === true || consentPolicy.accepted === true;
  const consentState = consentCaptured ? "captured" : "consent_review_required";
  const owner = routingPolicy.owner || campaign.owner || "marketing-ops";
  const sequenceId = routingPolicy.nurture_sequence_id || routingPolicy.sequence_id || `nurture-${slug(campaignIdValue, "campaign")}`;
  const leadProfile = {
    id: leadId,
    email: fields.email || submission.email || null,
    name: fields.name || submission.name || null,
    company: fields.company || campaign.account || null,
    role: fields.role || fields.title || null,
    budget: fields.budget || fields.estimated_budget || null,
    pain: fields.pain || fields.problem || null,
    source: "landing_page_form"
  };
  const lineage = {
    workflow_id: workflowId,
    lead_workflow_id: leadWorkflowId,
    nurture_workflow_id: nurtureWorkflowId,
    task_ref: taskRef,
    source_contract: "crm.marketing.form_capture.executor",
    tenant_id: tenantId,
    campaign_id: campaignIdValue,
    form_submission_id: submissionId,
    lead_id: leadId
  };

  return {
    schema_version: "forge.addon_executor_result.v1",
    status: "completed",
    task_ref: taskRef,
    summary: `Form submission ${submissionId} captured as lead ${leadId} through Forge workflows`,
    outputs: {
      tenant_id: tenantId,
      form_submission_id: submissionId,
      lead_id: leadId,
      campaign_id: campaignIdValue,
      workflow_id: workflowId,
      lead_workflow_id: leadWorkflowId,
      nurture_workflow_id: nurtureWorkflowId,
      lead_state: "captured",
      consent_state: consentState,
      routing_owner: owner,
      mutates_crm_state: false,
      forge_event_sourced: true
    },
    artifacts: [
      {
        kind: "crm_form_submission",
        id: `form-submission-${slug(submissionId, "submission")}`,
        title: `Form submission ${submissionId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          form_submission_id: submissionId,
          form_id: submission.form_id || input.form_id || null,
          submitted_at: submission.submitted_at || input.submitted_at || null,
          campaign,
          landing_page: landingPage,
          fields,
          lineage,
          state_owner: "forge_workflow_runtime",
          external_database_required: false
        }
      },
      {
        kind: "crm_lead_capture",
        id: `lead-capture-${slug(leadId, "lead")}`,
        title: `Lead capture for ${leadProfile.company || leadId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          lead_id: leadId,
          lead_profile: leadProfile,
          lead_state: "captured",
          next_workflow_id: leadWorkflowId,
          classification_required: routingPolicy.classification_required !== false,
          lineage,
          mutation_policy: "lead state changes must be promoted by Forge workflow events"
        }
      },
      {
        kind: "crm_consent_record",
        id: `consent-${slug(leadId, "lead")}-${slug(submissionId, "submission")}`,
        title: `Consent record for ${leadProfile.company || leadId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          lead_id: leadId,
          form_submission_id: submissionId,
          consent_state: consentState,
          lawful_basis: consentPolicy.lawful_basis || "unknown",
          source: consentPolicy.source || "landing_page_form",
          consent_policy: consentPolicy,
          lineage
        }
      },
      {
        kind: "crm_automation_plan",
        id: `form-nurture-plan-${slug(submissionId, "submission")}`,
        title: `Form nurture plan for ${leadProfile.company || leadId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          lead_id: leadId,
          campaign_id: campaignIdValue,
          owner,
          sequence_id: sequenceId,
          next_wait_state: "wait_step",
          workflow_id: nurtureWorkflowId,
          delivery_policy: "external nurture messages require Forge approval and handoff contracts",
          lineage
        }
      }
    ],
    events: [
      {
        kind: "crm.form.submitted",
        tenant_id: tenantId,
        form_submission_id: submissionId,
        lead_id: leadId,
        campaign_id: campaignIdValue,
        workflow_id: workflowId
      },
      {
        kind: "crm.lead.created",
        tenant_id: tenantId,
        lead_id: leadId,
        campaign_id: campaignIdValue,
        workflow_id: leadWorkflowId,
        source: "landing_page_form",
        consent_state: consentState
      },
      {
        kind: "crm.nurture.step_due",
        tenant_id: tenantId,
        lead_id: leadId,
        campaign_id: campaignIdValue,
        sequence_id: sequenceId,
        workflow_id: nurtureWorkflowId,
        owner
      }
    ],
    context_tenant: context.tenant || tenantId
  };
}

export function buildOperationsProjectHandoffResult(request) {
  const input = dispatchPayload(request);
  const context = providedContext(request);
  const tenantId = input.tenant_id || input.tenant_context?.tenant_id || input.tenant_context?.id || context.tenant || "default";
  const handoffContext = asObject(input.handoff_context ?? input.handoff);
  const project = asObject(input.project);
  const tasks = asArray(input.tasks);
  const acceptancePolicy = asObject(input.acceptance_policy);
  const projectId = String(project.id || project.project_id || handoffContext.project_id || dispatchEnvelope(request).task_ref || "crm-project");
  const handoffId = String(handoffContext.id || handoffContext.handoff_id || `handoff-${slug(projectId, "project")}`);
  const account = project.account || handoffContext.account || project.name || projectId;
  const owner = project.owner || handoffContext.owner || tasks.find((task) => asObject(task).owner)?.owner || "operations";
  const workflowId = String(input.workflow_id || "crm.project.handoff");
  const taskRef = dispatchEnvelope(request).task_ref || `project-handoff-${slug(projectId, "project")}`;
  const normalizedTasks = tasks.map((task, index) => {
    const record = asObject(task);
    const status = String(record.status || "ready").toLowerCase();
    return {
      id: String(record.id || record.task_id || `task-${index + 1}`),
      title: record.title || record.name || `Task ${index + 1}`,
      owner: record.owner || owner,
      status,
      blocker: record.blocker || record.blocked_reason || null,
      workflow_id: workflowId
    };
  });
  const blockedTasks = normalizedTasks.filter((task) => task.status.includes("blocked") || task.blocker);
  const accepted = Boolean(handoffContext.accepted_by || acceptancePolicy.accepted_by || acceptancePolicy.accepted === true);
  const nextState = blockedTasks.length > 0 ? "blocked_wait" : normalizedTasks.length > 0 ? "tasks_in_progress" : "project_planned";
  const lineage = {
    workflow_id: workflowId,
    task_ref: taskRef,
    source_contract: "crm.operations.project_handoff.executor",
    tenant_id: tenantId,
    project_id: projectId,
    handoff_id: handoffId,
    source_workflow_id: handoffContext.source_workflow_id || input.source_workflow_id || null
  };
  const projectPlanId = `project-plan-${slug(projectId, "project")}`;
  const taskPlanId = `task-plan-${slug(projectId, "project")}`;
  const handoffRecordId = `project-handoff-${slug(projectId, "project")}`;
  const reportId = `project-report-${slug(projectId, "project")}`;

  return {
    schema_version: "forge.addon_executor_result.v1",
    status: "completed",
    task_ref: taskRef,
    summary: `Project handoff ${handoffId} planned for ${account} with ${normalizedTasks.length} tasks`,
    outputs: {
      tenant_id: tenantId,
      project_id: projectId,
      handoff_id: handoffId,
      workflow_id: workflowId,
      owner,
      task_count: normalizedTasks.length,
      blocked_task_count: blockedTasks.length,
      next_state: nextState,
      acceptance_required: acceptancePolicy.requires_acceptance === true,
      mutates_crm_state: false,
      forge_event_sourced: true
    },
    artifacts: [
      {
        kind: "crm_project_plan",
        id: projectPlanId,
        title: `Project plan for ${account}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          project_id: projectId,
          project,
          account,
          owner,
          due_at: project.due_at || null,
          next_state: nextState,
          lineage,
          state_owner: "forge_workflow_runtime",
          external_database_required: false
        }
      },
      {
        kind: "crm_task_plan",
        id: taskPlanId,
        title: `Task plan for ${account}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          project_id: projectId,
          tasks: normalizedTasks,
          blocked_tasks: blockedTasks,
          task_workflow_policy: "tasks are Forge workflow nodes or subworkflows with explicit owner and blocked reason",
          lineage
        }
      },
      {
        kind: "crm_handoff_record",
        id: handoffRecordId,
        title: `Project handoff record for ${account}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          handoff_id: handoffId,
          source_workflow_id: lineage.source_workflow_id,
          project_id: projectId,
          owner,
          accepted_by: handoffContext.accepted_by || acceptancePolicy.accepted_by || null,
          acceptance_policy: acceptancePolicy,
          lineage
        }
      },
      {
        kind: "crm_report",
        id: reportId,
        title: `Project handoff report for ${account}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          project_id: projectId,
          task_count: normalizedTasks.length,
          blocked_task_count: blockedTasks.length,
          next_state: nextState,
          acceptance_ready: accepted,
          rework_required: blockedTasks.length > 0,
          lineage
        }
      }
    ],
    events: [
      {
        kind: "crm.project.handoff_requested",
        tenant_id: tenantId,
        project_id: projectId,
        handoff_id: handoffId,
        workflow_id: workflowId,
        owner
      },
      {
        kind: "crm.task.created",
        tenant_id: tenantId,
        project_id: projectId,
        workflow_id: workflowId,
        task_count: normalizedTasks.length
      },
      ...(blockedTasks.length > 0
        ? [
            {
              kind: "crm.task.blocked",
              tenant_id: tenantId,
              project_id: projectId,
              workflow_id: workflowId,
              blocked_task_count: blockedTasks.length,
              blocked_reasons: blockedTasks.map((task) => task.blocker || "blocked")
            }
          ]
        : []),
      ...(accepted
        ? [
            {
              kind: "crm.project.accepted",
              tenant_id: tenantId,
              project_id: projectId,
              workflow_id: workflowId,
              accepted_by: handoffContext.accepted_by || acceptancePolicy.accepted_by || "policy"
            }
          ]
        : [])
    ],
    context_tenant: context.tenant || tenantId
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

export function buildChannelIntakeNormalizationResult(request) {
  const input = dispatchPayload(request);
  const context = providedContext(request);
  const envelope = dispatchEnvelope(request);
  const tenantId = input.tenant_id || input.tenant_context?.tenant_id || input.tenant_context?.id || context.tenant || "default";
  const providerEvent = asObject(input.provider_event ?? input.adapter_event ?? input.channel_event ?? input.event);
  const payload = asObject(providerEvent.payload ?? providerEvent.message ?? input.payload);
  const channelPolicy = asObject(input.channel_policy ?? input.adapter_policy);
  const routingPolicy = asObject(input.routing_policy);
  const channel = String(input.channel || providerEvent.channel || payload.channel || "unknown").toLowerCase();
  const provider = String(input.provider || providerEvent.provider || providerEvent.adapter || "unknown-provider");
  const allowedChannels = asArray(channelPolicy.allowed_channels).map((item) => String(item).toLowerCase());
  const approvedAdapters = asArray(channelPolicy.approved_adapters).map((item) => String(item));
  const channelAllowed = allowedChannels.length === 0 || allowedChannels.includes(channel);
  const adapterApproved = approvedAdapters.length === 0 || approvedAdapters.includes(provider);
  const authorized = channelAllowed && adapterApproved;
  const createTicketRequested = routingPolicy.create_ticket !== false;
  const ticketCreationAllowed = authorized && createTicketRequested;
  const taskRef = envelope.task_ref || `channel-intake-${slug(providerEvent.id || channel, "event")}`;
  const workflowId = String(input.workflow_id || "crm.omnichannel.channel_intake");
  const nextWorkflowId = String(input.next_workflow_id || "crm.ticket.sla");
  const eventId = String(providerEvent.id || providerEvent.event_id || envelope.dispatch_id || taskRef);
  const messageId = String(input.message_id || payload.id || payload.message_id || providerEvent.message_id || eventId);
  const threadId = String(input.thread_id || payload.thread_id || payload.chat_id || providerEvent.thread_id || `thread-${slug(channel, "channel")}-${slug(messageId, "message")}`);
  const normalizedText = String(payload.text || payload.body || payload.summary || providerEvent.text || providerEvent.body || "");
  const receivedAt = providerEvent.received_at || input.received_at || null;
  const ownerQueue = routingPolicy.default_queue || routingPolicy.queue || "support";
  const intakeState = authorized ? "authorized" : "authorization_blocked";
  const lineage = {
    workflow_id: workflowId,
    next_workflow_id: nextWorkflowId,
    task_ref: taskRef,
    source_contract: "crm.support.channel_intake.executor",
    tenant_id: tenantId,
    channel,
    provider,
    provider_event_id: eventId,
    message_id: messageId,
    ticket_creation_allowed: ticketCreationAllowed
  };

  return {
    schema_version: "forge.addon_executor_result.v1",
    status: "completed",
    task_ref: taskRef,
    summary: `Channel ${channel} event ${eventId} normalized with intake state ${intakeState}`,
    outputs: {
      tenant_id: tenantId,
      channel,
      provider,
      provider_event_id: eventId,
      message_id: messageId,
      thread_id: threadId,
      workflow_id: workflowId,
      next_workflow_id: nextWorkflowId,
      owner_queue: ownerQueue,
      intake_state: intakeState,
      channel_allowed: channelAllowed,
      adapter_approved: adapterApproved,
      ticket_creation_allowed: ticketCreationAllowed,
      mutates_crm_state: false,
      forge_event_sourced: true
    },
    artifacts: [
      {
        kind: "crm_channel_intake",
        id: `channel-intake-${slug(eventId, "event")}`,
        title: `Channel intake for ${channel}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          channel,
          provider,
          provider_event_id: eventId,
          intake_state: intakeState,
          channel_allowed: channelAllowed,
          adapter_approved: adapterApproved,
          ticket_creation_allowed: ticketCreationAllowed,
          channel_policy: channelPolicy,
          routing_policy: routingPolicy,
          normalized_message: {
            id: messageId,
            thread_id: threadId,
            channel,
            provider,
            from: payload.from || payload.sender || providerEvent.from || null,
            subject: payload.subject || providerEvent.subject || null,
            text: normalizedText,
            received_at: receivedAt
          },
          lineage,
          state_owner: "forge_workflow_runtime",
          external_database_required: false
        }
      },
      {
        kind: "crm_channel_receipt",
        id: `channel-receipt-${slug(eventId, "event")}`,
        title: `Channel receipt for ${eventId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          channel,
          provider,
          adapter_event_id: eventId,
          message_id: messageId,
          received_at: receivedAt,
          delivery_state: authorized ? "authorized" : "blocked",
          lineage,
          state_owner: "forge_workflow_runtime",
          external_database_required: false
        }
      },
      {
        kind: "crm_message_thread",
        id: `message-thread-${slug(threadId, "thread")}`,
        title: `Normalized ${channel} thread`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          thread_id: threadId,
          channel,
          provider,
          messages: [
            {
              id: messageId,
              from: payload.from || payload.sender || providerEvent.from || null,
              subject: payload.subject || providerEvent.subject || null,
              text: normalizedText,
              received_at: receivedAt
            }
          ],
          lineage,
          state_owner: "forge_workflow_runtime",
          external_database_required: false
        }
      }
    ],
    events: [
      {
        kind: authorized ? "crm.channel.authorized" : "crm.channel.authorization_blocked",
        tenant_id: tenantId,
        channel,
        provider,
        provider_event_id: eventId,
        workflow_id: workflowId,
        ticket_creation_allowed: ticketCreationAllowed
      },
      ...(authorized
        ? [
            {
              kind: "crm.message.normalized",
              tenant_id: tenantId,
              message_id: messageId,
              thread_id: threadId,
              channel,
              provider,
              workflow_id: workflowId,
              target_workflow_id: ticketCreationAllowed ? nextWorkflowId : null
            }
          ]
        : [])
    ],
    context_tenant: context.tenant || tenantId
  };
}

function threadChannel(thread) {
  return String(thread.channel || thread.source_channel || "unknown").toLowerCase();
}

function threadAccountId(thread) {
  return String(thread.account_id || thread.company_id || thread.customer_id || thread.customer_ref || "unknown-account");
}

function identityKey(record) {
  return String(record.account_id || record.company_id || record.contact_id || record.customer_ref || record.id || "unknown-identity");
}

export function buildOmnichannelCenterResult(request) {
  const input = dispatchPayload(request);
  const context = providedContext(request);
  const envelope = dispatchEnvelope(request);
  const tenantId = input.tenant_id || input.tenant_context?.tenant_id || input.tenant_context?.id || context.tenant || "default";
  const threads = asArray(input.channel_threads ?? input.threads).map(asObject);
  const identityRecords = asArray(input.identity_records ?? input.identities).map(asObject);
  const routingPolicy = asObject(input.routing_policy);
  const workflowId = String(input.workflow_id || "crm.omnichannel.center");
  const taskRef = envelope.task_ref || `omnichannel-center-${slug(tenantId, "tenant")}`;
  const channels = unique(threads.map(threadChannel).filter(Boolean)).sort();
  const identityByAccount = new Map(identityRecords.map((record) => [identityKey(record), record]));
  const groupedThreads = new Map();

  for (const thread of threads) {
    const accountId = threadAccountId(thread);
    const identity = identityByAccount.get(accountId) || identityRecords.find((record) => asArray(record.channels).includes(threadChannel(thread)));
    const key = identity ? identityKey(identity) : accountId;
    if (!groupedThreads.has(key)) {
      groupedThreads.set(key, []);
    }
    groupedThreads.get(key).push(thread);
  }

  const conversations = [...groupedThreads.entries()].map(([key, grouped], index) => {
    const identity = identityByAccount.get(key) || identityRecords.find((record) => identityKey(record) === key) || {};
    const conversationChannels = unique(grouped.map(threadChannel)).sort();
    const ticketIds = unique(grouped.map((thread) => thread.ticket_id).filter(Boolean));
    return {
      conversation_id: `conversation-${slug(key, `identity-${index + 1}`)}`,
      identity_key: key,
      account_id: identity.account_id || grouped[0]?.account_id || key,
      contact_id: identity.contact_id || null,
      channels: conversationChannels,
      thread_ids: grouped.map((thread, threadIndex) => String(thread.id || thread.thread_id || `thread-${index + 1}-${threadIndex + 1}`)),
      message_count: grouped.reduce((sum, thread) => sum + Math.max(1, numberFrom(thread.message_count, 1)), 0),
      ticket_ids: ticketIds,
      latest_message_at: grouped
        .map((thread) => thread.last_message_at || thread.received_at)
        .filter(Boolean)
        .sort()
        .at(-1) || null,
      state: ticketIds.length > 0 ? "routing_ready" : "identity_matched"
    };
  });

  const hasEscalation = conversations.some((conversation) => conversation.ticket_ids.length > 0 || conversation.channels.length > 1);
  const ownerQueue = hasEscalation
    ? routingPolicy.escalation_queue || routingPolicy.default_queue || "support-escalation"
    : routingPolicy.default_queue || routingPolicy.queue || "support";
  const centerState = conversations.length > 0 ? "routing_ready" : "rework_required";
  const lineage = {
    workflow_id: workflowId,
    task_ref: taskRef,
    source_contract: "crm.support.omnichannel_center.executor",
    tenant_id: tenantId,
    intake_workflow_id: "crm.omnichannel.channel_intake",
    ticket_workflow_id: "crm.ticket.sla"
  };

  return {
    schema_version: "forge.addon_executor_result.v1",
    status: "completed",
    task_ref: taskRef,
    summary: `Omnichannel center unified ${conversations.length} conversations across ${channels.length} channels`,
    outputs: {
      tenant_id: tenantId,
      workflow_id: workflowId,
      center_state: centerState,
      channel_count: channels.length,
      thread_count: threads.length,
      unified_conversation_count: conversations.length,
      identity_count: identityRecords.length,
      owner_queue: ownerQueue,
      mutates_crm_state: false,
      forge_event_sourced: true
    },
    artifacts: [
      {
        kind: "crm_omnichannel_center_snapshot",
        id: `omnichannel-center-${slug(tenantId, "tenant")}`,
        title: `Omnichannel center snapshot for ${tenantId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          workflow_id: workflowId,
          center_state: centerState,
          channels,
          thread_count: threads.length,
          unified_conversation_count: conversations.length,
          owner_queue: ownerQueue,
          routing_policy: routingPolicy,
          lineage,
          state_owner: "forge_workflow_runtime",
          external_database_required: false
        }
      },
      {
        kind: "crm_unified_conversation",
        id: `unified-conversation-${slug(conversations[0]?.identity_key || tenantId, "conversation")}`,
        title: `Unified conversation for ${conversations[0]?.account_id || tenantId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          conversations,
          source_threads: threads,
          lineage,
          mutation_policy: "conversation state changes are promoted by Forge workflow events"
        }
      },
      {
        kind: "crm_channel_identity_map",
        id: `channel-identity-map-${slug(tenantId, "tenant")}`,
        title: `Channel identity map for ${tenantId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          identity_records: identityRecords,
          mapped_conversations: conversations.map((conversation) => ({
            conversation_id: conversation.conversation_id,
            identity_key: conversation.identity_key,
            channels: conversation.channels,
            confidence: identityRecords.find((record) => identityKey(record) === conversation.identity_key)?.confidence ?? null
          })),
          lineage
        }
      },
      {
        kind: "crm_support_queue_snapshot",
        id: `support-queue-omnichannel-${slug(tenantId, "tenant")}`,
        title: `Support queue snapshot from omnichannel center`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          workflow_id: workflowId,
          owner_queue: ownerQueue,
          routing_ready_conversations: conversations.filter((conversation) => conversation.state === "routing_ready").length,
          handoff_wait_conversations: conversations.filter((conversation) => conversation.ticket_ids.length > 0).length,
          next_contract_id: "crm.support.ticket_sla.executor",
          lineage
        }
      }
    ],
    events: [
      {
        kind: "crm.omnichannel.center_snapshot",
        tenant_id: tenantId,
        workflow_id: workflowId,
        channel_count: channels.length,
        thread_count: threads.length,
        unified_conversation_count: conversations.length
      },
      {
        kind: "crm.conversation.unified",
        tenant_id: tenantId,
        workflow_id: workflowId,
        conversation_count: conversations.length,
        channels
      },
      {
        kind: "crm.channel.identity_mapped",
        tenant_id: tenantId,
        workflow_id: workflowId,
        identity_count: identityRecords.length,
        mapped_conversation_count: conversations.length
      }
    ],
    context_tenant: context.tenant || tenantId
  };
}

export function buildOmnichannelMessageIngestionResult(request) {
  const input = dispatchPayload(request);
  const context = providedContext(request);
  const envelope = dispatchEnvelope(request);
  const tenantId = input.tenant_id || input.tenant_context?.tenant_id || input.tenant_context?.id || context.tenant || "default";
  const adapterEvent = asObject(input.adapter_event ?? input.channel_event ?? input.event);
  const message = asObject(input.message ?? input.inbound_message);
  const customer = asObject(input.customer ?? input.account_context ?? input.contact);
  const routingPolicy = asObject(input.routing_policy);
  const channel = String(input.channel || adapterEvent.channel || message.channel || customer.preferred_channel || "unknown");
  const messageId = String(message.id || message.message_id || adapterEvent.message_id || adapterEvent.id || envelope.task_ref || "crm-message");
  const accountId = String(customer.account_id || customer.company_id || customer.id || "unknown-account");
  const account = customer.account || customer.company || customer.name || input.account || accountId;
  const threadId = String(input.thread_id || message.thread_id || adapterEvent.thread_id || `thread-${slug(accountId, "account")}`);
  const ticketId = String(input.ticket_id || message.ticket_id || `ticket-${slug(messageId, "message")}`);
  const taskRef = envelope.task_ref || `ingest-message-${slug(messageId, "message")}`;
  const workflowId = String(input.workflow_id || "crm.ticket.sla");
  const messageWorkflowId = String(input.message_workflow_id || "crm.omnichannel.message");
  const priorityKeywords =
    asArray(routingPolicy.priority_keywords).length > 0
      ? asArray(routingPolicy.priority_keywords).map((keyword) => String(keyword).toLowerCase())
      : ["urgent", "critical", "blocked", "bloqueado", "parado"];
  const messageText = [message.subject, message.text, message.body, message.summary].filter(Boolean).join(" ");
  const priorityDetected = textIncludes(messageText, priorityKeywords);
  const ownerQueue = routingPolicy.default_queue || routingPolicy.queue || "support";
  const createTicket = routingPolicy.create_ticket !== false;
  const receivedAt = adapterEvent.received_at || message.received_at || input.received_at || null;
  const lineage = {
    workflow_id: workflowId,
    message_workflow_id: messageWorkflowId,
    task_ref: taskRef,
    source_contract: "crm.support.omnichannel_message.executor",
    tenant_id: tenantId,
    channel,
    message_id: messageId,
    thread_id: threadId,
    ticket_id: createTicket ? ticketId : null
  };

  return {
    schema_version: "forge.addon_executor_result.v1",
    status: "completed",
    task_ref: taskRef,
    summary: `Message ${messageId} ingested from ${channel} into ${ownerQueue}`,
    outputs: {
      tenant_id: tenantId,
      channel,
      message_id: messageId,
      thread_id: threadId,
      ticket_id: createTicket ? ticketId : null,
      workflow_id: workflowId,
      message_workflow_id: messageWorkflowId,
      ticket_state: createTicket ? "received" : "message_received",
      owner_queue: ownerQueue,
      priority_detected: priorityDetected,
      mutates_crm_state: false,
      forge_event_sourced: true
    },
    artifacts: [
      {
        kind: "crm_message_thread",
        id: `message-thread-${slug(threadId, "thread")}`,
        title: `Message thread for ${account}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          thread_id: threadId,
          channel,
          account,
          account_id: accountId,
          customer,
          messages: [
            {
              id: messageId,
              from: message.from || message.sender || customer.id || null,
              subject: message.subject || null,
              text: message.text || message.body || message.summary || "",
              received_at: receivedAt
            }
          ],
          lineage,
          state_owner: "forge_workflow_runtime",
          external_database_required: false
        }
      },
      {
        kind: "crm_channel_receipt",
        id: `channel-receipt-${slug(messageId, "message")}`,
        title: `Channel receipt for ${messageId}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          channel,
          message_id: messageId,
          provider: adapterEvent.provider || adapterEvent.adapter || null,
          adapter_event_id: adapterEvent.id || null,
          received_at: receivedAt,
          delivery_state: "received",
          lineage,
          state_owner: "forge_workflow_runtime",
          external_database_required: false
        }
      },
      {
        kind: "crm_support_summary",
        id: `support-intake-${slug(ticketId, "ticket")}`,
        title: `Support intake for ${account}`,
        content_type: "application/json",
        data: {
          tenant_id: tenantId,
          ticket_id: createTicket ? ticketId : null,
          message_id: messageId,
          channel,
          owner_queue: ownerQueue,
          ticket_state: createTicket ? "received" : "message_received",
          priority_detected: priorityDetected,
          routing_policy: routingPolicy,
          lineage,
          state_owner: "forge_workflow_runtime",
          external_database_required: false
        }
      }
    ],
    events: [
      {
        kind: "crm.message.received",
        tenant_id: tenantId,
        message_id: messageId,
        thread_id: threadId,
        channel,
        workflow_id: messageWorkflowId,
        target_workflow_id: workflowId
      },
      ...(createTicket
        ? [
            {
              kind: "crm.ticket.created",
              tenant_id: tenantId,
              ticket_id: ticketId,
              message_id: messageId,
              channel,
              owner_queue: ownerQueue,
              workflow_id: workflowId
            }
          ]
        : [])
    ],
    context_tenant: context.tenant || tenantId
  };
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
    case "forge_crm.enrich_relationship_profile":
      return buildRelationshipProfileEnrichmentResult(request);
    case "forge_crm.move_opportunity_stage":
      return buildOpportunityPipelineMoveResult(request);
    case "forge_crm.operating_copilot":
      return buildOperatingCopilotResult(request);
    case "forge_crm.run_area_copilot":
      return buildAreaCopilotResult(request);
    case "forge_crm.orchestrate_work_queue":
      return buildWorkQueueOrchestrationResult(request);
    case "forge_crm.generate_design_system":
      return buildDesignSystemResult(request);
    case "forge_crm.prepare_memory_promotion":
      return buildMemoryPromotionCandidateResult(request);
    case "forge_crm.evolve_workflow":
      return buildWorkflowEvolutionResult(request);
    case "forge_crm.run_enterprise_journey":
      return buildEnterpriseJourneyResult(request);
    case "forge_crm.orchestrate_subworkflows":
      return buildSubworkflowOrchestrationResult(request);
    case "forge_crm.inspect_observability":
      return buildObservabilityInspectorResult(request);
    case "forge_crm.generate_operating_readiness":
      return buildOperatingReadinessResult(request);
    case "forge_crm.generate_proposal":
      return buildProposalGeneratorResult(request);
    case "forge_crm.review_followup_forecast":
      return buildCommercialFollowupForecastResult(request);
    case "forge_crm.manage_account":
      return buildCommercialAccountManagementResult(request);
    case "forge_crm.manage_contract_signature":
      return buildCommercialContractSignatureResult(request);
    case "forge_crm.generate_document":
      return buildDocumentGeneratorResult(request);
    case "forge_crm.validate_document":
      return buildDocumentValidatorResult(request);
    case "forge_crm.record_document_approval":
      return buildDocumentApprovalDecisionResult(request);
    case "forge_crm.manage_document_library":
      return buildDocumentLibraryResult(request);
    case "forge_crm.automate_campaign":
      return buildMarketingCampaignAutomationResult(request);
    case "forge_crm.build_marketing_segment":
      return buildMarketingSegmentBuilderResult(request);
    case "forge_crm.publish_landing_page":
      return buildMarketingLandingPageResult(request);
    case "forge_crm.capture_form_submission":
      return buildMarketingFormCaptureResult(request);
    case "forge_crm.plan_project_handoff":
      return buildOperationsProjectHandoffResult(request);
    case "forge_crm.normalize_channel_intake":
      return buildChannelIntakeNormalizationResult(request);
    case "forge_crm.unify_omnichannel_center":
      return buildOmnichannelCenterResult(request);
    case "forge_crm.ingest_omnichannel_message":
      return buildOmnichannelMessageIngestionResult(request);
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
