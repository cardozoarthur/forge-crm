import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import * as runtime from "../scripts/crm-runtime-lib.mjs";
import {
  buildTenantBootstrapResult,
  buildDocumentGeneratorResult,
  buildDocumentValidatorResult,
  buildOperatingCopilotResult,
  buildLeadClassifierResult,
  buildRelationshipTimelineResult,
  buildOmnichannelHandoffResult,
  buildOperatingSnapshotResult,
  buildProposalGeneratorResult,
  buildTicketSlaResult
} from "../scripts/crm-runtime-lib.mjs";
import { createCrmWorkerServer } from "../runtime/crm-worker.mjs";

function workerRequest(entrypoint, input, extra = {}) {
  return {
    schema_version: "forge.addon_runtime_worker_request.v1",
    worker_id: "test-worker",
    dispatch_id: "dispatch-test",
    runtime: "external_api",
    contract_id: extra.contract_id || "crm.test",
    contract_type: extra.contract_type || "executor",
    entrypoint,
    input: {
      schema_version: extra.input_schema || "forge.addon_executor_dispatch_input.v1",
      task_ref: extra.task_ref || "task-test",
      subject: extra.subject,
      handoff_ref: extra.handoff_ref,
      input,
      context: {
        provided_context: {
          tenant: "test"
        }
      }
    }
  };
}

function postJson(port, path, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body)
        }
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode,
            body: JSON.parse(raw)
          });
        });
      }
    );
    request.on("error", reject);
    request.end(body);
  });
}

test("lead classifier returns a Forge executor result without mutating CRM state", () => {
  const result = buildLeadClassifierResult(
    workerRequest("forge_crm.classify_lead", {
      lead_profile: {
        id: "lead-001",
        budget: 250000,
        company_size: 320,
        timeline: "urgent",
        role: "COO",
        source: "inbound demo",
        pain: "Needs auditable commercial workflows across sales and support."
      }
    })
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.lead_id, "lead-001");
  assert.ok(result.outputs.score >= 80);
  assert.equal(result.outputs.mutates_crm_state, false);
  assert.equal(result.context_tenant, "test");
});

test("relationship timeline records entity and pipeline events as Forge artifacts", () => {
  const result = buildRelationshipTimelineResult(
    workerRequest(
      "forge_crm.record_relationship_event",
      {
        tenant_context: { tenant_id: "demo" },
        entity: {
          id: "opp-001",
          kind: "opportunity",
          account: "Acme Logistics",
          contact_ids: ["contact-001"],
          company_id: "company-001"
        },
        relationships: [
          { from: "company-001", to: "contact-001", relation: "employs" },
          { from: "company-001", to: "opp-001", relation: "owns_opportunity" }
        ],
        timeline_event: {
          kind: "stage_changed",
          from_stage: "discovery",
          to_stage: "proposal",
          reason: "approved offer terms attached",
          owner: "sales-owner"
        },
        pipeline: {
          funnel_id: "enterprise",
          from_stage: "discovery",
          to_stage: "proposal",
          amount: 180000,
          probability: 0.64
        }
      },
      { contract_id: "crm.relationship.timeline.executor", task_ref: "crm-relationship-smoke" }
    )
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.tenant_id, "demo");
  assert.equal(result.outputs.entity_id, "opp-001");
  assert.equal(result.outputs.entity_kind, "opportunity");
  assert.equal(result.outputs.pipeline_stage, "proposal");
  assert.equal(result.outputs.funnel_id, "enterprise");
  assert.equal(result.outputs.mutates_crm_state, false);
  assert.equal(result.outputs.forge_event_sourced, true);

  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_timeline_snapshot"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_entity_model"));
  assert.ok(result.events.some((event) => event.kind === "crm.relationship.recorded"));
  assert.ok(result.events.some((event) => event.kind === "crm.opportunity.stage_changed"));
  assert.ok(result.events.some((event) => event.kind === "crm.forecast.updated"));
});

