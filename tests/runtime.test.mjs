import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import * as runtime from "../scripts/crm-runtime-lib.mjs";
import {
  buildTenantBootstrapResult,
  buildDocumentGeneratorResult,
  buildDocumentValidatorResult,
  buildOperatingCopilotResult,
  buildDesignSystemResult,
  buildWorkQueueOrchestrationResult,
  buildLeadClassifierResult,
  buildRelationshipTimelineResult,
  buildOmnichannelHandoffResult,
  buildOperatingSnapshotResult,
  buildWorkflowEvolutionResult,
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

test("relationship profile enrichment returns contact company profile artifacts without mutating state", () => {
  assert.equal(typeof runtime.buildRelationshipProfileEnrichmentResult, "function");

  const result = runtime.buildRelationshipProfileEnrichmentResult(
    workerRequest(
      "forge_crm.enrich_relationship_profile",
      {
        tenant_context: { tenant_id: "demo" },
        entity_profile: {
          id: "contact-001",
          kind: "contact",
          name: "Mara Lopes",
          title: "COO",
          company_id: "company-001",
          company_name: "Acme Logistics",
          email: "mara@example.com",
          lifecycle_stage: "enrichment_wait"
        },
        enrichment_sources: [
          { id: "source-form", kind: "form_submission", confidence: 0.82, fields: ["email", "company_name", "role"] },
          { id: "source-call", kind: "sales_call", confidence: 0.74, fields: ["pain", "decision_process"] }
        ],
        relationship_signals: [
          { kind: "decision_authority", strength: "high", evidence: "COO owns operations budget" },
          { kind: "expansion_potential", strength: "medium", evidence: "multi-region logistics operation" }
        ],
        timeline_event: {
          kind: "profile_enriched",
          owner: "revenue-ops",
          reason: "merged approved enrichment sources"
        }
      },
      { contract_id: "crm.relationship.profile_enrichment.executor", task_ref: "relationship-profile-test" }
    )
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.tenant_id, "demo");
  assert.equal(result.outputs.entity_id, "contact-001");
  assert.equal(result.outputs.entity_kind, "contact");
  assert.equal(result.outputs.workflow_id, "crm.relationship.profile_enrichment");
  assert.equal(result.outputs.enrichment_source_count, 2);
  assert.equal(result.outputs.relationship_signal_count, 2);
  assert.equal(result.outputs.enrichment_state, "ready_for_approval");
  assert.equal(result.outputs.mutates_crm_state, false);
  assert.equal(result.outputs.forge_event_sourced, true);

  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_relationship_profile"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_enrichment_record"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_timeline_snapshot"));
  assert.ok(result.events.some((event) => event.kind === "crm.contact.enriched"));
  assert.ok(result.events.some((event) => event.kind === "crm.relationship.profile_updated"));
});

test("opportunity pipeline executor moves cards across funnels as Forge events", () => {
  assert.equal(typeof runtime.buildOpportunityPipelineMoveResult, "function");

  const result = runtime.buildOpportunityPipelineMoveResult(
    workerRequest(
      "forge_crm.move_opportunity_stage",
      {
        tenant_context: { tenant_id: "demo" },
        opportunity: {
          id: "opp-001",
          account: "Acme Logistics",
          amount: 180000,
          owner: "sales-owner"
        },
        pipeline_move: {
          funnel_id: "enterprise",
          from_stage: "discovery",
          to_stage: "proposal",
          reason: "approved offer terms attached",
          owner: "sales-owner"
        },
        board_context: {
          lanes: ["research", "discovery", "proposal", "negotiation", "won", "lost"],
          wip_limits: { proposal: 12 }
        },
        forecast_policy: {
          probability: 0.64,
          period: "2026-Q3"
        }
      },
      { contract_id: "crm.pipeline.stage_move.executor", task_ref: "pipeline-stage-move-test" }
    )
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.tenant_id, "demo");
  assert.equal(result.outputs.opportunity_id, "opp-001");
  assert.equal(result.outputs.workflow_id, "crm.opportunity.pipeline");
  assert.equal(result.outputs.funnel_id, "enterprise");
  assert.equal(result.outputs.from_stage, "discovery");
  assert.equal(result.outputs.to_stage, "proposal");
  assert.equal(result.outputs.stage_move_state, "moved");
  assert.equal(result.outputs.forecast_amount, 115200);
  assert.equal(result.outputs.mutates_crm_state, false);
  assert.equal(result.outputs.forge_event_sourced, true);

  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_pipeline_board"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_stage_change"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_forecast_report"));
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
  assert.equal(result.outputs.business_module_count, 7);
  assert.equal(result.outputs.operator_surface_count >= 7, true);
  assert.equal(result.artifacts[0].kind, "crm_operating_snapshot");
  assert.equal(result.artifacts[0].data.state_owner, "forge_workflow_runtime");
  assert.ok(result.artifacts[0].data.operator_surfaces.pipeline_kanban.workflow_ids.includes("crm.opportunity.pipeline"));
  assert.equal(result.events[0].kind, "crm.operating.snapshot_generated");
});

test("operating readiness maps Forge evidence into user-facing CRM deliverables", () => {
  assert.equal(typeof runtime.buildOperatingReadinessResult, "function");

  const result = runtime.buildOperatingReadinessResult(
    workerRequest(
      "forge_crm.generate_operating_readiness",
      {
        tenant_context: { tenant_id: "demo" },
        success_criteria: {
          goal: "Operate a complete enterprise CRM through Forge workflows",
          required_deliverables: [
            "relationship workspace",
            "commercial command center",
            "support inbox",
            "marketing automation",
            "document approvals",
            "project handoff",
            "enterprise customer journey",
            "subworkflow orchestration",
            "workflow automation designer"
          ]
        },
        operating_snapshot: {
          state_owner: "forge_workflow_runtime",
          external_database_required: false
        },
        validation_evidence: {
          commands: ["npm test", "forge addons validate", "forge runtime smoke"],
          workflow_artifact_count: 56,
          runtime_contract_count: 22
        }
      },
      { contract_id: "crm.operating.readiness.executor", task_ref: "readiness-test" }
    )
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.tenant_id, "demo");
  assert.equal(result.outputs.success_criteria_status, "operable_with_evidence");
  assert.equal(result.outputs.user_facing_deliverable_count, 12);
  assert.equal(result.outputs.ready_domain_count, 12);
  assert.equal(result.outputs.forge_only_operations, true);
  assert.equal(result.outputs.main_flow_dependency_external, false);
  assert.equal(result.outputs.mutates_crm_state, false);
  assert.equal(result.outputs.forge_event_sourced, true);

  for (const artifactKind of [
    "crm_operating_readiness_report",
    "crm_user_outcome_manifest",
    "crm_domain_coverage_matrix",
    "crm_business_runbook"
  ]) {
    assert.ok(result.artifacts.some((artifact) => artifact.kind === artifactKind), `missing readiness artifact ${artifactKind}`);
  }

  const outcomeManifest = result.artifacts.find((artifact) => artifact.kind === "crm_user_outcome_manifest");
  assert.ok(
    outcomeManifest.data.outcomes.some((outcome) => outcome.deliverable === "subworkflow orchestration"),
    "missing subworkflow orchestration user outcome"
  );
  assert.ok(
    outcomeManifest.data.outcomes.some((outcome) => outcome.deliverable === "workflow automation designer"),
    "missing workflow automation designer user outcome"
  );
  assert.ok(
    outcomeManifest.data.outcomes.some((outcome) => outcome.deliverable === "executive reporting"),
    "missing executive reporting user outcome"
  );
  assert.ok(result.events.some((event) => event.kind === "crm.operating.readiness_reported"));
  assert.ok(result.events.some((event) => event.kind === "crm.outcome.deliverables_mapped"));
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

test("executive reporting executor builds KPI dashboard and summary without local analytics state", () => {
  assert.equal(typeof runtime.buildExecutiveReportingResult, "function");

  const result = runtime.buildExecutiveReportingResult(
    workerRequest(
      "forge_crm.generate_executive_report",
      {
        tenant_context: { tenant_id: "demo" },
        operating_snapshot: {
          workflow_count: 28,
          business_module_count: 7,
          surface_count: 10,
          state_owner: "forge_workflow_runtime"
        },
        workflow_metrics: {
          approval_wait_count: 5,
          blocked_wait_count: 2,
          completed_workflow_count: 41
        },
        commercial_metrics: {
          pipeline_value: 820000,
          forecast_amount: 455000,
          recognized_revenue_amount: 300000,
          attainment_percent: 75
        },
        support_metrics: {
          open_ticket_count: 18,
          sla_at_risk_count: 3,
          breached_sla_count: 1
        },
        marketing_metrics: {
          active_campaign_count: 4,
          qualified_lead_count: 96,
          form_conversion_rate: 0.18
        },
        risk_register: [
          { id: "risk-sla", severity: "high", workflow_id: "crm.ticket.sla", summary: "SLA breach risk on enterprise queue" },
          { id: "risk-approval", severity: "medium", workflow_id: "crm.document.approval", summary: "Proposal approvals waiting finance" }
        ]
      },
      { contract_id: "crm.analytics.executive_report.executor", task_ref: "executive-reporting-test" }
    )
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.tenant_id, "demo");
  assert.equal(result.outputs.workflow_id, "crm.executive.reporting");
  assert.equal(result.outputs.reporting_state, "ready_for_review");
  assert.equal(result.outputs.kpi_count >= 8, true);
  assert.equal(result.outputs.risk_count, 2);
  assert.equal(result.outputs.recommended_action_count >= 2, true);
  assert.equal(result.outputs.local_analytics_state, false);
  assert.equal(result.outputs.mutates_crm_state, false);
  assert.equal(result.outputs.forge_event_sourced, true);
  assert.ok(result.outputs.executive_summary.includes("pipeline"));

  for (const artifactKind of ["crm_executive_summary", "crm_kpi_dashboard", "crm_business_review_report"]) {
    assert.ok(result.artifacts.some((artifact) => artifact.kind === artifactKind), `missing ${artifactKind}`);
  }

  const dashboard = result.artifacts.find((artifact) => artifact.kind === "crm_kpi_dashboard");
  assert.equal(dashboard.data.state_owner, "forge_workflow_runtime");
  assert.equal(dashboard.data.external_analytics_database_required, false);
  assert.ok(dashboard.data.kpis.some((kpi) => kpi.id === "pipeline_value" && kpi.value === 820000));
  assert.ok(dashboard.data.kpis.some((kpi) => kpi.id === "sla_at_risk_count" && kpi.value === 3));

  assert.ok(result.events.some((event) => event.kind === "crm.executive.summary_generated"));
  assert.ok(result.events.some((event) => event.kind === "crm.kpi.dashboard_generated"));
  assert.ok(result.events.some((event) => event.kind === "crm.risk.reviewed"));
});

test("area copilot generates specialized CRM recommendations without mutating state", () => {
  assert.equal(typeof runtime.buildAreaCopilotResult, "function");

  const result = runtime.buildAreaCopilotResult(
    workerRequest(
      "forge_crm.run_area_copilot",
      {
        tenant_context: { tenant_id: "demo" },
        area_contexts: [
          {
            area: "commercial",
            workflow_id: "crm.opportunity.pipeline",
            objective: "Protect renewal forecast",
            evidence_artifacts: ["crm_forecast_report", "crm_account_plan"],
            signals: ["priority deal has stale legal review"],
            requested_outcome: "next commercial actions"
          },
          {
            area: "support",
            workflow_id: "crm.ticket.sla",
            objective: "Prevent SLA breach",
            evidence_artifacts: ["crm_support_summary"],
            signals: ["critical ticket with 18 minutes left"],
            requested_outcome: "support escalation plan"
          },
          {
            area: "marketing",
            workflow_id: "crm.campaign.lifecycle",
            objective: "Improve lead quality",
            evidence_artifacts: ["crm_campaign", "crm_segment"],
            signals: ["enterprise segment conversion is below target"],
            requested_outcome: "nurture adjustment"
          },
          {
            area: "operations",
            workflow_id: "crm.project.handoff",
            objective: "Unblock onboarding",
            evidence_artifacts: ["crm_project_plan", "crm_task_plan"],
            signals: ["handoff is blocked by missing owner"],
            requested_outcome: "handoff recovery"
          },
          {
            area: "documents",
            workflow_id: "crm.document.approval",
            objective: "Clear approval queue",
            evidence_artifacts: ["crm_document", "crm_approval_record"],
            signals: ["proposal waits for finance approval"],
            requested_outcome: "document rework plan"
          }
        ],
        copilot_policy: {
          mutation_policy: "recommendation_only_until_forge_approval",
          require_evidence_refs: true,
          required_areas: ["commercial", "support", "marketing", "operations", "documents"]
        }
      },
      { contract_id: "crm.ai.area_copilot.executor", task_ref: "area-copilot-test" }
    )
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.tenant_id, "demo");
  assert.equal(result.outputs.area_count, 5);
  assert.equal(result.outputs.ready_area_count, 5);
  assert.equal(result.outputs.mutates_crm_state, false);
  assert.equal(result.outputs.mutation_requires_workflow_approval, true);
  assert.deepEqual(result.outputs.copilot_modes, ["commercial", "documents", "marketing", "operations", "support"]);
  assert.ok(result.outputs.specialized_copilots.every((copilot) => copilot.workflow_id && copilot.evidence_artifacts.length > 0));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_area_copilot_brief"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_ai_recommendation"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_risk_analysis"));
  assert.ok(result.events.some((event) => event.kind === "crm.ai.area_copilot_generated"));
  assert.ok(result.events.some((event) => event.kind === "crm.ai.recommendation_generated"));
});

test("landing page executor composes campaign pages and form schema through Forge", () => {
  assert.equal(typeof runtime.buildMarketingLandingPageResult, "function");

  const result = runtime.buildMarketingLandingPageResult(
    workerRequest(
      "forge_crm.publish_landing_page",
      {
        tenant_context: { tenant_id: "demo" },
        campaign: {
          id: "cmp-logistics-demo",
          name: "Logistics demo request",
          owner: "marketing.ops"
        },
        landing_page: {
          id: "lp-demo-request",
          slug: "demo-request",
          headline: "Operate sales and support through Forge workflows"
        },
        form_schema: {
          id: "form-demo-request",
          required_fields: ["email", "company", "role"],
          consent_required: true
        },
        approval_policy: {
          requires_approval: true,
          approver_role: "marketing.director"
        },
        routing_policy: {
          lead_workflow_id: "crm.lead.lifecycle",
          nurture_workflow_id: "crm.lead.nurture"
        }
      },
      { contract_id: "crm.marketing.landing_page.executor", task_ref: "landing-page-test" }
    )
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.tenant_id, "demo");
  assert.equal(result.outputs.workflow_id, "crm.marketing.landing_page");
  assert.equal(result.outputs.landing_page_id, "lp-demo-request");
  assert.equal(result.outputs.form_schema_id, "form-demo-request");
  assert.equal(result.outputs.publication_state, "approval_wait");
  assert.equal(result.outputs.external_publication_allowed, false);
  assert.equal(result.outputs.mutates_crm_state, false);
  assert.equal(result.outputs.forge_event_sourced, true);

  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_landing_page"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_form_schema"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_automation_plan"));
  assert.ok(result.events.some((event) => event.kind === "crm.landing_page.composed"));
  assert.ok(result.events.some((event) => event.kind === "crm.landing_page.approval_requested"));
  assert.ok(result.events.some((event) => event.kind === "crm.form.schema_published"));
});

test("work queue orchestrator packages approvals SLAs documents campaigns and handoffs through Forge", () => {
  assert.equal(typeof buildWorkQueueOrchestrationResult, "function");

  const result = buildWorkQueueOrchestrationResult(
    workerRequest(
      "forge_crm.orchestrate_work_queue",
      {
        tenant_context: { tenant_id: "demo" },
        queue_items: [
          {
            id: "approval-prop-001",
            queue: "approvals",
            workflow_id: "crm.proposal.approval",
            state: "approval_wait",
            owner: "commercial.director",
            artifact_refs: ["crm_proposal:doc-prop-001"],
            event_refs: ["crm.document.approval_requested"],
            priority: "high",
            sla_minutes_remaining: 90
          },
          {
            id: "ticket-sla-001",
            queue: "sla",
            workflow_id: "crm.ticket.sla",
            state: "sla_escalation",
            owner: "support.lead",
            artifact_refs: ["crm_support_summary:ticket-sla-001"],
            event_refs: ["crm.sla.escalated"],
            priority: "critical",
            sla_minutes_remaining: 15
          },
          {
            id: "doc-rework-001",
            queue: "documents",
            workflow_id: "crm.document.approval",
            state: "rework_required",
            artifact_refs: ["crm_document:doc-rework-001"],
            event_refs: ["crm.document.rework_required"],
            priority: "medium"
          },
          {
            id: "campaign-approval-001",
            queue: "campaigns",
            workflow_id: "crm.campaign.lifecycle",
            state: "approval_wait",
            owner: "marketing.ops",
            artifact_refs: ["crm_campaign:campaign-approval-001"],
            event_refs: ["crm.campaign.created"],
            priority: "medium"
          },
          {
            id: "handoff-blocked-001",
            queue: "handoffs",
            workflow_id: "crm.project.handoff",
            state: "blocked_wait",
            owner: "delivery.ops",
            artifact_refs: ["crm_project_plan:handoff-blocked-001"],
            event_refs: ["crm.task.blocked"],
            priority: "high"
          },
          {
            id: "renewal-wait-001",
            queue: "blocked_waits",
            workflow_id: "crm.contract.signature",
            state: "renewal_wait",
            owner: "legal.ops",
            artifact_refs: ["crm_renewal_plan:renewal-wait-001"],
            event_refs: ["crm.contract.renewal_scheduled"],
            priority: "low"
          }
        ],
        assignment_policy: {
          required_queues: ["approvals", "sla", "documents", "campaigns", "handoffs", "blocked_waits"],
          default_owner: "ops.commander",
          risk_threshold_minutes: 60,
          mutation_policy: "recommendation_only_until_forge_approval"
        }
      },
      { contract_id: "crm.queue.orchestrator.executor", task_ref: "queue-orchestration-test" }
    )
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.tenant_id, "demo");
  assert.equal(result.outputs.workflow_id, "crm.work.queue.orchestration");
  assert.equal(result.outputs.queue_count, 6);
  assert.equal(result.outputs.ready_item_count, 6);
  assert.equal(result.outputs.ownership_gap_count, 1);
  assert.ok(result.outputs.risk_item_count >= 3);
  assert.equal(result.outputs.mutates_crm_state, false);
  assert.equal(result.outputs.mutation_requires_workflow_approval, true);
  assert.deepEqual(result.outputs.queue_modes, ["approvals", "blocked_waits", "campaigns", "documents", "handoffs", "sla"]);
  assert.ok(result.outputs.assignments.every((assignment) => assignment.command_action_id === "crm.run-work-queue"));
  assert.ok(result.outputs.assignments.every((assignment) => assignment.state_owner === "forge_workflow_runtime"));

  for (const artifactKind of ["crm_work_queue_snapshot", "crm_queue_assignment_plan", "crm_queue_sla_risk_report"]) {
    assert.ok(result.artifacts.some((artifact) => artifact.kind === artifactKind), `missing ${artifactKind}`);
  }

  assert.ok(result.events.some((event) => event.kind === "crm.queue.snapshot_generated"));
  assert.ok(result.events.some((event) => event.kind === "crm.queue.assignment_planned"));
  assert.ok(result.events.some((event) => event.kind === "crm.queue.risk_flagged"));
});

test("design system executor packages Penpot Open Design tokens and components through Forge", () => {
  assert.equal(typeof buildDesignSystemResult, "function");

  const result = buildDesignSystemResult(
    workerRequest(
      "forge_crm.generate_design_system",
      {
        tenant_context: { tenant_id: "demo" },
        brand_context: {
          product_name: "Forge CRM",
          audience: "enterprise operators",
          tone: "quiet operational"
        },
        token_overrides: {
          color: {
            accent: "#126c55",
            risk: "#a53c3c"
          },
          radius: {
            panel: "8px"
          }
        },
        component_requests: ["workflow_node", "queue_card", "document_row", "command_action", "metric_tile"],
        design_policy: {
          inspiration: ["penpot", "open_design"],
          state_source: "forge_workflow_artifacts_and_events",
          direct_browser_persistence: false
        }
      },
      { contract_id: "crm.design_system.executor", task_ref: "design-system-test" }
    )
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.tenant_id, "demo");
  assert.equal(result.outputs.workflow_id, "crm.design.system");
  assert.equal(result.outputs.design_system, "penpot_open_design_inspired_tokens");
  assert.equal(result.outputs.component_count, 5);
  assert.equal(result.outputs.mutates_crm_state, false);
  assert.equal(result.outputs.forge_event_sourced, true);
  assert.equal(result.outputs.direct_browser_persistence, false);
  assert.ok(result.outputs.tokens.color.accent);
  assert.ok(result.outputs.components.every((component) => component.state_source === "forge_workflow_artifacts_and_events"));

  for (const artifactKind of ["crm_design_system", "crm_design_token_manifest", "crm_ui_component_catalog"]) {
    assert.ok(result.artifacts.some((artifact) => artifact.kind === artifactKind), `missing ${artifactKind}`);
  }

  assert.ok(result.events.some((event) => event.kind === "crm.design.system_generated"));
  assert.ok(result.events.some((event) => event.kind === "crm.design.tokens_published"));
});

test("memory promotion executor prepares governed Forge memory promotion requests", () => {
  assert.equal(typeof runtime.buildMemoryPromotionCandidateResult, "function");

  const result = runtime.buildMemoryPromotionCandidateResult(
    workerRequest(
      "forge_crm.prepare_memory_promotion",
      {
        tenant_context: { tenant_id: "demo", organization_id: "acme" },
        source_memory: {
          scope: "processing",
          source_path: ".forge/runs/run-001/customer-signal.md",
          audience: "private",
          summary: "Customer asked to prioritize SLA breach alerts before renewal work."
        },
        curated_knowledge: {
          summary: "Prioritize SLA breach alerts ahead of renewal workflow nudges for accounts with open critical tickets.",
          source_refs: ["ticket-001", "account-acme"],
          evidence: ["critical SLA breach", "renewal in progress"]
        },
        promotion_policy: {
          to_scope: "organization",
          memory_level: "standard",
          visibility: "internal",
          shareability: "organization_shared",
          approved_by: "success-lead",
          reason: "Reusable customer-success policy"
        }
      },
      { contract_id: "crm.memory.promotion.executor", task_ref: "memory-promotion-test" }
    )
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.tenant_id, "demo");
  assert.equal(result.outputs.from_scope, "processing");
  assert.equal(result.outputs.to_scope, "organization");
  assert.equal(result.outputs.memory_level, "standard");
  assert.equal(result.outputs.visibility, "internal");
  assert.equal(result.outputs.shareability, "organization_shared");
  assert.equal(result.outputs.approval_required, true);
  assert.equal(result.outputs.core_promotion_owner, "forge.memory.promote");
  assert.equal(result.outputs.mutates_crm_state, false);
  assert.equal(result.outputs.forge_event_sourced, true);
  assert.ok(result.outputs.promotion_command.includes("forge memory promote"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_knowledge_summary"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_memory_promotion_request"));
  assert.ok(result.events.some((event) => event.kind === "crm.memory.knowledge_curated"));
  assert.ok(result.events.some((event) => event.kind === "crm.memory.promotion_requested"));
});

test("workflow evolution executor proposes governed Forge experiments without self-modifying", () => {
  assert.equal(typeof buildWorkflowEvolutionResult, "function");

  const result = buildWorkflowEvolutionResult(
    workerRequest(
      "forge_crm.evolve_workflow",
      {
        tenant_context: { tenant_id: "demo" },
        workflow_state: {
          workflow_id: "crm.ticket.sla",
          current_version: "0.1.0",
          bottlenecks: ["manual SLA owner routing", "repeated escalation rework"]
        },
        observability_report: {
          audit_event_count: 34,
          cost_total_usd: 18.75,
          metric_samples: [
            { name: "sla_breach_count", value: 5 },
            { name: "cycle_time_minutes", value: 142 }
          ],
          risk_signals: ["sla_breach_count elevated"]
        },
        candidate_changes: [
          {
            id: "sla-owner-routing-policy",
            title: "Route SLA owner from channel and account tier",
            target_workflow_id: "crm.ticket.sla",
            expected_metric: "sla_breach_count",
            expected_delta: -2,
            rollback_plan: "restore previous owner routing policy"
          }
        ],
        benchmark_policy: {
          required_metric: "sla_breach_count",
          acceptance_threshold: 3,
          validation_command: "forge improve benchmark-event-policy --workflow crm.ticket.sla --policy sla-owner-routing-policy --output json",
          approved_by: "ops-lead"
        }
      },
      { contract_id: "crm.workflow.evolution.executor", task_ref: "workflow-evolution-test" }
    )
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.tenant_id, "demo");
  assert.equal(result.outputs.workflow_id, "crm.ticket.sla");
  assert.equal(result.outputs.evolution_state, "benchmark_wait");
  assert.equal(result.outputs.candidate_count, 1);
  assert.equal(result.outputs.promotion_allowed, false);
  assert.equal(result.outputs.requires_forge_improve, true);
  assert.equal(result.outputs.mutates_crm_state, false);
  assert.equal(result.outputs.forge_event_sourced, true);
  assert.ok(result.outputs.recommended_commands.every((command) => command.startsWith("forge improve")));

  for (const artifactKind of [
    "crm_workflow_evolution_plan",
    "crm_evolution_experiment",
    "crm_benchmark_report",
    "crm_promotion_decision",
    "crm_core_gap_report"
  ]) {
    assert.ok(result.artifacts.some((artifact) => artifact.kind === artifactKind), `missing ${artifactKind}`);
  }

  assert.ok(result.events.some((event) => event.kind === "crm.evolution.candidate_generated"));
  assert.ok(result.events.some((event) => event.kind === "crm.evolution.benchmark_reported"));
  assert.ok(result.events.some((event) => event.kind === "crm.evolution.promotion_decision_recorded"));
});

test("workflow automation designer compiles triggers conditions and actions without local execution", () => {
  assert.equal(typeof runtime.buildWorkflowAutomationDesignResult, "function");

  const result = runtime.buildWorkflowAutomationDesignResult(
    workerRequest(
      "forge_crm.design_workflow_automation",
      {
        tenant_context: { tenant_id: "demo" },
        automation_goal: {
          id: "auto-hot-lead-sla",
          title: "Route hot leads and SLA risks into governed work queues",
          business_goal: "Create auditable follow-up and support tasks from approved CRM events"
        },
        trigger_sources: [
          { id: "lead-created", event_type: "crm.lead.created", workflow_id: "crm.lead.lifecycle" },
          { id: "sla-escalated", event_type: "crm.sla.escalated", workflow_id: "crm.ticket.sla" },
          { id: "daily-forecast", schedule: "0 9 * * 1-5", workflow_id: "crm.followup.forecast" }
        ],
        rule_graph: {
          conditions: [
            { id: "lead-score", expression: "lead.score >= 80", evidence_artifact_type: "crm_ai_recommendation" },
            { id: "sla-risk", expression: "ticket.sla_state == 'sla_escalation'", evidence_artifact_type: "crm_support_summary" }
          ],
          actions: [
            { id: "queue-commercial", contract_id: "crm.queue.orchestrator.executor", workflow_id: "crm.work.queue.orchestration" },
            { id: "schedule-followup", contract_id: "crm.commercial.followup_forecast.executor", workflow_id: "crm.followup.forecast" },
            { id: "notify-support", contract_id: "crm.support.ticket_sla.executor", workflow_id: "crm.ticket.sla" }
          ]
        },
        validation_policy: {
          require_human_approval_before_activation: true,
          require_dry_run: true,
          approved_by: null
        }
      },
      { contract_id: "crm.workflow.automation_designer.executor", task_ref: "automation-designer-test" }
    )
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.workflow_id, "crm.workflow.automation_design");
  assert.equal(result.outputs.automation_state, "validation_ready");
  assert.equal(result.outputs.trigger_count, 3);
  assert.equal(result.outputs.condition_count, 2);
  assert.equal(result.outputs.action_count, 3);
  assert.equal(result.outputs.activation_allowed, false);
  assert.equal(result.outputs.mutates_crm_state, false);
  assert.equal(result.outputs.forge_event_sourced, true);

  for (const artifactKind of ["crm_workflow_automation_spec", "crm_trigger_condition_map", "crm_automation_validation_report"]) {
    assert.ok(result.artifacts.some((artifact) => artifact.kind === artifactKind), `missing automation artifact ${artifactKind}`);
  }
  assert.ok(result.events.some((event) => event.kind === "crm.automation.designed"));
  assert.ok(result.events.some((event) => event.kind === "crm.automation.validated"));
  assert.ok(result.events.some((event) => event.kind === "crm.automation.queued"));
});

test("enterprise journey executor packages a full lead-to-support CRM operation through Forge", () => {
  assert.equal(typeof runtime.buildEnterpriseJourneyResult, "function");

  const result = runtime.buildEnterpriseJourneyResult(
    workerRequest(
      "forge_crm.run_enterprise_journey",
      {
        tenant_context: { tenant_id: "demo" },
        journey_context: {
          id: "journey-acme",
          account: "Acme Logistics",
          goal: "Operate the full customer lifecycle on Forge CRM"
        },
        stage_evidence: [
          {
            id: "lead_capture",
            workflow_id: "crm.lead.lifecycle",
            contract_id: "crm.marketing.form_capture.executor",
            artifact_refs: ["crm_lead_capture"],
            event_refs: ["crm.lead.created"]
          },
          {
            id: "opportunity",
            workflow_id: "crm.opportunity.pipeline",
            contract_id: "crm.pipeline.stage_move.executor",
            artifact_refs: ["crm_pipeline_board"],
            event_refs: ["crm.opportunity.stage_changed"]
          },
          {
            id: "proposal",
            workflow_id: "crm.proposal.approval",
            contract_id: "crm.proposal.generator.executor",
            artifact_refs: ["crm_proposal"],
            event_refs: ["crm.proposal.generated"]
          },
          {
            id: "contract",
            workflow_id: "crm.contract.signature",
            contract_id: "crm.commercial.contract_signature.executor",
            artifact_refs: ["crm_contract", "crm_signature_receipt"],
            event_refs: ["crm.contract.signed"]
          },
          {
            id: "account",
            workflow_id: "crm.account.management",
            contract_id: "crm.commercial.account_management.executor",
            artifact_refs: ["crm_account_plan"],
            event_refs: ["crm.account.health_reviewed"]
          },
          {
            id: "support",
            workflow_id: "crm.ticket.sla",
            contract_id: "crm.support.ticket_sla.executor",
            artifact_refs: ["crm_support_summary"],
            event_refs: ["crm.ticket.created", "crm.sla.escalated"]
          },
          {
            id: "handoff",
            workflow_id: "crm.project.handoff",
            contract_id: "crm.operations.project_handoff.executor",
            artifact_refs: ["crm_project_plan", "crm_task_plan"],
            event_refs: ["crm.project.handoff_requested"]
          }
        ],
        acceptance_policy: {
          required_stage_ids: ["lead_capture", "opportunity", "proposal", "contract", "account", "support", "handoff"],
          required_domains: ["relationship", "commercial", "support", "marketing", "operations"],
          approved_by: "crm-operator"
        }
      },
      { contract_id: "crm.enterprise.journey.executor", task_ref: "enterprise-journey-test" }
    )
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.tenant_id, "demo");
  assert.equal(result.outputs.workflow_id, "crm.enterprise.customer_journey");
  assert.equal(result.outputs.acceptance_status, "operable_end_to_end");
  assert.equal(result.outputs.stage_count, 7);
  assert.equal(result.outputs.missing_stage_count, 0);
  assert.equal(result.outputs.main_flow_dependency_external, false);
  assert.equal(result.outputs.mutates_crm_state, false);
  assert.equal(result.outputs.forge_event_sourced, true);

  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_enterprise_journey_map"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_operating_acceptance_evidence"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_cross_domain_handoff_map"));
  assert.ok(result.events.some((event) => event.kind === "crm.journey.started"));
  assert.ok(result.events.some((event) => event.kind === "crm.journey.stage_completed"));
  assert.ok(result.events.some((event) => event.kind === "crm.journey.acceptance_reported"));
});

test("subworkflow orchestrator binds and validates child workflows without local state", () => {
  assert.equal(typeof runtime.buildSubworkflowOrchestrationResult, "function");

  const result = runtime.buildSubworkflowOrchestrationResult(
    workerRequest(
      "forge_crm.orchestrate_subworkflows",
      {
        tenant_context: { tenant_id: "demo" },
        parent_workflow: {
          id: "crm.enterprise.customer_journey",
          run_id: "run-journey-001",
          goal: "Operate Acme from opportunity to support handoff"
        },
        subworkflow_bindings: [
          {
            id: "subflow-pipeline",
            workflow_id: "crm.opportunity.pipeline",
            task_id: "stage-negotiation",
            validation_gate: "stage change has forecast artifact"
          },
          {
            id: "subflow-document",
            workflow_id: "crm.document.approval",
            task_id: "approve-proposal",
            validation_gate: "document approval artifact is attached"
          },
          {
            id: "subflow-support",
            workflow_id: "crm.ticket.sla",
            task_id: "triage-sla",
            validation_gate: "SLA event is promoted"
          },
          {
            id: "subflow-handoff",
            workflow_id: "crm.project.handoff",
            task_id: "handoff-delivery",
            validation_gate: "handoff owner is assigned"
          }
        ],
        handoff_policy: {
          promote_parent_only_after_children_validated: true,
          require_lineage_hash: true,
          owner: "forge"
        }
      },
      { contract_id: "crm.workflow.subworkflow_orchestrator.executor", task_ref: "subworkflow-orchestration-test" }
    )
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.tenant_id, "demo");
  assert.equal(result.outputs.workflow_id, "crm.subworkflow.orchestration");
  assert.equal(result.outputs.parent_workflow_id, "crm.enterprise.customer_journey");
  assert.equal(result.outputs.child_subworkflow_count, 4);
  assert.equal(result.outputs.validated_subworkflow_count, 4);
  assert.equal(result.outputs.orchestration_state, "validation_ready");
  assert.equal(result.outputs.promote_parent_allowed, true);
  assert.equal(result.outputs.mutates_crm_state, false);
  assert.equal(result.outputs.forge_event_sourced, true);

  for (const artifactKind of ["crm_subworkflow_plan", "crm_subworkflow_lineage_map", "crm_subworkflow_validation_report"]) {
    assert.ok(result.artifacts.some((artifact) => artifact.kind === artifactKind), `missing ${artifactKind}`);
  }
  assert.ok(result.events.some((event) => event.kind === "crm.subworkflow.bound"));
  assert.ok(result.events.some((event) => event.kind === "crm.subworkflow.validated"));
  assert.ok(result.events.some((event) => event.kind === "crm.subworkflow.promoted"));
});

test("observability inspector reports audit lineage cost metrics and logs from Forge state", () => {
  assert.equal(typeof runtime.buildObservabilityInspectorResult, "function");

  const result = runtime.buildObservabilityInspectorResult(
    workerRequest(
      "forge_crm.inspect_observability",
      {
        tenant_context: { tenant_id: "demo" },
        workflow_state: {
          workflow_id: "crm.opportunity.pipeline",
          status: "running",
          revision: 12,
          waiting_states: ["approval_wait"]
        },
        event_timeline: [
          { id: "evt-1", kind: "crm.opportunity.stage_changed", sequence: 1 },
          { id: "evt-2", kind: "crm.forecast.updated", sequence: 2 }
        ],
        artifact_lineage: [
          {
            artifact_id: "forecast-001",
            kind: "crm_forecast_report",
            produced_by: "crm.pipeline.stage_move.executor",
            source_event_ids: ["evt-2"]
          }
        ],
        cost_entries: [
          { runtime_contract_id: "crm.pipeline.stage_move.executor", amount_usd: 0.42 },
          { runtime_contract_id: "crm.ai.operating_copilot.executor", amount_usd: 1.15 }
        ],
        metric_samples: [
          { name: "cycle_time_minutes", value: 38 },
          { name: "sla_breach_count", value: 1 }
        ],
        log_entries: [
          { level: "info", message: "stage moved through Forge runtime" },
          { level: "warn", message: "approval wait is open" }
        ]
      },
      { contract_id: "crm.observability.inspector.executor", task_ref: "observability-test" }
    )
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.tenant_id, "demo");
  assert.equal(result.outputs.workflow_id, "crm.opportunity.pipeline");
  assert.equal(result.outputs.audit_event_count, 2);
  assert.equal(result.outputs.lineage_edge_count, 1);
  assert.equal(result.outputs.cost_total_usd, 1.57);
  assert.equal(result.outputs.metric_count, 2);
  assert.equal(result.outputs.log_count, 2);
  assert.equal(result.outputs.mutates_crm_state, false);
  assert.equal(result.outputs.forge_event_sourced, true);
  assert.equal(result.outputs.state_source, "forge_observability_state");

  for (const kind of ["crm_audit_report", "crm_lineage_map", "crm_cost_report", "crm_metric_snapshot"]) {
    assert.ok(result.artifacts.some((artifact) => artifact.kind === kind), `missing artifact ${kind}`);
  }

  for (const kind of ["crm.observability.inspected", "crm.audit.reported", "crm.cost.reviewed", "crm.metric.reviewed"]) {
    assert.ok(result.events.some((event) => event.kind === kind), `missing event ${kind}`);
  }
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

test("commercial goal commission executor settles period targets without direct payout mutation", () => {
  assert.equal(typeof runtime.buildCommercialGoalCommissionResult, "function");

  const result = runtime.buildCommercialGoalCommissionResult(
    workerRequest(
      "forge_crm.settle_goal_commission",
      {
        tenant_context: { tenant_id: "demo" },
        period_context: {
          period: "2026-Q3",
          currency: "USD",
          owner: "commercial.ops"
        },
        goal_targets: [
          {
            id: "goal-enterprise-new-arr",
            owner: "sales-owner",
            target_amount: 300000,
            weight: 0.7
          },
          {
            id: "goal-expansion-arr",
            owner: "sales-owner",
            target_amount: 100000,
            weight: 0.3
          }
        ],
        revenue_events: [
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
        ],
        commission_policy: {
          base_rate: 0.08,
          accelerator_rate: 0.12,
          accelerator_threshold_percent: 100,
          require_finance_approval_before_payout: true
        }
      },
      { contract_id: "crm.commercial.goal_commission.executor", task_ref: "goal-commission-test" }
    )
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.tenant_id, "demo");
  assert.equal(result.outputs.workflow_id, "crm.goal.commission");
  assert.equal(result.outputs.period, "2026-Q3");
  assert.equal(result.outputs.target_amount, 400000);
  assert.equal(result.outputs.recognized_revenue_amount, 300000);
  assert.equal(result.outputs.attainment_percent, 75);
  assert.equal(result.outputs.commission_statement_amount, 24000);
  assert.equal(result.outputs.payout_allowed, false);
  assert.equal(result.outputs.mutates_crm_state, false);
  assert.equal(result.outputs.forge_event_sourced, true);

  for (const kind of ["crm_goal_scorecard", "crm_commission_statement", "crm_compensation_audit_report"]) {
    assert.ok(result.artifacts.some((artifact) => artifact.kind === kind), `missing artifact ${kind}`);
  }
  for (const kind of ["crm.goal.target_set", "crm.goal.attainment_reviewed", "crm.commission.statement_generated"]) {
    assert.ok(result.events.some((event) => event.kind === kind), `missing event ${kind}`);
  }
});

test("commercial account management executor produces account health and expansion workflows as Forge artifacts", () => {
  assert.equal(typeof runtime.buildCommercialAccountManagementResult, "function");

  const result = runtime.buildCommercialAccountManagementResult(
    workerRequest(
      "forge_crm.manage_account",
      {
        tenant_context: { tenant_id: "demo" },
        account: {
          id: "account-001",
          name: "Acme Logistics",
          owner: "account-owner",
          lifecycle_stage: "active_customer",
          arr: 180000,
          renewal_at: "2026-10-01T00:00:00Z"
        },
        health_signals: {
          product_usage_percent: 78,
          open_critical_tickets: 1,
          stakeholder_engagement: "medium",
          invoice_status: "current"
        },
        expansion_opportunities: [
          {
            id: "expansion-001",
            name: "Add omnichannel operations team",
            amount: 60000,
            probability: 0.65
          }
        ],
        success_plan: {
          objective: "Expand CRM usage into operations",
          next_review_at: "2026-07-15T12:00:00Z",
          required_actions: ["schedule executive business review", "attach adoption report"]
        }
      },
      { contract_id: "crm.commercial.account_management.executor", task_ref: "account-management-test" }
    )
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.tenant_id, "demo");
  assert.equal(result.outputs.account_id, "account-001");
  assert.equal(result.outputs.workflow_id, "crm.account.management");
  assert.equal(result.outputs.owner, "account-owner");
  assert.equal(result.outputs.health_state, "watch");
  assert.equal(result.outputs.renewal_state, "renewal_planned");
  assert.equal(result.outputs.expansion_forecast_amount, 39000);
  assert.equal(result.outputs.next_state, "success_plan_active");
  assert.equal(result.outputs.mutates_crm_state, false);
  assert.equal(result.outputs.forge_event_sourced, true);

  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_account_plan"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_health_report"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_forecast_report"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_task_plan"));
  assert.ok(result.events.some((event) => event.kind === "crm.account.health_reviewed"));
  assert.ok(result.events.some((event) => event.kind === "crm.account.renewal_planned"));
  assert.ok(result.events.some((event) => event.kind === "crm.account.expansion_identified"));
  assert.ok(result.events.some((event) => event.kind === "crm.task.created"));
});

test("commercial contract signature executor records signature receipt and renewal plan as Forge artifacts", () => {
  assert.equal(typeof runtime.buildCommercialContractSignatureResult, "function");

  const result = runtime.buildCommercialContractSignatureResult(
    workerRequest(
      "forge_crm.manage_contract_signature",
      {
        tenant_context: { tenant_id: "demo" },
        contract: {
          id: "contract-001",
          account: "Acme Logistics",
          opportunity_id: "opp-001",
          amount: 180000,
          status: "legal_review"
        },
        approval_policy: {
          requires_human_approval: true,
          approved: true,
          approver: "legal-lead"
        },
        signature: {
          provider: "docusign",
          signer: "client-cfo",
          signed_at: "2026-07-10T15:00:00Z",
          receipt_id: "sig-001"
        },
        renewal_policy: {
          renewal_at: "2027-07-10T00:00:00Z",
          reminder_days_before: 60,
          owner: "account-owner"
        }
      },
      { contract_id: "crm.commercial.contract_signature.executor", task_ref: "contract-signature-test" }
    )
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.tenant_id, "demo");
  assert.equal(result.outputs.contract_id, "contract-001");
  assert.equal(result.outputs.workflow_id, "crm.contract.signature");
  assert.equal(result.outputs.contract_state, "signed");
  assert.equal(result.outputs.signature_state, "signed");
  assert.equal(result.outputs.renewal_state, "renewal_wait");
  assert.equal(result.outputs.external_signature_delivery_allowed, false);
  assert.equal(result.outputs.mutates_crm_state, false);
  assert.equal(result.outputs.forge_event_sourced, true);

  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_contract"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_signature_receipt"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_renewal_plan"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_report"));
  assert.ok(result.events.some((event) => event.kind === "crm.contract.reviewed"));
  assert.ok(result.events.some((event) => event.kind === "crm.contract.signed"));
  assert.ok(result.events.some((event) => event.kind === "crm.contract.renewal_scheduled"));
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

test("document approval executor records approved decisions as Forge artifacts and events", () => {
  assert.equal(typeof runtime.buildDocumentApprovalDecisionResult, "function");

  const result = runtime.buildDocumentApprovalDecisionResult(
    workerRequest(
      "forge_crm.record_document_approval",
      {
        tenant_context: { tenant_id: "demo" },
        document: {
          id: "proposal-001",
          kind: "crm_proposal",
          title: "Enterprise proposal",
          workflow_id: "crm.document.approval",
          artifact_id: "artifact-proposal-001"
        },
        approval_decision: {
          decision: "approved",
          approver: "revenue-lead",
          reason: "Offer and legal language approved",
          approved_at: "2026-07-21T12:00:00Z"
        },
        validation_report: {
          decision: "passed",
          issues: []
        },
        delivery_policy: {
          external_delivery_requested: true,
          channel: "email"
        }
      },
      { contract_id: "crm.document.approval.executor", task_ref: "document-approval-test" }
    )
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.tenant_id, "demo");
  assert.equal(result.outputs.document_id, "proposal-001");
  assert.equal(result.outputs.workflow_id, "crm.document.approval");
  assert.equal(result.outputs.approval_state, "approved");
  assert.equal(result.outputs.external_delivery_allowed, true);
  assert.equal(result.outputs.mutates_crm_state, false);
  assert.equal(result.outputs.forge_event_sourced, true);
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_approval_record"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_handoff_record"));
  assert.ok(result.events.some((event) => event.kind === "crm.document.approved"));
  assert.ok(result.events.some((event) => event.kind === "crm.document.delivery_unblocked"));
});

test("document library executor records file versions as Forge artifacts without local state", () => {
  assert.equal(typeof runtime.buildDocumentLibraryResult, "function");

  const result = runtime.buildDocumentLibraryResult(
    workerRequest(
      "forge_crm.manage_document_library",
      {
        tenant_context: { tenant_id: "demo" },
        document_request: {
          id: "library-request-001",
          title: "Enterprise proposal library record",
          workflow_id: "crm.document.library",
          collection_id: "collection-enterprise-sales",
          requested_by: "revenue-ops"
        },
        file_record: {
          id: "file-proposal-001",
          artifact_id: "artifact-proposal-001",
          document_id: "proposal-001",
          kind: "crm_proposal",
          filename: "enterprise-proposal-v2.pdf",
          checksum: "sha256:proposal-v2",
          approval_state: "approved"
        },
        version_policy: {
          current_version: 1,
          next_version: 2,
          promotion_requires_approval: true,
          approver_role: "commercial.director"
        },
        approval_decision: {
          decision: "approval_wait",
          approver: "commercial.director",
          reason: "Version needs approval before external use"
        }
      },
      { contract_id: "crm.document.library.executor", task_ref: "document-library-test" }
    )
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.tenant_id, "demo");
  assert.equal(result.outputs.document_id, "proposal-001");
  assert.equal(result.outputs.file_id, "file-proposal-001");
  assert.equal(result.outputs.version_id, "proposal-001-v2");
  assert.equal(result.outputs.collection_id, "collection-enterprise-sales");
  assert.equal(result.outputs.workflow_id, "crm.document.library");
  assert.equal(result.outputs.version_state, "approval_wait");
  assert.equal(result.outputs.mutates_crm_state, false);
  assert.equal(result.outputs.forge_event_sourced, true);

  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_file_record"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_document_version"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_document_collection"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_approval_record"));
  assert.ok(result.events.some((event) => event.kind === "crm.file.recorded"));
  assert.ok(result.events.some((event) => event.kind === "crm.document.versioned"));
  assert.ok(result.events.some((event) => event.kind === "crm.document.collection_updated"));
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

test("omnichannel message ingestion records channel intake before SLA or handoff", () => {
  assert.equal(typeof runtime.buildOmnichannelMessageIngestionResult, "function");

  const result = runtime.buildOmnichannelMessageIngestionResult(
    workerRequest(
      "forge_crm.ingest_omnichannel_message",
      {
        tenant_context: { tenant_id: "demo" },
        channel: "whatsapp",
        adapter_event: {
          id: "wa-event-001",
          provider: "whatsapp-cloud",
          received_at: "2026-07-21T11:30:00Z"
        },
        message: {
          id: "msg-001",
          from: "+5511999990000",
          text: "Pedido parado no CD. Preciso falar com suporte.",
          subject: "Pedido parado"
        },
        customer: {
          id: "customer-001",
          name: "Acme Logistics",
          account_id: "account-001"
        },
        routing_policy: {
          default_queue: "support",
          create_ticket: true,
          priority_keywords: ["parado", "bloqueado"]
        }
      },
      { contract_id: "crm.support.omnichannel_message.executor", task_ref: "omni-ingest-test" }
    )
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.tenant_id, "demo");
  assert.equal(result.outputs.channel, "whatsapp");
  assert.equal(result.outputs.message_id, "msg-001");
  assert.equal(result.outputs.workflow_id, "crm.ticket.sla");
  assert.equal(result.outputs.message_workflow_id, "crm.omnichannel.message");
  assert.equal(result.outputs.ticket_state, "received");
  assert.equal(result.outputs.owner_queue, "support");
  assert.equal(result.outputs.mutates_crm_state, false);
  assert.equal(result.outputs.forge_event_sourced, true);

  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_message_thread"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_channel_receipt"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_support_summary"));
  assert.ok(result.events.some((event) => event.kind === "crm.message.received"));
  assert.ok(result.events.some((event) => event.kind === "crm.ticket.created"));
});

test("channel intake executor normalizes approved provider events before ticket creation", () => {
  assert.equal(typeof runtime.buildChannelIntakeNormalizationResult, "function");

  const result = runtime.buildChannelIntakeNormalizationResult(
    workerRequest(
      "forge_crm.normalize_channel_intake",
      {
        tenant_context: { tenant_id: "demo" },
        channel: "telegram",
        provider_event: {
          id: "tg-update-001",
          provider: "telegram-bot-api",
          received_at: "2026-07-21T12:10:00Z",
          payload: {
            chat_id: "chat-42",
            from: "@arthur",
            text: "Contrato aprovado, preciso abrir suporte para implantação."
          }
        },
        channel_policy: {
          allowed_channels: ["email", "whatsapp", "telegram", "chat"],
          approved_adapters: ["telegram-bot-api"],
          require_human_authorization: true
        },
        routing_policy: {
          default_queue: "support",
          create_ticket: true
        }
      },
      { contract_id: "crm.support.channel_intake.executor", task_ref: "channel-intake-test" }
    )
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.tenant_id, "demo");
  assert.equal(result.outputs.channel, "telegram");
  assert.equal(result.outputs.provider, "telegram-bot-api");
  assert.equal(result.outputs.intake_state, "authorized");
  assert.equal(result.outputs.ticket_creation_allowed, true);
  assert.equal(result.outputs.workflow_id, "crm.omnichannel.channel_intake");
  assert.equal(result.outputs.next_workflow_id, "crm.ticket.sla");
  assert.equal(result.outputs.mutates_crm_state, false);
  assert.equal(result.outputs.forge_event_sourced, true);

  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_channel_intake"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_channel_receipt"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_message_thread"));
  assert.ok(result.events.some((event) => event.kind === "crm.channel.authorized"));
  assert.ok(result.events.some((event) => event.kind === "crm.message.normalized"));
});

test("omnichannel center executor unifies channel threads and identities without local state", () => {
  assert.equal(typeof runtime.buildOmnichannelCenterResult, "function");

  const result = runtime.buildOmnichannelCenterResult(
    workerRequest(
      "forge_crm.unify_omnichannel_center",
      {
        tenant_context: { tenant_id: "demo" },
        channel_threads: [
          {
            id: "thread-wa-001",
            channel: "whatsapp",
            provider: "whatsapp-cloud",
            customer_ref: "+5511999990000",
            account_id: "account-001",
            subject: "Pedido parado",
            message_count: 3,
            last_message_at: "2026-07-21T11:30:00Z",
            ticket_id: "ticket-001"
          },
          {
            id: "thread-tg-001",
            channel: "telegram",
            provider: "telegram-bot-api",
            customer_ref: "@mara_ops",
            account_id: "account-001",
            subject: "Contrato aprovado",
            message_count: 2,
            last_message_at: "2026-07-21T12:10:00Z"
          },
          {
            id: "thread-email-001",
            channel: "email",
            provider: "smtp",
            customer_ref: "mara@example.com",
            account_id: "account-001",
            subject: "Follow-up implantação",
            message_count: 1,
            last_message_at: "2026-07-21T12:20:00Z"
          }
        ],
        identity_records: [
          {
            account_id: "account-001",
            contact_id: "contact-001",
            channels: ["whatsapp", "telegram", "email"],
            confidence: 0.91
          }
        ],
        routing_policy: {
          default_queue: "support",
          escalation_queue: "support-escalation",
          unify_by: ["account_id", "contact_id"],
          require_approved_intake: true
        }
      },
      { contract_id: "crm.support.omnichannel_center.executor", task_ref: "omnichannel-center-test" }
    )
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.tenant_id, "demo");
  assert.equal(result.outputs.workflow_id, "crm.omnichannel.center");
  assert.equal(result.outputs.center_state, "routing_ready");
  assert.equal(result.outputs.channel_count, 3);
  assert.equal(result.outputs.thread_count, 3);
  assert.equal(result.outputs.unified_conversation_count, 1);
  assert.equal(result.outputs.owner_queue, "support-escalation");
  assert.equal(result.outputs.mutates_crm_state, false);
  assert.equal(result.outputs.forge_event_sourced, true);

  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_omnichannel_center_snapshot"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_unified_conversation"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_channel_identity_map"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_support_queue_snapshot"));
  assert.ok(result.events.some((event) => event.kind === "crm.omnichannel.center_snapshot"));
  assert.ok(result.events.some((event) => event.kind === "crm.conversation.unified"));
  assert.ok(result.events.some((event) => event.kind === "crm.channel.identity_mapped"));
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

test("marketing segment builder executor selects approved audiences as Forge artifacts", () => {
  assert.equal(typeof runtime.buildMarketingSegmentBuilderResult, "function");

  const result = runtime.buildMarketingSegmentBuilderResult(
    workerRequest(
      "forge_crm.build_marketing_segment",
      {
        tenant_context: { tenant_id: "demo" },
        segment_request: {
          id: "segment-enterprise-ops",
          name: "Enterprise operations leaders",
          goal: "Prioritize companies ready for workflow-owned CRM adoption",
          target_personas: ["COO", "Head of Operations"],
          campaign_id: "campaign-001"
        },
        audience_source: {
          leads: [
            { id: "lead-001", company: "Acme Logistics", role: "COO", score: 91, lifecycle_stage: "mql" },
            { id: "lead-002", company: "Beta Transport", role: "Ops Director", score: 84, lifecycle_stage: "sql" },
            { id: "lead-003", company: "Small Retail", role: "Owner", score: 48, lifecycle_stage: "raw" }
          ],
          relationship_profiles: [
            { entity_id: "lead-001", signals: ["enterprise", "operations", "budget_confirmed"] },
            { entity_id: "lead-002", signals: ["operations", "integration_need"] }
          ]
        },
        selection_policy: {
          min_score: 80,
          required_signals: ["operations"],
          max_audience: 25,
          approver_role: "marketing.director"
        }
      },
      { contract_id: "crm.marketing.segment_builder.executor", task_ref: "segment-builder-test" }
    )
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.tenant_id, "demo");
  assert.equal(result.outputs.segment_id, "segment-enterprise-ops");
  assert.equal(result.outputs.workflow_id, "crm.marketing.segment_builder");
  assert.equal(result.outputs.campaign_workflow_id, "crm.campaign.lifecycle");
  assert.equal(result.outputs.audience_count, 2);
  assert.equal(result.outputs.approval_state, "ready_for_approval");
  assert.equal(result.outputs.mutates_crm_state, false);
  assert.equal(result.outputs.forge_event_sourced, true);

  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_segment_definition"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_segment_audience"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_segment"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_automation_plan"));
  assert.ok(result.events.some((event) => event.kind === "crm.segment.defined"));
  assert.ok(result.events.some((event) => event.kind === "crm.segment.audience_selected"));
  assert.ok(result.events.some((event) => event.kind === "crm.segment.ready_for_campaign"));
});

