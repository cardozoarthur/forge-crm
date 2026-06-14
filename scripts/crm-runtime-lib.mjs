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
    case "forge_crm.move_opportunity_stage":
      return buildOpportunityPipelineMoveResult(request);
    case "forge_crm.operating_copilot":
      return buildOperatingCopilotResult(request);
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
    case "forge_crm.automate_campaign":
      return buildMarketingCampaignAutomationResult(request);
    case "forge_crm.capture_form_submission":
      return buildMarketingFormCaptureResult(request);
    case "forge_crm.plan_project_handoff":
      return buildOperationsProjectHandoffResult(request);
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