test("tenant bootstrap runtime returns a workflow-backed CRM pack", () => {
  const result = buildTenantBootstrapResult(
    workerRequest("forge_crm.bootstrap_tenant", {
      tenant_context: { tenant_id: "demo" }
    })
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.workflow_count >= 10, true);
  assert.equal(result.outputs.complete_scope, true);
  assert.equal(result.outputs.external_database_required, false);
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_workflow_pack"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_operating_model"));
});

test("operating snapshot runtime returns Forge-owned business surface state", () => {
  const result = buildOperatingSnapshotResult(
    workerRequest("forge_crm.operating_snapshot", {
      tenant_context: { tenant_id: "demo" }
    })
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.tenant_id, "demo");
  assert.equal(result.outputs.external_database_required, false);
  assert.equal(result.outputs.business_module_count, 6);
  assert.equal(result.outputs.operator_surface_count >= 7, true);
  assert.equal(result.artifacts[0].kind, "crm_operating_snapshot");
  assert.equal(result.artifacts[0].data.state_owner, "forge_workflow_runtime");
  assert.ok(result.artifacts[0].data.operator_surfaces.pipeline_kanban.workflow_ids.includes("crm.opportunity.pipeline"));
  assert.equal(result.events[0].kind, "crm.operating.snapshot_generated");
});

test("operating copilot prioritizes opportunities without mutating CRM state", () => {
  const result = buildOperatingCopilotResult(
    workerRequest("forge_crm.operating_copilot", {
      tenant_context: { tenant_id: "demo" },
      opportunities: [
        {
          id: "opp-low",
          account: "Small Co",
          amount: 18000,
          close_probability: 0.35,
          stage: "discovery",
          last_activity_days: 2
        },
        {
          id: "opp-priority",
          account: "Enterprise Co",
          amount: 240000,
          close_probability: 0.72,
          stage: "negotiation",
          last_activity_days: 9,
          risk_flags: ["legal_review_waiting"]
        }
      ],
      tickets: [{ id: "ticket-sla", severity: "high", sla_minutes_remaining: 20, status: "owner_assigned" }],
      documents: [
        { id: "proposal-priority", kind: "crm_proposal", state: "approval_wait", workflow_id: "crm.proposal.approval" }
      ],
      campaigns: [{ id: "campaign-q3", state: "scheduled", target_segment: "enterprise" }]
    })
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.tenant_id, "demo");
  assert.equal(result.outputs.mutates_crm_state, false);
  assert.equal(result.outputs.priority_opportunity_id, "opp-priority");
  assert.ok(result.outputs.executive_summary.includes("Enterprise Co"));
  assert.ok(result.outputs.risk_count >= 2);
  assert.ok(result.outputs.next_best_actions.includes("request_forge_approval_for_priority_opportunity_next_step"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_ai_recommendation"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_risk_analysis"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_report"));
  assert.ok(result.events.some((event) => event.kind === "crm.ai.operating_copilot_generated"));
});

test("proposal generator emits a draft proposal artifact gated by Forge approval", () => {
  const result = buildProposalGeneratorResult(
    workerRequest("forge_crm.generate_proposal", {
      opportunity: { id: "opp-001", amount: 125000, company: "Acme" },
      account_context: { name: "Acme" },
      approved_offer_terms: { amount: 125000, currency: "USD" }
    })
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.outputs.proposal_id, "proposal-opp-001");
  assert.equal(result.outputs.external_delivery_allowed, false);
  assert.equal(result.artifacts[0].kind, "crm_proposal");
});

test("commercial follow-up forecast executor schedules follow-ups and commission evidence as Forge artifacts", () => {
  assert.equal(typeof runtime.buildCommercialFollowupForecastResult, "function");

  const result = runtime.buildCommercialFollowupForecastResult(
    workerRequest(
      "forge_crm.review_followup_forecast",
      {
        tenant_context: { tenant_id: "demo" },
        opportunity: {
          id: "opp-forecast-001",
          account: "Acme Logistics",
          owner: "sales-owner",
          stage: "negotiation",
          amount: 240000,
          probability: 0.7
        },
        followup_policy: {
          due_at: "2026-07-02T14:00:00Z",
          channel: "email",
          sequence_id: "enterprise-renewal"
        },
        forecast_policy: {
          period: "2026-Q3",
          goal_amount: 300000
        },
        commission_policy: {
          rate: 0.08,
          eligible_stage: "negotiation"
        }
      },
      { contract_id: "crm.commercial.followup_forecast.executor", task_ref: "commercial-forecast-test" }
    )
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.tenant_id, "demo");
  assert.equal(result.outputs.opportunity_id, "opp-forecast-001");
  assert.equal(result.outputs.workflow_id, "crm.followup.forecast");
  assert.equal(result.outputs.followup_state, "waiting_due_date");
  assert.equal(result.outputs.forecast_amount, 168000);
  assert.equal(result.outputs.goal_attainment_percent, 56);
  assert.equal(result.outputs.commission_amount, 19200);
  assert.equal(result.outputs.mutates_crm_state, false);
  assert.equal(result.outputs.forge_event_sourced, true);

  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_followup_plan"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_email"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_forecast_report"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_commission_record"));
  assert.ok(result.events.some((event) => event.kind === "crm.followup.scheduled"));
  assert.ok(result.events.some((event) => event.kind === "crm.forecast.reviewed"));
  assert.ok(result.events.some((event) => event.kind === "crm.goal.progress_reviewed"));
  assert.ok(result.events.some((event) => event.kind === "crm.commission.accrued"));
});