test("marketing form capture executor converts submissions into Forge lead workflows", () => {
  assert.equal(typeof runtime.buildMarketingFormCaptureResult, "function");

  const result = runtime.buildMarketingFormCaptureResult(
    workerRequest(
      "forge_crm.capture_form_submission",
      {
        tenant_context: { tenant_id: "demo" },
        campaign: {
          id: "campaign-001",
          name: "Enterprise operations campaign"
        },
        landing_page: {
          id: "lp-001",
          slug: "enterprise-operations"
        },
        form_submission: {
          id: "submission-001",
          form_id: "form-enterprise-demo",
          submitted_at: "2026-07-20T13:45:00Z",
          fields: {
            email: "ops@example.com",
            company: "Acme Logistics",
            name: "Maria Ops",
            role: "COO",
            budget: "250000",
            pain: "Needs workflow-owned CRM intake"
          }
        },
        consent_policy: {
          consent_given: true,
          lawful_basis: "consent",
          source: "landing_page_form"
        },
        routing_policy: {
          owner: "marketing-ops",
          nurture_sequence_id: "nurture-enterprise-ops",
          classification_required: true
        }
      },
      { contract_id: "crm.marketing.form_capture.executor", task_ref: "form-capture-test" }
    )
  );

  assert.equal(result.schema_version, "forge.addon_executor_result.v1");
  assert.equal(result.status, "completed");
  assert.equal(result.outputs.tenant_id, "demo");
  assert.equal(result.outputs.form_submission_id, "submission-001");
  assert.equal(result.outputs.lead_id, "ops@example.com");
  assert.equal(result.outputs.workflow_id, "crm.campaign.lifecycle");
  assert.equal(result.outputs.lead_workflow_id, "crm.lead.lifecycle");
  assert.equal(result.outputs.nurture_workflow_id, "crm.lead.nurture");
  assert.equal(result.outputs.lead_state, "captured");
  assert.equal(result.outputs.consent_state, "captured");
  assert.equal(result.outputs.mutates_crm_state, false);
  assert.equal(result.outputs.forge_event_sourced, true);

  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_form_submission"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_lead_capture"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_consent_record"));
  assert.ok(result.artifacts.some((artifact) => artifact.kind === "crm_automation_plan"));
  assert.ok(result.events.some((event) => event.kind === "crm.form.submitted"));
  assert.ok(result.events.some((event) => event.kind === "crm.lead.created"));
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
