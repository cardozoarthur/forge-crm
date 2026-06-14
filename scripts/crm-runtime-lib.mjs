import { buildCrmPlan } from "./crm-plan-lib.mjs";

const ADDON_ID = "forge.addon.crm";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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
    case "forge_crm.classify_lead":
      return buildLeadClassifierResult(request);
    case "forge_crm.generate_proposal":
      return buildProposalGeneratorResult(request);
    case "forge_crm.validate_document":
      return buildDocumentValidatorResult(request);
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