test("document generator emits Forge-gated CRM document artifacts without state mutation", () => {
  const result = buildDocumentGeneratorResult(
    workerRequest(
      "forge_crm.generate_document",
      {
        tenant_context: { tenant_id: "demo" },
        workflow_id: "crm.campaign.lifecycle",
        document_kind: "campaign_asset_pack",
        subject: { id: "campaign-q3", account: "Acme Logistics" },
        requested_artifacts: [
          "crm_contract",
          "crm_campaign",
          "crm_email",
          "crm_landing_page",
          "crm_report",
          "crm_presentation"
        ],
        brief: {
          goal: "Launch an enterprise operations campaign",
          audience: "COO and operations leaders",
          approved_claims: ["workflow-first CRM", "Forge-owned approval gates"]
        }
      },
      { contract_id: "crm.document.generator.executor" }
    )
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.tenant_id, "demo");
  assert.equal(result.outputs.document_kind, "campaign_asset_pack");
  assert.equal(result.outputs.approval_state, "draft_requires_forge_approval");
  assert.equal(result.outputs.external_delivery_allowed, false);
  assert.equal(result.outputs.mutates_crm_state, false);

  const artifactKinds = result.artifacts.map((artifact) => artifact.kind);
  for (const kind of [
    "crm_document",
    "crm_contract",
    "crm_campaign",
    "crm_email",
    "crm_landing_page",
    "crm_report",
    "crm_presentation"
  ]) {
    assert.ok(artifactKinds.includes(kind), `missing generated artifact ${kind}`);
  }
  assert.ok(result.artifacts.every((artifact) => artifact.data.lineage.workflow_id === "crm.campaign.lifecycle"));
  assert.ok(result.events.some((event) => event.kind === "crm.document.generated"));
});

test("document validator fails missing lineage and passes approved Forge artifacts", () => {
  const failed = buildDocumentValidatorResult(
    workerRequest("forge_crm.validate_document", {
      artifact_ref: { id: "proposal-001" },
      approval_policy: { requires_human_approval: true, approved: true }
    })
  );
  assert.equal(failed.decision, "failed");
  assert.ok(failed.issues.some((issue) => issue.code === "missing_lineage"));

  const passed = buildDocumentValidatorResult(
    workerRequest(
      "forge_crm.validate_document",
      {
        artifact_ref: { id: "proposal-001", sha256: "abc" },
        approval_policy: { requires_human_approval: true, approved: true },
        lineage: { workflow_id: "wf-001", artifact_id: "proposal-001" }
      },
      { subject: "proposal-001" }
    )
  );
  assert.equal(passed.decision, "passed");
});

test("ticket SLA executor triages omnichannel tickets as Forge workflow artifacts", () => {
  const result = buildTicketSlaResult(
    workerRequest(
      "forge_crm.triage_ticket_sla",
      {
        tenant_context: { tenant_id: "demo" },
        ticket: {
          id: "ticket-001",
          account: "Acme Logistics",
          channel: "whatsapp",
          severity: "critical",
          subject: "Warehouse operations blocked",
          status: "received"
        },
        messages: [
          {
            id: "msg-001",
            channel: "whatsapp",
            from: "+5511999990000",
            text: "Expedição parada. Precisamos de retorno agora."
          }
        ],
        sla_policy: {
          first_response_minutes: 30,
          resolution_minutes: 240,
          elapsed_minutes: 45
        },
        routing_policy: {
          default_queue: "support",
          escalation_queue: "support-escalation"
        }
      },
      { contract_id: "crm.support.ticket_sla.executor", task_ref: "ticket-sla-test" }
    )
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.tenant_id, "demo");
  assert.equal(result.outputs.ticket_id, "ticket-001");
  assert.equal(result.outputs.channel, "whatsapp");
  assert.equal(result.outputs.sla_state, "sla_escalation");
  assert.equal(result.outputs.owner_queue, "support-escalation");
  assert.equal(result.outputs.escalation_required, true);
  assert.equal(result.outputs.mutates_crm_state, false);
  assert.equal(result.outputs.forge_event_sourced, true);
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_support_summary"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_handoff_record"));
  assert.ok(result.events.some((event) => event.kind === "crm.message.received"));
  assert.ok(result.events.some((event) => event.kind === "crm.ticket.created"));
  assert.ok(result.events.some((event) => event.kind === "crm.sla.escalated"));
});

test("marketing campaign automation executor schedules nurture workflows as Forge artifacts", () => {
  assert.equal(typeof runtime.buildMarketingCampaignAutomationResult, "function");

  const result = runtime.buildMarketingCampaignAutomationResult(
    workerRequest(
      "forge_crm.automate_campaign",
      {
        tenant_context: { tenant_id: "demo" },
        campaign: {
          id: "campaign-001",
          name: "Enterprise workflow CRM launch",
          goal: "Create enterprise pipeline",
          channels: ["email", "landing_page", "telegram"],
          scheduled_at: "2026-07-01T13:00:00Z"
        },
        segment: {
          id: "segment-enterprise-ops",
          name: "Enterprise operations leaders",
          criteria: { company_size_min: 500, roles: ["COO", "Head of Operations"] },
          lead_ids: ["lead-001", "lead-002", "lead-003"]
        },
        assets: [
          { id: "email-001", kind: "crm_email", approval_state: "approved" },
          { id: "lp-001", kind: "crm_landing_page", approval_state: "approved" }
        ],
        nurture_policy: {
          sequence_id: "nurture-enterprise-ops",
          wait_minutes: 1440,
          max_steps: 3
        }
      },
      { contract_id: "crm.marketing.campaign_automation.executor", task_ref: "campaign-automation-test" }
    )
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.tenant_id, "demo");
  assert.equal(result.outputs.campaign_id, "campaign-001");
  assert.equal(result.outputs.segment_id, "segment-enterprise-ops");
  assert.equal(result.outputs.workflow_id, "crm.campaign.lifecycle");
  assert.equal(result.outputs.nurture_workflow_id, "crm.lead.nurture");
  assert.equal(result.outputs.scheduled_state, "scheduled");
  assert.equal(result.outputs.lead_count, 3);
  assert.equal(result.outputs.mutates_crm_state, false);
  assert.equal(result.outputs.forge_event_sourced, true);

  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_campaign"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_segment"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_automation_plan"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_landing_page"));
  assert.ok(result.events.some((event) => event.kind === "crm.campaign.created"));
  assert.ok(result.events.some((event) => event.kind === "crm.campaign.scheduled"));
  assert.ok(result.events.some((event) => event.kind === "crm.nurture.step_due"));
});

test("operations project handoff executor plans project tasks as Forge workflow artifacts", () => {
  assert.equal(typeof runtime.buildOperationsProjectHandoffResult, "function");

  const result = runtime.buildOperationsProjectHandoffResult(
    workerRequest(
      "forge_crm.plan_project_handoff",
      {
        tenant_context: { tenant_id: "demo" },
        handoff_context: {
          id: "handoff-001",
          source_workflow_id: "crm.contract.signature",
          account: "Acme Logistics",
          owner: "delivery-lead",
          accepted_by: "delivery-director"
        },
        project: {
          id: "project-001",
          name: "Acme onboarding",
          goal: "Activate workflow-first CRM operations",
          due_at: "2026-08-01T12:00:00Z"
        },
        tasks: [
          { id: "task-kickoff", title: "Run kickoff", owner: "delivery-lead", status: "ready" },
          { id: "task-integration", title: "Connect channels", owner: "ops-engineer", status: "blocked", blocker: "Awaiting WhatsApp policy approval" }
        ],
        acceptance_policy: {
          criteria: ["project artifact attached", "owner visible", "blocked reason explicit"],
          requires_acceptance: true
        }
      },
      { contract_id: "crm.operations.project_handoff.executor", task_ref: "project-handoff-test" }
    )
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.tenant_id, "demo");
  assert.equal(result.outputs.project_id, "project-001");
  assert.equal(result.outputs.workflow_id, "crm.project.handoff");
  assert.equal(result.outputs.owner, "delivery-lead");
  assert.equal(result.outputs.task_count, 2);
  assert.equal(result.outputs.blocked_task_count, 1);
  assert.equal(result.outputs.next_state, "blocked_wait");
  assert.equal(result.outputs.mutates_crm_state, false);
  assert.equal(result.outputs.forge_event_sourced, true);

  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_project_plan"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_task_plan"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_handoff_record"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_report"));
  assert.ok(result.events.some((event) => event.kind === "crm.project.handoff_requested"));
  assert.ok(result.events.some((event) => event.kind === "crm.task.created"));
  assert.ok(result.events.some((event) => event.kind === "crm.task.blocked"));
  assert.ok(result.events.some((event) => event.kind === "crm.project.accepted"));
});

test("omnichannel handoff requires approval before delivery", () => {
  const review = buildOmnichannelHandoffResult(
    workerRequest("forge_crm.deliver_handoff", {
      ticket_context: { id: "ticket-001" },
      channel: "email",
      approved_message: { summary: "Needs review" }
    })
  );
  assert.equal(review.status, "review_required");

  const delivered = buildOmnichannelHandoffResult(
    workerRequest(
      "forge_crm.deliver_handoff",
      {
        ticket_context: { id: "ticket-001" },
        channel: "email",
        approved_message: { approved: true, summary: "Approved reply" },
        integration_policy: { approved: true }
      },
      { handoff_ref: "ticket-001" }
    )
  );
  assert.equal(delivered.status, "delivered");
  assert.equal(delivered.receipt.ticket_id, "ticket-001");
});

test("HTTP worker dispatches Forge runtime requests", async () => {
  const server = createCrmWorkerServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = server.address().port;
    const response = await postJson(
      port,
      "/runtime/execute",
      workerRequest("forge_crm.classify_lead", {
        lead_profile: {
          id: "lead-http-001",
          budget: 150000,
          company_size: 180,
          timeline: "this quarter",
          role: "Director",
          source: "partner"
        }
      })
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, "completed");
    assert.equal(response.body.result.schema_version, "forge.addon_executor_result.v1");
    assert.equal(response.body.attestation.execution_mode, "external_api");
    assert.equal(response.body.attestation.worker_id, "test-worker");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
