#!/usr/bin/env node
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const forgeBin = process.env.FORGE_BIN || "forge";
const workerId = "forge-crm-runtime-worker";
const store = path.join(mkdtempSync(path.join(os.tmpdir(), "forge-crm-smoke-")), "forge.sqlite");

function formatArgsForError(args) {
  return args
    .map((arg) => {
      const value = String(arg);
      return value.length > 300 ? `${value.slice(0, 300)}...<truncated ${value.length} chars>` : value;
    })
    .join(" ");
}

function runForge(args) {
  const result = spawnSync(forgeBin, ["--store", store, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  });
  const stdout = typeof result.stdout === "string" ? result.stdout.trim() : "";
  const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
  if (result.status !== 0) {
    throw new Error(
      [
        `forge command failed: ${forgeBin} --store ${store} ${formatArgsForError(args)}`,
        result.error ? `spawn error: ${result.error.message}` : "",
        stderr ? `stderr: ${stderr}` : "",
        stdout ? `stdout: ${stdout}` : ""
      ]
        .filter(Boolean)
        .join("\n")
    );
  }
  return JSON.parse(stdout);
}

function waitForEndpoint(worker) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("timed out waiting for CRM worker endpoint"));
      }
    }, 5000);

    worker.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      const match = text.match(/http:\/\/127\.0\.0\.1:\d+\/runtime\/execute/);
      if (match && !settled) {
        settled = true;
        clearTimeout(timer);
        resolve(match[0]);
      }
    });

    worker.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
    });

    worker.on("exit", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`CRM worker exited before readiness with code ${code}`));
      }
    });
  });
}

const worker = spawn(process.execPath, ["runtime/crm-worker.mjs"], {
  cwd: repoRoot,
  env: { ...process.env, PORT: "0" },
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  const endpoint = await waitForEndpoint(worker);
  const workerData = {
    execution_mode: "external_api",
    endpoint,
    allowed_entrypoints: [
      "forge_crm.plan_system",
      "forge_crm.bootstrap_tenant",
      "forge_crm.operating_snapshot",
      "forge_crm.classify_lead",
      "forge_crm.run_relationship_lifecycle",
      "forge_crm.record_relationship_event",
      "forge_crm.enrich_relationship_profile",
      "forge_crm.move_opportunity_stage",
      "forge_crm.operating_copilot",
      "forge_crm.run_area_copilot",
      "forge_crm.orchestrate_work_queue",
      "forge_crm.run_daily_operating_cycle",
      "forge_crm.govern_approval_queue",
      "forge_crm.export_factory_blueprint",
      "forge_crm.orchestrate_subworkflows",
      "forge_crm.generate_design_system",
      "forge_crm.prepare_memory_promotion",
      "forge_crm.evolve_workflow",
      "forge_crm.design_workflow_automation",
      "forge_crm.trace_workflow_automation",
      "forge_crm.run_enterprise_journey",
      "forge_crm.inspect_observability",
      "forge_crm.generate_executive_report",
      "forge_crm.generate_operating_readiness",
      "forge_crm.generate_strategic_objective_audit",
      "forge_crm.generate_proposal",
      "forge_crm.review_followup_forecast",
      "forge_crm.review_commercial_forecast",
      "forge_crm.settle_goal_commission",
      "forge_crm.manage_account",
      "forge_crm.plan_customer_success",
      "forge_crm.manage_contract_signature",
      "forge_crm.generate_document",
      "forge_crm.validate_document",
      "forge_crm.record_document_approval",
      "forge_crm.manage_document_library",
      "forge_crm.automate_campaign",
      "forge_crm.run_lead_nurture",
      "forge_crm.build_marketing_segment",
      "forge_crm.publish_landing_page",
      "forge_crm.capture_form_submission",
      "forge_crm.normalize_channel_intake",
      "forge_crm.unify_omnichannel_center",
      "forge_crm.ingest_omnichannel_message",
      "forge_crm.compose_support_reply",
      "forge_crm.triage_ticket_sla",
      "forge_crm.plan_project_handoff",
      "forge_crm.record_internal_collaboration",
      "forge_crm.deliver_handoff"
    ],
    allowed_contracts: [
      "crm.factory.planning",
      "crm.tenant.bootstrap.executor",
      "crm.operating.snapshot.executor",
      "crm.lead.classifier.executor",
      "crm.relationship.lifecycle.executor",
      "crm.relationship.timeline.executor",
      "crm.relationship.profile_enrichment.executor",
      "crm.pipeline.stage_move.executor",
      "crm.ai.operating_copilot.executor",
      "crm.ai.area_copilot.executor",
      "crm.queue.orchestrator.executor",
      "crm.operating.daily_cycle.executor",
      "crm.workflow.approval_governance.executor",
      "crm.factory.blueprint_export.executor",
      "crm.workflow.subworkflow_orchestrator.executor",
      "crm.design_system.executor",
      "crm.memory.promotion.executor",
      "crm.workflow.evolution.executor",
      "crm.workflow.automation_designer.executor",
      "crm.workflow.automation_trace.executor",
      "crm.enterprise.journey.executor",
      "crm.observability.inspector.executor",
      "crm.analytics.executive_report.executor",
      "crm.operating.readiness.executor",
      "crm.strategic.objective_audit.executor",
      "crm.proposal.generator.executor",
      "crm.commercial.followup_forecast.executor",
      "crm.commercial.forecast_review.executor",
      "crm.commercial.goal_commission.executor",
      "crm.commercial.account_management.executor",
      "crm.commercial.customer_success_plan.executor",
      "crm.commercial.contract_signature.executor",
      "crm.document.generator.executor",
      "crm.document.validator",
      "crm.document.approval.executor",
      "crm.document.library.executor",
      "crm.marketing.campaign_automation.executor",
      "crm.marketing.lead_nurture.executor",
      "crm.marketing.segment_builder.executor",
      "crm.marketing.landing_page.executor",
      "crm.marketing.form_capture.executor",
      "crm.support.channel_intake.executor",
      "crm.support.omnichannel_center.executor",
      "crm.support.omnichannel_message.executor",
      "crm.support.reply_composer.executor",
      "crm.support.ticket_sla.executor",
      "crm.operations.project_handoff.executor",
      "crm.operations.internal_collaboration.executor",
      "crm.omnichannel.handoff"
    ],
    timeout_seconds: 5,
    max_response_bytes: 1048576
  };

  const authorizations = [
    ["crm.workflow.mutate", "high"],
    ["crm.document.generate", "medium"],
    ["crm.omnichannel.ingest", "medium"],
    ["crm.ai.recommend", "medium"],
    ["crm.observability.inspect", "medium"]
  ].map(([permission, risk]) =>
    runForge([
      "addons",
      "authorize-permission",
      "--addon",
      "forge.addon.crm",
      "--permission",
      permission,
      "--risk",
      risk,
      "--approved-by",
      "forge-crm-smoke",
      "--source",
      "forge-crm-smoke",
      "--output",
      "json"
    ])
  );

  runForge([
    "addons",
    "register-worker",
    "--worker",
    workerId,
    "--runtime",
    "external_api",
    "--trust-level",
    "local",
    "--source",
    "forge-crm-smoke",
    "--data",
    JSON.stringify(workerData),
    "--output",
    "json"
  ]);

  const workflow = runForge([
    "plan",
    "--goal",
    "Operate a workflow-first CRM tenant bootstrap smoke",
    "--output",
    "json"
  ]);
  const workflowId = workflow.workflow_id;

  const planner = runForge([
    "addons",
    "execute-planner",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.factory.planning",
    "--worker",
    workerId,
    "--goal",
    "Create a workflow-first CRM tenant",
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  const bootstrap = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.tenant.bootstrap.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-tenant-bootstrap",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      operator_policy: { approved_by: "forge-crm-smoke", state_owner: "forge" }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  const operatingSnapshot = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.operating.snapshot.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-operating-snapshot",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      operator_surface_policy: { state_owner: "forge", source: "workflow_artifacts_and_events" }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  const copilot = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.ai.operating_copilot.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-operating-copilot",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      opportunities: [
        {
          id: "opp-smoke-priority",
          account: "Example Logistics",
          amount: 180000,
          close_probability: 0.74,
          stage: "negotiation",
          last_activity_days: 4,
          risk_flags: ["contract_review_waiting"]
        }
      ],
      tickets: [{ id: "ticket-smoke-001", severity: "high", sla_minutes_remaining: 25 }],
      documents: [{ id: "proposal-opp-smoke-priority", kind: "crm_proposal", state: "approval_wait" }],
      campaigns: [{ id: "campaign-smoke", state: "scheduled", target_segment: "enterprise" }]
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (copilot.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected copilot promotion, got ${copilot.promotion?.status || "missing"}`);
  }
  if (copilot.executor_result.outputs.priority_opportunity_id !== "opp-smoke-priority") {
    throw new Error(`expected priority opportunity from copilot, got ${copilot.executor_result.outputs.priority_opportunity_id}`);
  }

  const areaCopilot = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.ai.area_copilot.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-area-copilot",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      area_contexts: [
        {
          area: "commercial",
          workflow_id: "crm.opportunity.pipeline",
          objective: "Protect priority opportunity",
          evidence_artifacts: ["crm_forecast_report", "crm_pipeline_board"],
          signals: ["priority deal has stale contract review"]
        },
        {
          area: "support",
          workflow_id: "crm.ticket.sla",
          objective: "Prevent SLA breach",
          evidence_artifacts: ["crm_support_summary"],
          signals: ["critical ticket has 25 minutes remaining"]
        },
        {
          area: "marketing",
          workflow_id: "crm.campaign.lifecycle",
          objective: "Improve lead quality",
          evidence_artifacts: ["crm_campaign", "crm_segment"],
          signals: ["enterprise segment conversion below target"]
        },
        {
          area: "operations",
          workflow_id: "crm.project.handoff",
          objective: "Unblock customer handoff",
          evidence_artifacts: ["crm_project_plan", "crm_task_plan"],
          signals: ["handoff blocked by missing owner"]
        },
        {
          area: "documents",
          workflow_id: "crm.document.approval",
          objective: "Clear approval queue",
          evidence_artifacts: ["crm_document", "crm_approval_record"],
          signals: ["proposal waiting for finance approval"]
        }
      ],
      copilot_policy: {
        mutation_policy: "recommendation_only_until_forge_approval",
        require_evidence_refs: true,
        required_areas: ["commercial", "support", "marketing", "operations", "documents"]
      }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (areaCopilot.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected area copilot promotion, got ${areaCopilot.promotion?.status || "missing"}`);
  }
  if (areaCopilot.executor_result.outputs.ready_area_count !== 5) {
    throw new Error(`expected 5 ready area copilots, got ${areaCopilot.executor_result.outputs.ready_area_count}`);
  }

  const workQueue = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.queue.orchestrator.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-work-queue",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      queue_items: [
        {
          id: "approval-smoke-proposal",
          queue: "approvals",
          workflow_id: "crm.proposal.approval",
          state: "approval_wait",
          owner: "commercial.director",
          artifact_refs: ["crm_proposal:proposal-smoke-001"],
          event_refs: ["crm.document.approval_requested"],
          priority: "high",
          sla_minutes_remaining: 90
        },
        {
          id: "sla-smoke-ticket",
          queue: "sla",
          workflow_id: "crm.ticket.sla",
          state: "sla_escalation",
          owner: "support.lead",
          artifact_refs: ["crm_support_summary:ticket-smoke-001"],
          event_refs: ["crm.sla.escalated"],
          priority: "critical",
          sla_minutes_remaining: 25
        },
        {
          id: "document-smoke-rework",
          queue: "documents",
          workflow_id: "crm.document.approval",
          state: "rework_required",
          artifact_refs: ["crm_document:doc-smoke-rework"],
          event_refs: ["crm.document.rework_required"],
          priority: "medium"
        },
        {
          id: "campaign-smoke-approval",
          queue: "campaigns",
          workflow_id: "crm.campaign.lifecycle",
          state: "approval_wait",
          owner: "marketing.ops",
          artifact_refs: ["crm_campaign:campaign-smoke"],
          event_refs: ["crm.campaign.created"],
          priority: "medium"
        },
        {
          id: "handoff-smoke-blocked",
          queue: "handoffs",
          workflow_id: "crm.project.handoff",
          state: "blocked_wait",
          owner: "delivery.ops",
          artifact_refs: ["crm_project_plan:project-smoke"],
          event_refs: ["crm.task.blocked"],
          priority: "high"
        },
        {
          id: "renewal-smoke-wait",
          queue: "blocked_waits",
          workflow_id: "crm.contract.signature",
          state: "renewal_wait",
          owner: "legal.ops",
          artifact_refs: ["crm_renewal_plan:contract-smoke"],
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
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (workQueue.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected work queue promotion, got ${workQueue.promotion?.status || "missing"}`);
  }
  if (workQueue.executor_result.outputs.queue_count !== 6) {
    throw new Error(`expected 6 work queue modes, got ${workQueue.executor_result.outputs.queue_count}`);
  }
  if (workQueue.executor_result.outputs.risk_item_count < 3) {
    throw new Error(`expected work queue risk items, got ${workQueue.executor_result.outputs.risk_item_count}`);
  }

  const dailyOperatingCycle = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.operating.daily_cycle.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-daily-operating-cycle",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      business_day: "2026-06-14",
      operating_inputs: {
        pipeline: [
          {
            id: "opp-smoke-renewal",
            account: "Northstar Retail",
            amount: 540000,
            probability: 0.78,
            stage: "negotiation",
            priority: "high",
            next_action_id: "crm.manage-contract-signature"
          }
        ],
        support: [
          {
            id: "ticket-smoke-001",
            account: "Northstar Retail",
            priority: "p1",
            sla_status: "at_risk",
            minutes_to_breach: 25,
            next_action_id: "crm.triage-ticket-sla"
          }
        ],
        documents: [
          {
            id: "doc-smoke-proposal",
            state: "approval_wait",
            owner: "commercial.director",
            next_action_id: "crm.record-document-approval"
          }
        ],
        marketing: [
          {
            id: "campaign-smoke",
            state: "approval_wait",
            launch_window: "week_33",
            next_action_id: "crm.automate-campaign"
          }
        ],
        handoffs: [
          {
            id: "handoff-smoke-blocked",
            state: "blocked_wait",
            owner: "delivery.ops",
            next_action_id: "crm.plan-project-handoff"
          }
        ]
      },
      operating_policy: {
        commander: "ops.commander",
        approval_required: true,
        risk_threshold_minutes: 60
      }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (dailyOperatingCycle.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected daily operating cycle promotion, got ${dailyOperatingCycle.promotion?.status || "missing"}`);
  }
  if (dailyOperatingCycle.executor_result.outputs.domain_count !== 5) {
    throw new Error(`expected 5 daily operating domains, got ${dailyOperatingCycle.executor_result.outputs.domain_count}`);
  }
  if (dailyOperatingCycle.executor_result.outputs.command_item_count < 5) {
    throw new Error(
      `expected at least 5 daily operating commands, got ${dailyOperatingCycle.executor_result.outputs.command_item_count}`
    );
  }
  if (dailyOperatingCycle.executor_result.outputs.risk_count < 2) {
    throw new Error(`expected daily operating risks, got ${dailyOperatingCycle.executor_result.outputs.risk_count}`);
  }

  const approvalGovernance = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.workflow.approval_governance.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-approval-governance",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      approval_queue: [
        {
          id: "approval-smoke-proposal",
          workflow_id: "crm.document.approval",
          task_ref: "approve-proposal-smoke",
          artifact_type: "crm_document_approval",
          artifact_ref: "forge://artifact/crm_approval_record/proposal-smoke",
          required_permission: "crm.document.generate",
          approval_state: "approval_wait",
          decision: { state: "approved", approver: "forge-crm-smoke", reason: "document lineage attached" }
        },
        {
          id: "approval-smoke-reply",
          workflow_id: "crm.omnichannel.reply",
          task_ref: "reply-thread-smoke",
          artifact_type: "crm_support_reply",
          artifact_ref: "forge://artifact/crm_reply_draft/thread-smoke",
          required_permission: "crm.omnichannel.ingest",
          approval_state: "approval_wait",
          decision: { state: "rework_required", approver: "forge-crm-smoke", reason: "missing escalation context" }
        }
      ],
      permission_gates: [
        { permission: "crm.document.generate", status: "authorized" },
        { permission: "crm.omnichannel.ingest", status: "authorized" }
      ],
      decision_policy: {
        require_rework_reason: true,
        promote_events: true
      }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (approvalGovernance.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(
      `expected approval governance promotion, got ${approvalGovernance.promotion?.status || "missing"}`
    );
  }
  if (approvalGovernance.executor_result.outputs.approved_count !== 1) {
    throw new Error(`expected one approved governance item, got ${approvalGovernance.executor_result.outputs.approved_count}`);
  }
  if (approvalGovernance.executor_result.outputs.rework_count !== 1) {
    throw new Error(`expected one rework governance item, got ${approvalGovernance.executor_result.outputs.rework_count}`);
  }

  const subworkflowOrchestration = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.workflow.subworkflow_orchestrator.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-subworkflow-orchestration",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      parent_workflow: {
        id: "crm.enterprise.customer_journey",
        run_id: "run-smoke-journey",
        goal: "Operate Example Logistics through Forge CRM child workflows"
      },
      subworkflow_bindings: [
        {
          id: "subflow-smoke-pipeline",
          workflow_id: "crm.opportunity.pipeline",
          task_id: "stage-negotiation",
          validation_gate: "stage change has forecast artifact",
          artifact_refs: ["crm_pipeline_board:pipeline-smoke"],
          event_refs: ["crm.opportunity.stage_changed"]
        },
        {
          id: "subflow-smoke-document",
          workflow_id: "crm.document.approval",
          task_id: "approve-proposal",
          validation_gate: "document approval artifact is attached",
          artifact_refs: ["crm_approval_record:approval-smoke"],
          event_refs: ["crm.document.approved"]
        },
        {
          id: "subflow-smoke-support",
          workflow_id: "crm.ticket.sla",
          task_id: "triage-sla",
          validation_gate: "SLA event is promoted",
          artifact_refs: ["crm_support_summary:ticket-smoke-001"],
          event_refs: ["crm.sla.escalated"]
        },
        {
          id: "subflow-smoke-handoff",
          workflow_id: "crm.project.handoff",
          task_id: "handoff-delivery",
          validation_gate: "handoff owner is assigned",
          artifact_refs: ["crm_project_plan:project-smoke"],
          event_refs: ["crm.project.handoff_requested"]
        }
      ],
      handoff_policy: {
        promote_parent_only_after_children_validated: true,
        require_lineage_hash: true,
        owner: "forge"
      }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (subworkflowOrchestration.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(
      `expected subworkflow orchestration promotion, got ${subworkflowOrchestration.promotion?.status || "missing"}`
    );
  }
  if (subworkflowOrchestration.executor_result.outputs.orchestration_state !== "validation_ready") {
    throw new Error(
      `expected subworkflow orchestration validation_ready, got ${subworkflowOrchestration.executor_result.outputs.orchestration_state}`
    );
  }
  if (subworkflowOrchestration.executor_result.outputs.validated_subworkflow_count !== 4) {
    throw new Error(
      `expected 4 validated subworkflows, got ${subworkflowOrchestration.executor_result.outputs.validated_subworkflow_count}`
    );
  }

  const designSystem = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.design_system.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-design-system",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
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
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (designSystem.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected design system promotion, got ${designSystem.promotion?.status || "missing"}`);
  }
  if (designSystem.executor_result.outputs.component_count !== 5) {
    throw new Error(`expected 5 design system components, got ${designSystem.executor_result.outputs.component_count}`);
  }
  if (designSystem.executor_result.outputs.direct_browser_persistence !== false) {
    throw new Error("expected design system to avoid browser-local persistence");
  }

  const memoryPromotion = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.memory.promotion.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-memory-promotion",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke", organization_id: "smoke-org" },
      workflow_id: "crm.ai.copilot.recommendation",
      source_memory: {
        scope: "processing",
        source_path: ".forge/runs/smoke/customer-signal.md",
        audience: "private",
        summary: "Critical SLA alerts should outrank renewal nudges."
      },
      curated_knowledge: {
        summary: "Prioritize critical SLA alerts ahead of renewal nudges while account support tickets remain open.",
        source_refs: ["ticket-smoke-001", "account-smoke"],
        evidence: ["critical SLA", "renewal workflow active"]
      },
      promotion_policy: {
        to_scope: "organization",
        memory_level: "standard",
        visibility: "internal",
        shareability: "organization_shared",
        approved_by: "forge-crm-smoke",
        reason: "Reusable CRM support and renewal policy"
      }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (memoryPromotion.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected memory promotion preparation, got ${memoryPromotion.promotion?.status || "missing"}`);
  }
  if (memoryPromotion.executor_result.outputs.core_promotion_owner !== "forge.memory.promote") {
    throw new Error(`expected Forge memory promotion owner, got ${memoryPromotion.executor_result.outputs.core_promotion_owner}`);
  }

  const observabilityInspection = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.observability.inspector.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-observability-inspection",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      workflow_state: {
        workflow_id: "crm.opportunity.pipeline",
        status: "running",
        revision: 3,
        waiting_states: ["approval_wait"]
      },
      event_timeline: [
        { id: "evt-smoke-stage", kind: "crm.opportunity.stage_changed", sequence: 1 },
        { id: "evt-smoke-forecast", kind: "crm.forecast.updated", sequence: 2 }
      ],
      artifact_lineage: [
        {
          artifact_id: "pipeline-forecast-opp-smoke-priority",
          kind: "crm_forecast_report",
          produced_by: "crm.pipeline.stage_move.executor",
          source_event_ids: ["evt-smoke-forecast"]
        }
      ],
      cost_entries: [
        { runtime_contract_id: "crm.pipeline.stage_move.executor", amount_usd: 0.38 },
        { runtime_contract_id: "crm.ai.operating_copilot.executor", amount_usd: 1.12 }
      ],
      metric_samples: [
        { name: "cycle_time_minutes", value: 42 },
        { name: "approval_wait_count", value: 1 }
      ],
      log_entries: [
        { level: "info", message: "pipeline state inspected" },
        { level: "warn", message: "approval wait still open" }
      ]
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (observabilityInspection.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected observability inspection promotion, got ${observabilityInspection.promotion?.status || "missing"}`);
  }
  if (observabilityInspection.executor_result.outputs.cost_total_usd !== 1.5) {
    throw new Error(`expected observability cost total 1.5, got ${observabilityInspection.executor_result.outputs.cost_total_usd}`);
  }

  const executiveReporting = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.analytics.executive_report.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-executive-reporting",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      operating_snapshot: {
        workflow_count: 29,
        surface_count: 10,
        state_owner: "forge_workflow_runtime",
        external_database_required: false
      },
      workflow_metrics: {
        workflow_count: 29,
        approval_wait_count: 4,
        blocked_wait_count: 1,
        promoted_artifact_count: observabilityInspection.promotion?.artifact_count ?? 0
      },
      commercial_metrics: {
        pipeline_value: 820000,
        forecast_amount: 615000,
        recognized_revenue_amount: 300000,
        attainment_percent: 84
      },
      support_metrics: {
        open_ticket_count: 18,
        sla_at_risk_count: 3,
        breached_sla_count: 1
      },
      marketing_metrics: {
        active_campaign_count: 4,
        qualified_lead_count: 52,
        form_conversion_rate: 0.19
      },
      risk_register: [
        {
          id: "risk-sla",
          severity: "high",
          workflow_id: "crm.ticket.sla",
          summary: "Three SLA items are at risk",
          owner: "support.lead"
        },
        {
          id: "risk-approval-wait",
          severity: "medium",
          workflow_id: "crm.work.queue.orchestration",
          summary: "Approval waits are delaying executive readiness",
          owner: "ops.commander"
        }
      ]
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (executiveReporting.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected executive reporting promotion, got ${executiveReporting.promotion?.status || "missing"}`);
  }
  if (executiveReporting.executor_result.outputs.workflow_id !== "crm.executive.reporting") {
    throw new Error(`expected executive reporting workflow, got ${executiveReporting.executor_result.outputs.workflow_id}`);
  }
  if (executiveReporting.executor_result.outputs.local_analytics_state !== false) {
    throw new Error("expected executive reporting to avoid CRM-local analytics state");
  }
  if (executiveReporting.executor_result.outputs.kpi_count < 8) {
    throw new Error(`expected at least 8 executive KPIs, got ${executiveReporting.executor_result.outputs.kpi_count}`);
  }

  const workflowEvolution = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.workflow.evolution.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-workflow-evolution",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      workflow_state: {
        workflow_id: "crm.ticket.sla",
        current_version: "0.1.0",
        status: "running",
        bottlenecks: ["manual SLA owner routing", "repeated escalation rework"]
      },
      observability_report: {
        audit_event_count: observabilityInspection.executor_result.outputs.audit_event_count,
        cost_total_usd: observabilityInspection.executor_result.outputs.cost_total_usd,
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
          changelog: "Route SLA ownership through a deterministic Forge event policy using channel and account tier signals.",
          rollback_plan: "restore previous SLA owner routing event policy"
        }
      ],
      benchmark_policy: {
        required_metric: "sla_breach_count",
        acceptance_threshold: 3,
        validation_command:
          "forge improve benchmark-event-policy --workflow crm.ticket.sla --policy sla-owner-routing-policy --output json",
        approved_by: "forge-crm-smoke"
      }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (workflowEvolution.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected workflow evolution promotion, got ${workflowEvolution.promotion?.status || "missing"}`);
  }
  if (workflowEvolution.executor_result.outputs.evolution_state !== "benchmark_wait") {
    throw new Error(`expected workflow evolution benchmark_wait, got ${workflowEvolution.executor_result.outputs.evolution_state}`);
  }
  if (workflowEvolution.executor_result.outputs.promotion_allowed !== false) {
    throw new Error("expected workflow evolution promotion to stay blocked until benchmark evidence exists");
  }

  const workflowAutomationDesign = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.workflow.automation_designer.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-workflow-automation-design",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      automation_goal: {
        id: "auto-hot-lead-sla",
        title: "Route hot leads and SLA escalations through Forge-owned CRM workflows",
        owner: "ops.commander"
      },
      trigger_sources: [
        {
          id: "lead-created",
          event_type: "crm.lead.created",
          workflow_id: "crm.lead.lifecycle"
        },
        {
          id: "sla-escalated",
          event_type: "crm.sla.escalated",
          workflow_id: "crm.ticket.sla"
        },
        {
          id: "business-day-forecast",
          schedule: "0 9 * * 1-5",
          workflow_id: "crm.commercial.followup_forecast"
        }
      ],
      rule_graph: {
        conditions: [
          {
            id: "enterprise-hot-lead",
            expression: "lead.score >= 80 && account.tier == 'enterprise'",
            evidence_artifact_type: "crm_relationship_profile"
          },
          {
            id: "sla-risk",
            expression: "ticket.sla_minutes_remaining <= 60",
            evidence_artifact_type: "crm_support_summary"
          }
        ],
        actions: [
          {
            id: "queue-risk",
            contract_id: "crm.queue.orchestrator.executor",
            workflow_id: "crm.work.queue.orchestration",
            permission: "crm.workflow.mutate"
          },
          {
            id: "forecast-followup",
            contract_id: "crm.commercial.followup_forecast.executor",
            workflow_id: "crm.commercial.followup_forecast",
            permission: "crm.workflow.mutate"
          },
          {
            id: "support-sla",
            contract_id: "crm.support.ticket_sla.executor",
            workflow_id: "crm.ticket.sla",
            permission: "crm.workflow.mutate"
          }
        ]
      },
      validation_policy: {
        require_human_approval_before_activation: true,
        require_dry_run: true,
        required_evidence_artifacts: [
          "crm_workflow_automation_spec",
          "crm_trigger_condition_map",
          "crm_automation_validation_report"
        ]
      }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (workflowAutomationDesign.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(
      `expected workflow automation design promotion, got ${workflowAutomationDesign.promotion?.status || "missing"}`
    );
  }
  if (workflowAutomationDesign.executor_result.outputs.automation_state !== "validation_ready") {
    throw new Error(
      `expected workflow automation design validation_ready, got ${workflowAutomationDesign.executor_result.outputs.automation_state}`
    );
  }
  if (workflowAutomationDesign.executor_result.outputs.trigger_count !== 3) {
    throw new Error(
      `expected 3 workflow automation triggers, got ${workflowAutomationDesign.executor_result.outputs.trigger_count}`
    );
  }
  if (workflowAutomationDesign.executor_result.outputs.action_count !== 3) {
    throw new Error(
      `expected 3 workflow automation actions, got ${workflowAutomationDesign.executor_result.outputs.action_count}`
    );
  }
  if (workflowAutomationDesign.executor_result.outputs.activation_allowed !== false) {
    throw new Error("expected workflow automation activation to stay blocked before approval and dry-run evidence");
  }

  const workflowAutomationTrace = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.workflow.automation_trace.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-workflow-automation-trace",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      automation_spec: {
        automation_id: "auto-hot-lead-sla",
        workflow_id: "crm.workflow.automation_execution",
        source_design_workflow_id: "crm.workflow.automation_design",
        trigger_sources: [
          {
            id: "lead-created",
            event_type: "crm.lead.created",
            workflow_id: "crm.lead.lifecycle"
          }
        ],
        actions: [
          {
            id: "queue-risk",
            contract_id: "crm.queue.orchestrator.executor",
            workflow_id: "crm.work.queue.orchestration",
            permission: "crm.workflow.mutate"
          },
          {
            id: "forecast-followup",
            contract_id: "crm.commercial.followup_forecast.executor",
            workflow_id: "crm.commercial.followup_forecast",
            permission: "crm.workflow.mutate"
          },
          {
            id: "support-sla",
            contract_id: "crm.support.ticket_sla.executor",
            workflow_id: "crm.ticket.sla",
            permission: "crm.workflow.mutate"
          }
        ]
      },
      trigger_event: {
        kind: "crm.lead.created",
        workflow_id: "crm.lead.lifecycle",
        event_id: "evt-smoke-lead-created",
        payload: {
          lead_id: "lead-smoke-001",
          score: 92
        }
      },
      condition_evidence: [
        {
          id: "enterprise-hot-lead",
          expression: "lead.score >= 80 && account.tier == 'enterprise'",
          passed: true,
          artifact_ref: "forge://artifact/crm_relationship_profile/lead-smoke-001"
        }
      ],
      activation_policy: {
        approved_design: true,
        dry_run_completed: true,
        require_forge_dispatch: true,
        approved_by: "forge-crm-smoke"
      }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (workflowAutomationTrace.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(
      `expected workflow automation trace promotion, got ${workflowAutomationTrace.promotion?.status || "missing"}`
    );
  }
  if (workflowAutomationTrace.executor_result.outputs.dispatch_state !== "forge_dispatch_ready") {
    throw new Error(
      `expected workflow automation trace forge_dispatch_ready, got ${workflowAutomationTrace.executor_result.outputs.dispatch_state}`
    );
  }
  if (workflowAutomationTrace.executor_result.outputs.action_dispatch_count !== 3) {
    throw new Error(
      `expected 3 workflow automation action dispatches, got ${workflowAutomationTrace.executor_result.outputs.action_dispatch_count}`
    );
  }
  if (workflowAutomationTrace.executor_result.outputs.local_execution_allowed !== false) {
    throw new Error("expected workflow automation trace to block local execution");
  }

  const workflowPackArtifact = bootstrap.executor_result.artifacts.find((artifact) => artifact.kind === "crm_workflow_pack");
  const operatingSnapshotArtifact = operatingSnapshot.executor_result.artifacts.find((artifact) => artifact.kind === "crm_operating_snapshot");
  const workflowPackForBlueprint = {
    core_gap_policy: workflowPackArtifact?.data?.core_gap_policy,
    workflows: (workflowPackArtifact?.data?.workflows || []).map((workflow) => ({
      id: workflow.id,
      title: workflow.title,
      domain: workflow.domain,
      workflow_extension_id: workflow.workflow_extension_id,
      runtime_contracts: workflow.runtime_contracts,
      artifacts: workflow.artifacts,
      events: workflow.events,
      validation_gates: workflow.validation_gates,
      views: workflow.views
    }))
  };
  const operatingSnapshotForBlueprint = {
    surfaces: Object.values(operatingSnapshotArtifact?.data?.operator_surfaces || {}).map((surface) => ({
      id: surface.view_id,
      workflow_ids: surface.workflow_ids
    }))
  };
  const factoryBlueprint = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.factory.blueprint_export.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-factory-blueprint",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      workflow_pack: workflowPackForBlueprint,
      operating_snapshot: operatingSnapshotForBlueprint,
      core_gap_policy: {
        repository: "forge-core",
        categories: ["durable_workflows", "approvals", "artifact_lineage", "observability"]
      }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (factoryBlueprint.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected factory blueprint promotion, got ${factoryBlueprint.promotion?.status || "missing"}`);
  }
  if (factoryBlueprint.executor_result.outputs.portability_state !== "ready_for_reuse") {
    throw new Error(
      `expected factory blueprint ready_for_reuse, got ${factoryBlueprint.executor_result.outputs.portability_state}`
    );
  }

  const operatingReadiness = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.operating.readiness.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-operating-readiness",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      operating_snapshot: {
        external_database_required: operatingSnapshotArtifact?.data?.external_database_required ?? false,
        direct_browser_persistence: operatingSnapshotArtifact?.data?.direct_browser_persistence ?? false
      },
      validation_evidence: {
        commands: ["npm test", "forge addons validate", "forge runtime smoke"],
        workflow_artifact_count: observabilityInspection.promotion?.artifact_count ?? 0,
        runtime_contract_count: workflowPackArtifact?.data?.summary?.runtime_contract_count,
        workflow_count: workflowPackArtifact?.data?.summary?.workflow_count,
        complete_scope: workflowPackArtifact?.data?.summary?.complete_scope
      },
      success_criteria: {
        goal: "Operate a complete enterprise CRM through Forge workflows",
        required_deliverables: [
          "relationship workspace",
          "commercial command center",
          "support inbox",
          "omnichannel conversation threads",
          "marketing automation",
          "workflow automation designer",
          "workflow-system factory blueprint",
          "goal and commission settlement",
          "executive reporting",
          "daily operating cycle",
          "document approvals",
          "project handoff"
        ]
      }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (operatingReadiness.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected operating readiness promotion, got ${operatingReadiness.promotion?.status || "missing"}`);
  }
  if (operatingReadiness.executor_result.outputs.success_criteria_status !== "operable_with_evidence") {
    throw new Error(
      `expected operating readiness to be operable_with_evidence, got ${operatingReadiness.executor_result.outputs.success_criteria_status}`
    );
  }

  const strategicObjectiveAudit = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.strategic.objective_audit.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-strategic-objective-audit",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      objective_contract: {
        objective: "Forge CRM is a complete enterprise CRM and Forge public Addon reference",
        required_support_channels: ["chat", "email", "telegram", "whatsapp"]
      },
      evidence_policy: {
        evidence_sources: ["manifest", "workflow_pack", "runtime_contracts", "web_snapshot", "strategic_audit"],
        route_core_gaps_to: "forge-core"
      }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (strategicObjectiveAudit.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(
      `expected strategic objective audit promotion, got ${strategicObjectiveAudit.promotion?.status || "missing"}`
    );
  }
  if (strategicObjectiveAudit.executor_result.outputs.missing_requirement_count !== 0) {
    throw new Error(
      `expected zero strategic audit gaps, got ${strategicObjectiveAudit.executor_result.outputs.missing_requirement_count}`
    );
  }

  const relationshipLifecycle = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.relationship.lifecycle.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-relationship-lifecycle",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      lead: {
        id: "lead-smoke-001",
        name: "Smoke Contact",
        email: "smoke@example.com",
        role: "COO",
        budget: 180000,
        company_size: 240,
        timeline: "this quarter",
        source: "inbound demo",
        pain: "Needs audited sales and support workflows connected to operations."
      },
      contact: {
        id: "contact-smoke",
        name: "Smoke Contact",
        email: "smoke@example.com",
        company_id: "company-smoke"
      },
      company: {
        id: "company-smoke",
        name: "Example Logistics",
        industry: "logistics"
      },
      opportunity: {
        id: "opp-smoke-priority",
        amount: 180000,
        funnel_id: "enterprise",
        stage: "discovery"
      },
      lifecycle_policy: {
        require_approval_before_conversion: true,
        next_workflows: ["crm.relationship.profile_enrichment", "crm.opportunity.pipeline", "crm.followup.forecast"]
      }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (relationshipLifecycle.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(
      `expected relationship lifecycle promotion, got ${relationshipLifecycle.promotion?.status || "missing"}`
    );
  }
  if (relationshipLifecycle.executor_result.outputs.lifecycle_state !== "qualified_waiting_approval") {
    throw new Error(
      `expected relationship lifecycle qualified_waiting_approval, got ${relationshipLifecycle.executor_result.outputs.lifecycle_state}`
    );
  }

  const relationshipProfileEnrichment = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.relationship.profile_enrichment.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-relationship-profile-enrichment",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      entity_profile: {
        id: "contact-smoke",
        kind: "contact",
        name: "Smoke Contact",
        title: "COO",
        company_id: "company-smoke",
        company_name: "Example Logistics",
        lifecycle_stage: "enrichment_wait"
      },
      enrichment_sources: [
        { id: "smoke-form", kind: "form_submission", confidence: 0.84, fields: ["email", "company_name", "role"] },
        { id: "smoke-call", kind: "sales_call", confidence: 0.76, fields: ["pain", "decision_process"] }
      ],
      relationship_signals: [
        { kind: "decision_authority", strength: "high", evidence: "COO owns operations budget" },
        { kind: "expansion_potential", strength: "medium", evidence: "multi-region logistics operation" }
      ],
      timeline_event: {
        kind: "profile_enriched",
        owner: "forge-crm-smoke",
        reason: "smoke enrichment profile package"
      }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (relationshipProfileEnrichment.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(
      `expected relationship profile enrichment promotion, got ${relationshipProfileEnrichment.promotion?.status || "missing"}`
    );
  }
  if (relationshipProfileEnrichment.executor_result.outputs.enrichment_state !== "ready_for_approval") {
    throw new Error(
      `expected relationship profile enrichment ready_for_approval, got ${relationshipProfileEnrichment.executor_result.outputs.enrichment_state}`
    );
  }

  const relationshipTimeline = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.relationship.timeline.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-relationship-timeline",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      entity: {
        id: "opp-smoke-priority",
        kind: "opportunity",
        account: "Example Logistics",
        company_id: "company-smoke",
        contact_ids: ["contact-smoke"]
      },
      relationships: [
        { from: "company-smoke", to: "contact-smoke", relation: "employs" },
        { from: "company-smoke", to: "opp-smoke-priority", relation: "owns_opportunity" }
      ],
      timeline_event: {
        kind: "stage_changed",
        from_stage: "discovery",
        to_stage: "proposal",
        reason: "approved offer terms attached",
        owner: "forge-crm-smoke"
      },
      pipeline: {
        funnel_id: "enterprise",
        from_stage: "discovery",
        to_stage: "proposal",
        amount: 180000,
        probability: 0.74
      }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (relationshipTimeline.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected relationship timeline promotion, got ${relationshipTimeline.promotion?.status || "missing"}`);
  }
  if (relationshipTimeline.executor_result.outputs.pipeline_stage !== "proposal") {
    throw new Error(`expected relationship timeline pipeline stage proposal, got ${relationshipTimeline.executor_result.outputs.pipeline_stage}`);
  }

  const pipelineStageMove = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.pipeline.stage_move.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-pipeline-stage-move",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      opportunity: {
        id: "opp-smoke-priority",
        account: "Example Logistics",
        amount: 180000,
        owner: "forge-crm-smoke"
      },
      pipeline_move: {
        funnel_id: "enterprise",
        from_stage: "proposal",
        to_stage: "negotiation",
        reason: "proposal artifact approved",
        owner: "forge-crm-smoke"
      },
      board_context: {
        lanes: ["research", "discovery", "proposal", "negotiation", "won", "lost"],
        wip_limits: { negotiation: 10 }
      },
      forecast_policy: {
        probability: 0.74,
        period: "2026-Q3"
      }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (pipelineStageMove.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected pipeline stage move promotion, got ${pipelineStageMove.promotion?.status || "missing"}`);
  }
  if (pipelineStageMove.executor_result.outputs.to_stage !== "negotiation") {
    throw new Error(`expected pipeline stage negotiation, got ${pipelineStageMove.executor_result.outputs.to_stage}`);
  }

  const commercialFollowupForecast = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.commercial.followup_forecast.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-commercial-followup-forecast",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      opportunity: {
        id: "opp-smoke-priority",
        account: "Example Logistics",
        owner: "forge-crm-smoke",
        stage: "negotiation",
        amount: 180000,
        probability: 0.74
      },
      followup_policy: {
        due_at: "2026-07-02T14:00:00Z",
        channel: "email",
        sequence_id: "enterprise-followup"
      },
      forecast_policy: {
        period: "2026-Q3",
        goal_amount: 250000
      },
      commission_policy: {
        rate: 0.08,
        eligible_stage: "negotiation"
      }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (commercialFollowupForecast.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected commercial follow-up forecast promotion, got ${commercialFollowupForecast.promotion?.status || "missing"}`);
  }
  if (commercialFollowupForecast.executor_result.outputs.followup_state !== "waiting_due_date") {
    throw new Error(`expected commercial follow-up wait state, got ${commercialFollowupForecast.executor_result.outputs.followup_state}`);
  }

  const commercialForecastReview = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.commercial.forecast_review.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-commercial-forecast-review",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      forecast_period: {
        id: "2026-Q3",
        currency: "USD",
        review_owner: "revenue.ops"
      },
      pipeline_snapshot: {
        opportunities: [
          { id: "opp-smoke-priority", account: "Example Logistics", amount: 180000, probability: 0.74, stage: "negotiation" },
          { id: "opp-smoke-expansion", account: "Example Retail", amount: 120000, probability: 0.45, stage: "proposal" }
        ]
      },
      goal_targets: [{ id: "goal-enterprise-new-arr", owner: "forge-crm-smoke", target_amount: 250000 }],
      risk_policy: {
        risk_threshold_percent: 80,
        stale_stage_days: 14
      }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (commercialForecastReview.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected commercial forecast review promotion, got ${commercialForecastReview.promotion?.status || "missing"}`);
  }
  if (commercialForecastReview.executor_result.outputs.followup_delivery_allowed !== false) {
    throw new Error("expected forecast review to keep follow-up delivery blocked");
  }

  const goalCommissionSettlement = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.commercial.goal_commission.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-goal-commission",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      period_context: {
        period: "2026-Q3",
        currency: "USD",
        owner: "commercial.ops"
      },
      goal_targets: [
        {
          id: "goal-enterprise-new-arr",
          owner: "forge-crm-smoke",
          target_amount: 250000,
          weight: 0.7
        },
        {
          id: "goal-expansion-arr",
          owner: "forge-crm-smoke",
          target_amount: 100000,
          weight: 0.3
        }
      ],
      revenue_events: [
        {
          id: "rev-contract-smoke",
          account: "Example Logistics",
          owner: "forge-crm-smoke",
          amount: 180000,
          goal_id: "goal-enterprise-new-arr",
          contract_artifact_ref: "crm_contract:contract-smoke",
          signature_event_ref: "crm.contract.signed"
        },
        {
          id: "rev-expansion-smoke",
          account: "Atlas Foods",
          owner: "forge-crm-smoke",
          amount: 70000,
          goal_id: "goal-expansion-arr",
          contract_artifact_ref: "crm_contract:contract-expansion-smoke",
          signature_event_ref: "crm.contract.signed"
        }
      ],
      commission_policy: {
        base_rate: 0.08,
        accelerator_rate: 0.12,
        accelerator_threshold_percent: 100,
        require_finance_approval_before_payout: true
      }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (goalCommissionSettlement.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected goal commission promotion, got ${goalCommissionSettlement.promotion?.status || "missing"}`);
  }
  if (goalCommissionSettlement.executor_result.outputs.workflow_id !== "crm.goal.commission") {
    throw new Error(`expected goal commission workflow, got ${goalCommissionSettlement.executor_result.outputs.workflow_id}`);
  }
  if (goalCommissionSettlement.executor_result.outputs.payout_allowed !== false) {
    throw new Error("expected goal commission payout to stay blocked before finance approval");
  }

  const accountManagement = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.commercial.account_management.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-account-management",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      account: {
        id: "account-smoke",
        name: "Example Logistics",
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
          id: "expansion-smoke",
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
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (accountManagement.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected account management promotion, got ${accountManagement.promotion?.status || "missing"}`);
  }
  if (accountManagement.executor_result.outputs.next_state !== "success_plan_active") {
    throw new Error(`expected account management success_plan_active, got ${accountManagement.executor_result.outputs.next_state}`);
  }

  const customerSuccessPlan = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.commercial.customer_success_plan.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-customer-success",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      account: {
        id: "account-smoke",
        name: "Example Logistics",
        owner: "success-manager",
        lifecycle_stage: "active_customer",
        arr: 180000
      },
      adoption_signals: {
        active_users_percent: 62,
        onboarding_completion_percent: 80,
        feature_depth_percent: 55,
        open_success_milestones: [{ id: "milestone-integrations", status: "blocked" }]
      },
      renewal_context: {
        renewal_at: "2026-10-01T00:00:00Z",
        renewal_probability: 0.68,
        open_critical_tickets: 1
      },
      expansion_context: {
        opportunities: [
          {
            id: "expansion-success-smoke",
            title: "Operations team rollout",
            amount: 60000,
            probability: 0.65
          }
        ]
      },
      success_playbook: {
        objective: "Drive adoption before renewal",
        owner: "success-manager",
        milestones: ["unblock integrations", "run executive business review"],
        required_actions: ["schedule QBR", "attach adoption report", "open renewal risk review"]
      }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (customerSuccessPlan.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected customer success promotion, got ${customerSuccessPlan.promotion?.status || "missing"}`);
  }
  if (customerSuccessPlan.executor_result.outputs.workflow_id !== "crm.customer_success.plan") {
    throw new Error(`expected customer success workflow, got ${customerSuccessPlan.executor_result.outputs.workflow_id}`);
  }
  if (customerSuccessPlan.executor_result.outputs.renewal_risk_state !== "watch") {
    throw new Error(`expected customer success renewal risk watch, got ${customerSuccessPlan.executor_result.outputs.renewal_risk_state}`);
  }

  const contractSignature = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.commercial.contract_signature.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-contract-signature",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      contract: {
        id: "contract-smoke",
        account: "Example Logistics",
        opportunity_id: "opp-smoke-priority",
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
        receipt_id: "sig-smoke"
      },
      renewal_policy: {
        renewal_at: "2027-07-10T00:00:00Z",
        reminder_days_before: 60,
        owner: "account-owner"
      }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (contractSignature.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected contract signature promotion, got ${contractSignature.promotion?.status || "missing"}`);
  }
  if (contractSignature.executor_result.outputs.contract_state !== "signed") {
    throw new Error(`expected signed contract state, got ${contractSignature.executor_result.outputs.contract_state}`);
  }

  const documentGenerator = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.document.generator.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-document-generation",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      workflow_id: "crm.campaign.lifecycle",
      document_kind: "campaign_asset_pack",
      subject: { id: "campaign-smoke", account: "Example Logistics" },
      requested_artifacts: ["crm_contract", "crm_campaign", "crm_email", "crm_landing_page", "crm_report", "crm_presentation"],
      brief: {
        goal: "Generate a Forge-gated campaign pack",
        audience: "Operations leaders"
      }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (documentGenerator.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected document generator promotion, got ${documentGenerator.promotion?.status || "missing"}`);
  }
  if (documentGenerator.executor_result.outputs.external_delivery_allowed !== false) {
    throw new Error("expected generated documents to block external delivery before approval");
  }

  const documentApproval = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.document.approval.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-document-approval",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      document: {
        id: documentGenerator.executor_result.outputs.document_id,
        kind: "crm_campaign",
        title: "Smoke campaign pack",
        workflow_id: "crm.document.approval",
        artifact_id: documentGenerator.executor_result.outputs.document_id
      },
      approval_decision: {
        decision: "approved",
        approver: "forge-crm-smoke",
        reason: "smoke document pack approved"
      },
      validation_report: {
        decision: "passed",
        issues: []
      },
      delivery_policy: {
        external_delivery_requested: true,
        channel: "email"
      }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (documentApproval.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected document approval promotion, got ${documentApproval.promotion?.status || "missing"}`);
  }
  if (documentApproval.executor_result.outputs.external_delivery_allowed !== true) {
    throw new Error("expected document approval to unblock external delivery");
  }

  const documentLibrary = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.document.library.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-document-library",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      document_request: {
        id: "doc-smoke-campaign-pack",
        title: "Smoke campaign pack library record",
        workflow_id: "crm.document.library",
        collection_id: "collection-smoke-campaigns",
        requested_by: "forge-crm-smoke"
      },
      file_record: {
        id: "file-smoke-campaign-pack",
        artifact_id: documentGenerator.executor_result.outputs.document_id,
        document_id: documentGenerator.executor_result.outputs.document_id,
        kind: "crm_campaign",
        filename: "smoke-campaign-pack-v2.json",
        checksum: "sha256:smoke-campaign-pack",
        approval_state: documentApproval.executor_result.outputs.approval_state
      },
      version_policy: {
        current_version: 1,
        next_version: 2,
        promotion_requires_approval: true,
        approver_role: "forge-crm-smoke"
      },
      approval_decision: {
        decision: "approval_wait",
        approver: "forge-crm-smoke",
        reason: "smoke version waits for final promotion"
      }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (documentLibrary.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected document library promotion, got ${documentLibrary.promotion?.status || "missing"}`);
  }
  if (documentLibrary.executor_result.outputs.version_state !== "approval_wait") {
    throw new Error(`expected document library approval_wait, got ${documentLibrary.executor_result.outputs.version_state}`);
  }

  const marketingSegment = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.marketing.segment_builder.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-marketing-segment",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      segment_request: {
        id: "segment-smoke-enterprise",
        name: "Enterprise operations leaders",
        goal: "Create enterprise pipeline",
        target_personas: ["COO", "Head of Operations"],
        campaign_id: "campaign-smoke"
      },
      audience_source: {
        leads: [
          { id: "lead-smoke-001", company: "Example Logistics", role: "COO", score: 92, lifecycle_stage: "mql" },
          { id: "lead-smoke-002", company: "Atlas Foods", role: "Head of Operations", score: 86, lifecycle_stage: "sql" },
          { id: "lead-smoke-003", company: "Small Retail", role: "Owner", score: 42, lifecycle_stage: "raw" }
        ],
        relationship_profiles: [
          { entity_id: "lead-smoke-001", signals: ["enterprise", "operations", "budget_confirmed"] },
          { entity_id: "lead-smoke-002", signals: ["operations", "integration_need"] }
        ]
      },
      selection_policy: {
        min_score: 80,
        required_signals: ["operations"],
        max_audience: 25,
        approver_role: "marketing.director"
      }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (marketingSegment.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected marketing segment promotion, got ${marketingSegment.promotion?.status || "missing"}`);
  }
  if (marketingSegment.executor_result.outputs.approval_state !== "ready_for_approval") {
    throw new Error(`expected marketing segment ready_for_approval, got ${marketingSegment.executor_result.outputs.approval_state}`);
  }

  const marketingAutomation = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.marketing.campaign_automation.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-marketing-automation",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      campaign: {
        id: "campaign-smoke",
        name: "Workflow CRM launch",
        goal: "Create enterprise pipeline",
        channels: ["email", "landing_page", "telegram"],
        scheduled_at: "2026-07-01T13:00:00Z"
      },
      segment: {
        id: "segment-smoke-enterprise",
        name: "Enterprise operations leaders",
        criteria: { company_size_min: 500, roles: ["COO", "Head of Operations"] },
        lead_ids: ["lead-smoke-001", "lead-smoke-002", "lead-smoke-003"]
      },
      assets: [
        { id: "email-smoke", kind: "crm_email", approval_state: "approved" },
        { id: "landing-smoke", kind: "crm_landing_page", approval_state: "approved" }
      ],
      nurture_policy: {
        sequence_id: "nurture-smoke-enterprise",
        wait_minutes: 1440,
        max_steps: 3
      }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (marketingAutomation.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected marketing automation promotion, got ${marketingAutomation.promotion?.status || "missing"}`);
  }
  if (marketingAutomation.executor_result.outputs.scheduled_state !== "scheduled") {
    throw new Error(`expected marketing automation scheduled state, got ${marketingAutomation.executor_result.outputs.scheduled_state}`);
  }

  const marketingLeadNurture = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.marketing.lead_nurture.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-lead-nurture",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      lead_profile: {
        id: "lead-smoke-001",
        company: "Example Logistics",
        email: "ops@example.test",
        lifecycle_stage: "mql",
        score: 72
      },
      segment: {
        id: "segment-smoke-enterprise",
        name: "Enterprise operations leaders"
      },
      nurture_policy: {
        sequence_id: "nurture-smoke-enterprise",
        current_step: 2,
        max_steps: 4,
        wait_minutes: 1440,
        channel: "email",
        consent_state: "approved"
      },
      engagement_history: [
        { kind: "email_opened", occurred_at: "2026-07-02T14:05:00Z" },
        { kind: "link_clicked", occurred_at: "2026-07-03T10:10:00Z" }
      ]
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (marketingLeadNurture.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected lead nurture promotion, got ${marketingLeadNurture.promotion?.status || "missing"}`);
  }
  if (marketingLeadNurture.executor_result.outputs.external_send_allowed !== false) {
    throw new Error("expected lead nurture external send to remain blocked");
  }

  const marketingLandingPage = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.marketing.landing_page.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-landing-page",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      campaign: {
        id: "campaign-smoke",
        name: "Workflow CRM launch",
        owner: "marketing.ops"
      },
      landing_page: {
        id: "landing-smoke",
        slug: "workflow-crm-launch",
        headline: "Operate your CRM through Forge workflows",
        sections: ["problem", "proof", "workflow_cta"]
      },
      form_schema: {
        id: "form-smoke-enterprise-demo",
        required_fields: ["email", "company", "role"],
        optional_fields: ["budget", "pain"],
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
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (marketingLandingPage.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected landing page promotion, got ${marketingLandingPage.promotion?.status || "missing"}`);
  }
  if (marketingLandingPage.executor_result.outputs.publication_state !== "approval_wait") {
    throw new Error(`expected landing page approval_wait state, got ${marketingLandingPage.executor_result.outputs.publication_state}`);
  }
  if (marketingLandingPage.executor_result.outputs.external_publication_allowed !== false) {
    throw new Error("expected landing page external publication to stay blocked before approval");
  }

  const marketingFormCapture = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.marketing.form_capture.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-form-capture",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      campaign: {
        id: "campaign-smoke",
        name: "Workflow CRM launch"
      },
      landing_page: {
        id: "landing-smoke",
        slug: "workflow-crm-launch"
      },
      form_submission: {
        id: "submission-smoke",
        form_id: "form-smoke-enterprise-demo",
        submitted_at: "2026-07-03T14:30:00Z",
        fields: {
          email: "ops@example.com",
          company: "Example Logistics",
          name: "Operations Lead",
          role: "COO",
          budget: "250000",
          pain: "Needs Forge-owned CRM intake"
        }
      },
      consent_policy: {
        consent_given: true,
        lawful_basis: "consent",
        source: "landing_page_form"
      },
      routing_policy: {
        owner: "marketing-ops",
        nurture_sequence_id: "nurture-smoke-enterprise",
        classification_required: true
      }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (marketingFormCapture.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected marketing form capture promotion, got ${marketingFormCapture.promotion?.status || "missing"}`);
  }
  if (marketingFormCapture.executor_result.outputs.lead_state !== "captured") {
    throw new Error(`expected marketing form capture lead state captured, got ${marketingFormCapture.executor_result.outputs.lead_state}`);
  }

  const channelIntake = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.support.channel_intake.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-channel-intake",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      channel: "telegram",
      provider_event: {
        id: "tg-smoke-001",
        provider: "telegram-bot-api",
        received_at: "2026-07-04T11:20:00Z",
        payload: {
          chat_id: "chat-smoke",
          from: "@opslead",
          text: "Operations are blocked and need support."
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
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (channelIntake.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected channel intake promotion, got ${channelIntake.promotion?.status || "missing"}`);
  }
  if (channelIntake.executor_result.outputs.intake_state !== "authorized") {
    throw new Error(`expected channel intake authorized state, got ${channelIntake.executor_result.outputs.intake_state}`);
  }
  if (channelIntake.executor_result.outputs.ticket_creation_allowed !== true) {
    throw new Error("expected channel intake to allow ticket creation for approved adapter");
  }

  const omnichannelIngestion = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.support.omnichannel_message.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-omnichannel-ingestion",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      channel: "whatsapp",
      adapter_event: {
        id: "wa-smoke-001",
        provider: "whatsapp-cloud",
        received_at: "2026-07-04T11:30:00Z"
      },
      message: {
        id: "msg-smoke-omni-001",
        from: "+15551234567",
        text: "Operations are blocked and need support.",
        subject: "Operations blocked"
      },
      customer: {
        id: "customer-smoke",
        name: "Example Logistics",
        account_id: "account-smoke"
      },
      routing_policy: {
        default_queue: "support",
        create_ticket: true,
        priority_keywords: ["blocked"]
      }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (omnichannelIngestion.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected omnichannel ingestion promotion, got ${omnichannelIngestion.promotion?.status || "missing"}`);
  }
  if (omnichannelIngestion.executor_result.outputs.ticket_state !== "received") {
    throw new Error(`expected omnichannel ingestion ticket_state received, got ${omnichannelIngestion.executor_result.outputs.ticket_state}`);
  }
  if (omnichannelIngestion.executor_result.outputs.workflow_id !== "crm.omnichannel.message") {
    throw new Error(`expected omnichannel ingestion workflow crm.omnichannel.message, got ${omnichannelIngestion.executor_result.outputs.workflow_id}`);
  }
  if (omnichannelIngestion.executor_result.outputs.ticket_workflow_id !== "crm.ticket.sla") {
    throw new Error(`expected omnichannel ingestion ticket workflow crm.ticket.sla, got ${omnichannelIngestion.executor_result.outputs.ticket_workflow_id}`);
  }

  const omnichannelCenter = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.support.omnichannel_center.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-omnichannel-center",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      channel_threads: [
        {
          id: "thread-smoke-whatsapp",
          channel: "whatsapp",
          provider: "whatsapp-cloud",
          customer_ref: "+15551234567",
          account_id: "account-smoke",
          subject: "Operations blocked",
          message_count: 2,
          last_message_at: "2026-07-04T11:30:00Z",
          ticket_id: "ticket-smoke-001"
        },
        {
          id: "thread-smoke-telegram",
          channel: "telegram",
          provider: "telegram-bot-api",
          customer_ref: "@opslead",
          account_id: "account-smoke",
          subject: "Support escalation",
          message_count: 1,
          last_message_at: "2026-07-04T11:35:00Z"
        },
        {
          id: "thread-smoke-email",
          channel: "email",
          provider: "smtp",
          customer_ref: "ops@example.test",
          account_id: "account-smoke",
          subject: "Follow-up operations blocked",
          message_count: 1,
          last_message_at: "2026-07-04T11:40:00Z"
        }
      ],
      identity_records: [
        {
          account_id: "account-smoke",
          contact_id: "contact-smoke",
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
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (omnichannelCenter.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected omnichannel center promotion, got ${omnichannelCenter.promotion?.status || "missing"}`);
  }
  if (omnichannelCenter.executor_result.outputs.center_state !== "routing_ready") {
    throw new Error(`expected omnichannel center routing_ready, got ${omnichannelCenter.executor_result.outputs.center_state}`);
  }
  if (omnichannelCenter.executor_result.outputs.unified_conversation_count !== 1) {
    throw new Error(
      `expected one unified conversation, got ${omnichannelCenter.executor_result.outputs.unified_conversation_count}`
    );
  }

  const supportReply = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.support.reply_composer.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-support-reply",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      conversation_thread: {
        id: "thread-smoke-whatsapp",
        channel: "whatsapp",
        customer: "Example Logistics",
        subject: "Operations blocked",
        latest_message: "Operations are blocked and need support.",
        message_ids: ["msg-smoke-omni-001"]
      },
      ticket_context: {
        id: "ticket-smoke-001",
        priority: "critical",
        sla_status: "at_risk",
        owner_queue: "support-escalation"
      },
      channel_context: {
        allowed_channels: ["chat", "whatsapp", "telegram", "email"],
        preferred_channel: "whatsapp",
        adapter_authorized: true
      },
      reply_policy: {
        tone: "clear and accountable",
        requires_human_approval: true,
        suggested_next_step: "confirm escalation owner and share recovery ETA",
        approver_role: "support.lead"
      }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (supportReply.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected support reply promotion, got ${supportReply.promotion?.status || "missing"}`);
  }
  if (supportReply.executor_result.outputs.workflow_id !== "crm.omnichannel.reply") {
    throw new Error(`expected support reply workflow crm.omnichannel.reply, got ${supportReply.executor_result.outputs.workflow_id}`);
  }
  if (supportReply.executor_result.outputs.external_send_allowed !== false) {
    throw new Error("expected support reply external_send_allowed false");
  }

  const ticketSla = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.support.ticket_sla.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-ticket-sla",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      ticket: {
        id: "ticket-smoke-001",
        account: "Example Logistics",
        channel: "email",
        severity: "critical",
        subject: "Operations blocked",
        status: "received"
      },
      messages: [{ id: "msg-smoke-001", channel: "email", from: "ops@example.test", text: "Operations are blocked." }],
      sla_policy: { first_response_minutes: 30, resolution_minutes: 240, elapsed_minutes: 45 },
      routing_policy: { default_queue: "support", escalation_queue: "support-escalation" }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (ticketSla.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected ticket SLA promotion, got ${ticketSla.promotion?.status || "missing"}`);
  }
  if (ticketSla.executor_result.outputs.sla_state !== "sla_escalation") {
    throw new Error(`expected ticket SLA escalation, got ${ticketSla.executor_result.outputs.sla_state}`);
  }

  const operationsProjectHandoff = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.operations.project_handoff.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-project-handoff",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      handoff_context: {
        id: "handoff-smoke",
        source_workflow_id: "crm.contract.signature",
        account: "Example Logistics",
        owner: "delivery-lead",
        accepted_by: "delivery-director"
      },
      project: {
        id: "project-smoke",
        name: "Example Logistics onboarding",
        goal: "Activate workflow-first CRM operations",
        due_at: "2026-08-01T12:00:00Z"
      },
      tasks: [
        { id: "task-smoke-kickoff", title: "Run kickoff", owner: "delivery-lead", status: "ready" },
        {
          id: "task-smoke-integration",
          title: "Connect channels",
          owner: "ops-engineer",
          status: "blocked",
          blocker: "Awaiting WhatsApp policy approval"
        }
      ],
      acceptance_policy: {
        criteria: ["project artifact attached", "owner visible", "blocked reason explicit"],
        requires_acceptance: true
      }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (operationsProjectHandoff.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(
      `expected operations project handoff promotion, got ${operationsProjectHandoff.promotion?.status || "missing"}`
    );
  }
  if (operationsProjectHandoff.executor_result.outputs.next_state !== "blocked_wait") {
    throw new Error(`expected project handoff blocked_wait, got ${operationsProjectHandoff.executor_result.outputs.next_state}`);
  }

  const internalCollaboration = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.operations.internal_collaboration.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-internal-collaboration",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      collaboration_context: {
        id: "collab-smoke-renewal-risk",
        title: "Example Logistics renewal risk review",
        source_workflow_id: "crm.customer_success.plan",
        owner: "success-manager"
      },
      participants: [
        { id: "success-manager", role: "customer_success" },
        { id: "support-lead", role: "support" },
        { id: "sales-director", role: "commercial" }
      ],
      notes: [
        {
          id: "note-smoke-renewal",
          body: "Customer needs integration unblock before renewal committee.",
          author: "success-manager"
        }
      ],
      decisions: [
        {
          id: "decision-smoke-escalate",
          summary: "Escalate integration blocker into the operating queue.",
          owner: "support-lead"
        }
      ],
      mentions: [
        {
          target: "ops-engineer",
          reason: "Need WhatsApp adapter policy review",
          workflow_id: "crm.project.handoff"
        }
      ],
      followups: [
        {
          id: "task-smoke-integration-policy",
          title: "Review WhatsApp adapter policy",
          owner: "ops-engineer",
          due_at: "2026-07-18T12:00:00Z"
        }
      ]
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (internalCollaboration.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(
      `expected internal collaboration promotion, got ${internalCollaboration.promotion?.status || "missing"}`
    );
  }
  if (internalCollaboration.executor_result.outputs.next_state !== "collaboration_active") {
    throw new Error(`expected internal collaboration active state, got ${internalCollaboration.executor_result.outputs.next_state}`);
  }

  const enterpriseJourney = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.enterprise.journey.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-enterprise-journey",
    "--workflow",
    workflowId,
    "--input",
    JSON.stringify({
      tenant_context: { id: "smoke", tenant_id: "smoke" },
      journey_context: {
        id: "journey-smoke-example-logistics",
        account: "Example Logistics",
        goal: "Operate the full lead-to-support customer lifecycle on Forge CRM"
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
        approved_by: "forge-crm-smoke"
      }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  if (enterpriseJourney.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected enterprise journey promotion, got ${enterpriseJourney.promotion?.status || "missing"}`);
  }
  if (enterpriseJourney.executor_result.outputs.acceptance_status !== "operable_end_to_end") {
    throw new Error(`expected enterprise journey operable_end_to_end, got ${enterpriseJourney.executor_result.outputs.acceptance_status}`);
  }
  if (enterpriseJourney.executor_result.outputs.main_flow_dependency_external !== false) {
    throw new Error("expected enterprise journey to avoid external main-flow dependency");
  }

  const workflowArtifacts = runForge([
    "artifacts",
    "--workflow",
    workflowId,
    "--output",
    "json"
  ]);
  const workflowEvents = runForge([
    "events",
    "list",
    "--workflow",
    workflowId,
    "--output",
    "json"
  ]);
  const promotedArtifactCount = bootstrap.promotion?.artifact_count ?? 0;
  const promotedEventCount = bootstrap.promotion?.event_count ?? 0;
  const snapshotPromotedArtifactCount = operatingSnapshot.promotion?.artifact_count ?? 0;
  const snapshotPromotedEventCount = operatingSnapshot.promotion?.event_count ?? 0;
  const copilotPromotedArtifactCount = copilot.promotion?.artifact_count ?? 0;
  const copilotPromotedEventCount = copilot.promotion?.event_count ?? 0;
  const areaCopilotPromotedArtifactCount = areaCopilot.promotion?.artifact_count ?? 0;
  const areaCopilotPromotedEventCount = areaCopilot.promotion?.event_count ?? 0;
  const workQueuePromotedArtifactCount = workQueue.promotion?.artifact_count ?? 0;
  const workQueuePromotedEventCount = workQueue.promotion?.event_count ?? 0;
  const dailyOperatingCyclePromotedArtifactCount = dailyOperatingCycle.promotion?.artifact_count ?? 0;
  const dailyOperatingCyclePromotedEventCount = dailyOperatingCycle.promotion?.event_count ?? 0;
  const approvalGovernancePromotedArtifactCount = approvalGovernance.promotion?.artifact_count ?? 0;
  const approvalGovernancePromotedEventCount = approvalGovernance.promotion?.event_count ?? 0;
  const factoryBlueprintPromotedArtifactCount = factoryBlueprint.promotion?.artifact_count ?? 0;
  const factoryBlueprintPromotedEventCount = factoryBlueprint.promotion?.event_count ?? 0;
  const subworkflowPromotedArtifactCount = subworkflowOrchestration.promotion?.artifact_count ?? 0;
  const subworkflowPromotedEventCount = subworkflowOrchestration.promotion?.event_count ?? 0;
  const designSystemPromotedArtifactCount = designSystem.promotion?.artifact_count ?? 0;
  const designSystemPromotedEventCount = designSystem.promotion?.event_count ?? 0;
  const memoryPromotedArtifactCount = memoryPromotion.promotion?.artifact_count ?? 0;
  const memoryPromotedEventCount = memoryPromotion.promotion?.event_count ?? 0;
  const observabilityPromotedArtifactCount = observabilityInspection.promotion?.artifact_count ?? 0;
  const observabilityPromotedEventCount = observabilityInspection.promotion?.event_count ?? 0;
  const executiveReportingPromotedArtifactCount = executiveReporting.promotion?.artifact_count ?? 0;
  const executiveReportingPromotedEventCount = executiveReporting.promotion?.event_count ?? 0;
  const workflowEvolutionPromotedArtifactCount = workflowEvolution.promotion?.artifact_count ?? 0;
  const workflowEvolutionPromotedEventCount = workflowEvolution.promotion?.event_count ?? 0;
  const workflowAutomationDesignPromotedArtifactCount = workflowAutomationDesign.promotion?.artifact_count ?? 0;
  const workflowAutomationDesignPromotedEventCount = workflowAutomationDesign.promotion?.event_count ?? 0;
  const workflowAutomationTracePromotedArtifactCount = workflowAutomationTrace.promotion?.artifact_count ?? 0;
  const workflowAutomationTracePromotedEventCount = workflowAutomationTrace.promotion?.event_count ?? 0;
  const readinessPromotedArtifactCount = operatingReadiness.promotion?.artifact_count ?? 0;
  const readinessPromotedEventCount = operatingReadiness.promotion?.event_count ?? 0;
  const strategicAuditPromotedArtifactCount = strategicObjectiveAudit.promotion?.artifact_count ?? 0;
  const strategicAuditPromotedEventCount = strategicObjectiveAudit.promotion?.event_count ?? 0;
  const relationshipLifecyclePromotedArtifactCount = relationshipLifecycle.promotion?.artifact_count ?? 0;
  const relationshipLifecyclePromotedEventCount = relationshipLifecycle.promotion?.event_count ?? 0;
  const relationshipProfilePromotedArtifactCount = relationshipProfileEnrichment.promotion?.artifact_count ?? 0;
  const relationshipProfilePromotedEventCount = relationshipProfileEnrichment.promotion?.event_count ?? 0;
  const relationshipPromotedArtifactCount = relationshipTimeline.promotion?.artifact_count ?? 0;
  const relationshipPromotedEventCount = relationshipTimeline.promotion?.event_count ?? 0;
  const pipelinePromotedArtifactCount = pipelineStageMove.promotion?.artifact_count ?? 0;
  const pipelinePromotedEventCount = pipelineStageMove.promotion?.event_count ?? 0;
  const commercialPromotedArtifactCount = commercialFollowupForecast.promotion?.artifact_count ?? 0;
  const commercialPromotedEventCount = commercialFollowupForecast.promotion?.event_count ?? 0;
  const commercialForecastReviewPromotedArtifactCount = commercialForecastReview.promotion?.artifact_count ?? 0;
  const commercialForecastReviewPromotedEventCount = commercialForecastReview.promotion?.event_count ?? 0;
  const goalCommissionPromotedArtifactCount = goalCommissionSettlement.promotion?.artifact_count ?? 0;
  const goalCommissionPromotedEventCount = goalCommissionSettlement.promotion?.event_count ?? 0;
  const accountPromotedArtifactCount = accountManagement.promotion?.artifact_count ?? 0;
  const accountPromotedEventCount = accountManagement.promotion?.event_count ?? 0;
  const customerSuccessPromotedArtifactCount = customerSuccessPlan.promotion?.artifact_count ?? 0;
  const customerSuccessPromotedEventCount = customerSuccessPlan.promotion?.event_count ?? 0;
  const contractSignaturePromotedArtifactCount = contractSignature.promotion?.artifact_count ?? 0;
  const contractSignaturePromotedEventCount = contractSignature.promotion?.event_count ?? 0;
  const documentPromotedArtifactCount = documentGenerator.promotion?.artifact_count ?? 0;
  const documentPromotedEventCount = documentGenerator.promotion?.event_count ?? 0;
  const documentApprovalPromotedArtifactCount = documentApproval.promotion?.artifact_count ?? 0;
  const documentApprovalPromotedEventCount = documentApproval.promotion?.event_count ?? 0;
  const documentLibraryPromotedArtifactCount = documentLibrary.promotion?.artifact_count ?? 0;
  const documentLibraryPromotedEventCount = documentLibrary.promotion?.event_count ?? 0;
  const marketingSegmentPromotedArtifactCount = marketingSegment.promotion?.artifact_count ?? 0;
  const marketingSegmentPromotedEventCount = marketingSegment.promotion?.event_count ?? 0;
  const marketingPromotedArtifactCount = marketingAutomation.promotion?.artifact_count ?? 0;
  const marketingPromotedEventCount = marketingAutomation.promotion?.event_count ?? 0;
  const marketingLeadNurturePromotedArtifactCount = marketingLeadNurture.promotion?.artifact_count ?? 0;
  const marketingLeadNurturePromotedEventCount = marketingLeadNurture.promotion?.event_count ?? 0;
  const landingPagePromotedArtifactCount = marketingLandingPage.promotion?.artifact_count ?? 0;
  const landingPagePromotedEventCount = marketingLandingPage.promotion?.event_count ?? 0;
  const marketingFormPromotedArtifactCount = marketingFormCapture.promotion?.artifact_count ?? 0;
  const marketingFormPromotedEventCount = marketingFormCapture.promotion?.event_count ?? 0;
  const channelIntakePromotedArtifactCount = channelIntake.promotion?.artifact_count ?? 0;
  const channelIntakePromotedEventCount = channelIntake.promotion?.event_count ?? 0;
  const omnichannelIngestionPromotedArtifactCount = omnichannelIngestion.promotion?.artifact_count ?? 0;
  const omnichannelIngestionPromotedEventCount = omnichannelIngestion.promotion?.event_count ?? 0;
  const omnichannelCenterPromotedArtifactCount = omnichannelCenter.promotion?.artifact_count ?? 0;
  const omnichannelCenterPromotedEventCount = omnichannelCenter.promotion?.event_count ?? 0;
  const supportReplyPromotedArtifactCount = supportReply.promotion?.artifact_count ?? 0;
  const supportReplyPromotedEventCount = supportReply.promotion?.event_count ?? 0;
  const ticketSlaPromotedArtifactCount = ticketSla.promotion?.artifact_count ?? 0;
  const ticketSlaPromotedEventCount = ticketSla.promotion?.event_count ?? 0;
  const operationsPromotedArtifactCount = operationsProjectHandoff.promotion?.artifact_count ?? 0;
  const operationsPromotedEventCount = operationsProjectHandoff.promotion?.event_count ?? 0;
  const internalCollaborationPromotedArtifactCount = internalCollaboration.promotion?.artifact_count ?? 0;
  const internalCollaborationPromotedEventCount = internalCollaboration.promotion?.event_count ?? 0;
  const enterpriseJourneyPromotedArtifactCount = enterpriseJourney.promotion?.artifact_count ?? 0;
  const enterpriseJourneyPromotedEventCount = enterpriseJourney.promotion?.event_count ?? 0;
  const workflowArtifactCount = workflowArtifacts.artifacts?.length ?? 0;
  const workflowEventKinds = (workflowEvents.events || []).map((event) => event.kind);

  if (bootstrap.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected bootstrap promotion, got ${bootstrap.promotion?.status || "missing"}`);
  }
  if (promotedArtifactCount < 2 || workflowArtifactCount < promotedArtifactCount) {
    throw new Error(
      `expected promoted bootstrap artifacts in workflow, got promoted=${promotedArtifactCount} workflow=${workflowArtifactCount}`
    );
  }
  if (promotedEventCount < 1 || !workflowEventKinds.includes("crm.tenant.bootstrap_generated")) {
    throw new Error(
      `expected promoted bootstrap event in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`
    );
  }
  if (operatingSnapshot.promotion?.status !== "addon_executor_result_promoted") {
    throw new Error(`expected operating snapshot promotion, got ${operatingSnapshot.promotion?.status || "missing"}`);
  }
  if (snapshotPromotedArtifactCount < 1 || snapshotPromotedEventCount < 1) {
    throw new Error(
      `expected promoted operating snapshot artifact/event, got artifacts=${snapshotPromotedArtifactCount} events=${snapshotPromotedEventCount}`
    );
  }
  if (!workflowEventKinds.includes("crm.operating.snapshot_generated")) {
    throw new Error(
      `expected operating snapshot event in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`
    );
  }
  if (copilotPromotedArtifactCount < 3 || copilotPromotedEventCount < 1) {
    throw new Error(
      `expected promoted copilot artifacts/events, got artifacts=${copilotPromotedArtifactCount} events=${copilotPromotedEventCount}`
    );
  }
  if (!workflowEventKinds.includes("crm.ai.operating_copilot_generated")) {
    throw new Error(`expected operating copilot event in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
  }
  if (areaCopilotPromotedArtifactCount < 3 || areaCopilotPromotedEventCount < 2) {
    throw new Error(
      `expected promoted area copilot artifacts/events, got artifacts=${areaCopilotPromotedArtifactCount} events=${areaCopilotPromotedEventCount}`
    );
  }
  if (!workflowEventKinds.includes("crm.ai.area_copilot_generated")) {
    throw new Error(`expected area copilot event in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
  }
  if (workQueuePromotedArtifactCount < 3 || workQueuePromotedEventCount < 3) {
    throw new Error(
      `expected promoted work queue artifacts/events, got artifacts=${workQueuePromotedArtifactCount} events=${workQueuePromotedEventCount}`
    );
  }
  for (const eventKind of ["crm.queue.snapshot_generated", "crm.queue.assignment_planned", "crm.queue.risk_flagged"]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (dailyOperatingCyclePromotedArtifactCount < 3 || dailyOperatingCyclePromotedEventCount < 3) {
    throw new Error(
      `expected promoted daily operating cycle artifacts/events, got artifacts=${dailyOperatingCyclePromotedArtifactCount} events=${dailyOperatingCyclePromotedEventCount}`
    );
  }
  for (const eventKind of [
    "crm.operating.daily_cycle_generated",
    "crm.operating.command_brief_generated",
    "crm.operating.risk_registered"
  ]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (approvalGovernancePromotedArtifactCount < 4 || approvalGovernancePromotedEventCount < 5) {
    throw new Error(
      `expected promoted approval governance artifacts/events, got artifacts=${approvalGovernancePromotedArtifactCount} events=${approvalGovernancePromotedEventCount}`
    );
  }
  for (const eventKind of [
    "crm.approval.queue_inspected",
    "crm.approval.permission_gate_checked",
    "crm.approval.decision_recorded",
    "crm.approval.rework_returned",
    "crm.approval.event_promoted"
  ]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (factoryBlueprintPromotedArtifactCount < 3 || factoryBlueprintPromotedEventCount < 3) {
    throw new Error(
      `expected promoted factory blueprint artifacts/events, got artifacts=${factoryBlueprintPromotedArtifactCount} events=${factoryBlueprintPromotedEventCount}`
    );
  }
  for (const eventKind of [
    "crm.factory.blueprint_exported",
    "crm.factory.module_mapped",
    "crm.factory.core_gap_reviewed"
  ]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (subworkflowPromotedArtifactCount < 3 || subworkflowPromotedEventCount < 3) {
    throw new Error(
      `expected promoted subworkflow artifacts/events, got artifacts=${subworkflowPromotedArtifactCount} events=${subworkflowPromotedEventCount}`
    );
  }
  for (const eventKind of ["crm.subworkflow.bound", "crm.subworkflow.validated", "crm.subworkflow.promoted"]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (designSystemPromotedArtifactCount < 3 || designSystemPromotedEventCount < 2) {
    throw new Error(
      `expected promoted design system artifacts/events, got artifacts=${designSystemPromotedArtifactCount} events=${designSystemPromotedEventCount}`
    );
  }
  for (const eventKind of ["crm.design.system_generated", "crm.design.tokens_published"]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (memoryPromotedArtifactCount < 2 || memoryPromotedEventCount < 2) {
    throw new Error(
      `expected promoted memory governance artifacts/events, got artifacts=${memoryPromotedArtifactCount} events=${memoryPromotedEventCount}`
    );
  }
  for (const eventKind of ["crm.memory.knowledge_curated", "crm.memory.promotion_requested"]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (observabilityPromotedArtifactCount < 4 || observabilityPromotedEventCount < 4) {
    throw new Error(
      `expected promoted observability artifacts/events, got artifacts=${observabilityPromotedArtifactCount} events=${observabilityPromotedEventCount}`
    );
  }
  for (const eventKind of [
    "crm.observability.inspected",
    "crm.audit.reported",
    "crm.cost.reviewed",
    "crm.metric.reviewed"
  ]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (executiveReportingPromotedArtifactCount < 3 || executiveReportingPromotedEventCount < 3) {
    throw new Error(
      `expected promoted executive reporting artifacts/events, got artifacts=${executiveReportingPromotedArtifactCount} events=${executiveReportingPromotedEventCount}`
    );
  }
  for (const eventKind of ["crm.executive.summary_generated", "crm.kpi.dashboard_generated", "crm.risk.reviewed"]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (workflowEvolutionPromotedArtifactCount < 5 || workflowEvolutionPromotedEventCount < 4) {
    throw new Error(
      `expected promoted workflow evolution artifacts/events, got artifacts=${workflowEvolutionPromotedArtifactCount} events=${workflowEvolutionPromotedEventCount}`
    );
  }
  for (const eventKind of [
    "crm.evolution.candidate_generated",
    "crm.evolution.experiment_designed",
    "crm.evolution.benchmark_reported",
    "crm.evolution.promotion_decision_recorded"
  ]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (workflowAutomationDesignPromotedArtifactCount < 3 || workflowAutomationDesignPromotedEventCount < 3) {
    throw new Error(
      `expected promoted workflow automation design artifacts/events, got artifacts=${workflowAutomationDesignPromotedArtifactCount} events=${workflowAutomationDesignPromotedEventCount}`
    );
  }
  for (const eventKind of ["crm.automation.designed", "crm.automation.validated", "crm.automation.queued"]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (workflowAutomationTracePromotedArtifactCount < 3 || workflowAutomationTracePromotedEventCount < 3) {
    throw new Error(
      `expected promoted workflow automation trace artifacts/events, got artifacts=${workflowAutomationTracePromotedArtifactCount} events=${workflowAutomationTracePromotedEventCount}`
    );
  }
  for (const eventKind of [
    "crm.automation.trigger_received",
    "crm.automation.condition_evaluated",
    "crm.automation.action_dispatched"
  ]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (readinessPromotedArtifactCount < 4 || readinessPromotedEventCount < 2) {
    throw new Error(
      `expected promoted readiness artifacts/events, got artifacts=${readinessPromotedArtifactCount} events=${readinessPromotedEventCount}`
    );
  }
  for (const eventKind of ["crm.operating.readiness_reported", "crm.outcome.deliverables_mapped"]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (strategicAuditPromotedArtifactCount < 3 || strategicAuditPromotedEventCount < 3) {
    throw new Error(
      `expected promoted strategic audit artifacts/events, got artifacts=${strategicAuditPromotedArtifactCount} events=${strategicAuditPromotedEventCount}`
    );
  }
  for (const eventKind of [
    "crm.strategic.objective_audited",
    "crm.requirement.coverage_reported",
    "crm.support.channel_coverage_reported"
  ]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (relationshipLifecyclePromotedArtifactCount < 4 || relationshipLifecyclePromotedEventCount < 4) {
    throw new Error(
      `expected promoted relationship lifecycle artifacts/events, got artifacts=${relationshipLifecyclePromotedArtifactCount} events=${relationshipLifecyclePromotedEventCount}`
    );
  }
  for (const eventKind of [
    "crm.lead.created",
    "crm.relationship.lifecycle_packaged",
    "crm.relationship.recorded",
    "crm.lead.classified"
  ]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (relationshipProfilePromotedArtifactCount < 3 || relationshipProfilePromotedEventCount < 2) {
    throw new Error(
      `expected promoted relationship profile artifacts/events, got artifacts=${relationshipProfilePromotedArtifactCount} events=${relationshipProfilePromotedEventCount}`
    );
  }
  for (const eventKind of ["crm.contact.enriched", "crm.relationship.profile_updated"]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (relationshipPromotedArtifactCount < 2 || relationshipPromotedEventCount < 3) {
    throw new Error(
      `expected promoted relationship artifacts/events, got artifacts=${relationshipPromotedArtifactCount} events=${relationshipPromotedEventCount}`
    );
  }
  for (const eventKind of ["crm.relationship.recorded", "crm.opportunity.stage_changed", "crm.forecast.updated"]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (pipelinePromotedArtifactCount < 3 || pipelinePromotedEventCount < 2) {
    throw new Error(
      `expected promoted pipeline stage move artifacts/events, got artifacts=${pipelinePromotedArtifactCount} events=${pipelinePromotedEventCount}`
    );
  }
  for (const eventKind of ["crm.opportunity.stage_changed", "crm.forecast.updated"]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (commercialPromotedArtifactCount < 4 || commercialPromotedEventCount < 4) {
    throw new Error(
      `expected promoted commercial follow-up forecast artifacts/events, got artifacts=${commercialPromotedArtifactCount} events=${commercialPromotedEventCount}`
    );
  }
  for (const eventKind of [
    "crm.followup.scheduled",
    "crm.forecast.reviewed",
    "crm.goal.progress_reviewed",
    "crm.commission.accrued"
  ]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (commercialForecastReviewPromotedArtifactCount < 3 || commercialForecastReviewPromotedEventCount < 3) {
    throw new Error(
      `expected promoted commercial forecast review artifacts/events, got artifacts=${commercialForecastReviewPromotedArtifactCount} events=${commercialForecastReviewPromotedEventCount}`
    );
  }
  if (goalCommissionPromotedArtifactCount < 3 || goalCommissionPromotedEventCount < 3) {
    throw new Error(
      `expected promoted goal commission artifacts/events, got artifacts=${goalCommissionPromotedArtifactCount} events=${goalCommissionPromotedEventCount}`
    );
  }
  for (const eventKind of ["crm.goal.target_set", "crm.goal.attainment_reviewed", "crm.commission.statement_generated"]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (accountPromotedArtifactCount < 4 || accountPromotedEventCount < 4) {
    throw new Error(
      `expected promoted account management artifacts/events, got artifacts=${accountPromotedArtifactCount} events=${accountPromotedEventCount}`
    );
  }
  for (const eventKind of [
    "crm.account.health_reviewed",
    "crm.account.renewal_planned",
    "crm.account.expansion_identified",
    "crm.task.created"
  ]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (customerSuccessPromotedArtifactCount < 5 || customerSuccessPromotedEventCount < 5) {
    throw new Error(
      `expected promoted customer success artifacts/events, got artifacts=${customerSuccessPromotedArtifactCount} events=${customerSuccessPromotedEventCount}`
    );
  }
  for (const eventKind of [
    "crm.success.plan_created",
    "crm.success.adoption_reviewed",
    "crm.success.renewal_risk_flagged",
    "crm.success.expansion_playbook_created"
  ]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (contractSignaturePromotedArtifactCount < 4 || contractSignaturePromotedEventCount < 3) {
    throw new Error(
      `expected promoted contract signature artifacts/events, got artifacts=${contractSignaturePromotedArtifactCount} events=${contractSignaturePromotedEventCount}`
    );
  }
  for (const eventKind of ["crm.contract.reviewed", "crm.contract.signed", "crm.contract.renewal_scheduled"]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (documentPromotedArtifactCount < 7 || documentPromotedEventCount < 1) {
    throw new Error(
      `expected promoted document artifacts/events, got artifacts=${documentPromotedArtifactCount} events=${documentPromotedEventCount}`
    );
  }
  if (!workflowEventKinds.includes("crm.document.generated")) {
    throw new Error(`expected document generation event in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
  }
  if (documentApprovalPromotedArtifactCount < 2 || documentApprovalPromotedEventCount < 2) {
    throw new Error(
      `expected promoted document approval artifacts/events, got artifacts=${documentApprovalPromotedArtifactCount} events=${documentApprovalPromotedEventCount}`
    );
  }
  for (const eventKind of ["crm.document.approved", "crm.document.delivery_unblocked"]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (documentLibraryPromotedArtifactCount < 4 || documentLibraryPromotedEventCount < 3) {
    throw new Error(
      `expected promoted document library artifacts/events, got artifacts=${documentLibraryPromotedArtifactCount} events=${documentLibraryPromotedEventCount}`
    );
  }
  for (const eventKind of ["crm.file.recorded", "crm.document.versioned", "crm.document.collection_updated"]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (marketingSegmentPromotedArtifactCount < 4 || marketingSegmentPromotedEventCount < 3) {
    throw new Error(
      `expected promoted marketing segment artifacts/events, got artifacts=${marketingSegmentPromotedArtifactCount} events=${marketingSegmentPromotedEventCount}`
    );
  }
  for (const eventKind of ["crm.segment.defined", "crm.segment.audience_selected", "crm.segment.ready_for_campaign"]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (marketingPromotedArtifactCount < 4 || marketingPromotedEventCount < 3) {
    throw new Error(
      `expected promoted marketing automation artifacts/events, got artifacts=${marketingPromotedArtifactCount} events=${marketingPromotedEventCount}`
    );
  }
  for (const eventKind of ["crm.campaign.created", "crm.campaign.scheduled", "crm.nurture.step_due"]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (marketingLeadNurturePromotedArtifactCount < 4 || marketingLeadNurturePromotedEventCount < 3) {
    throw new Error(
      `expected promoted lead nurture artifacts/events, got artifacts=${marketingLeadNurturePromotedArtifactCount} events=${marketingLeadNurturePromotedEventCount}`
    );
  }
  for (const eventKind of ["crm.nurture.message_ready", "crm.lead.requalified"]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (landingPagePromotedArtifactCount < 3 || landingPagePromotedEventCount < 3) {
    throw new Error(
      `expected promoted landing page artifacts/events, got artifacts=${landingPagePromotedArtifactCount} events=${landingPagePromotedEventCount}`
    );
  }
  for (const eventKind of [
    "crm.landing_page.composed",
    "crm.landing_page.approval_requested",
    "crm.form.schema_published"
  ]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (marketingFormPromotedArtifactCount < 4 || marketingFormPromotedEventCount < 3) {
    throw new Error(
      `expected promoted marketing form capture artifacts/events, got artifacts=${marketingFormPromotedArtifactCount} events=${marketingFormPromotedEventCount}`
    );
  }
  for (const eventKind of ["crm.form.submitted", "crm.lead.created", "crm.nurture.step_due"]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (channelIntakePromotedArtifactCount < 3 || channelIntakePromotedEventCount < 2) {
    throw new Error(
      `expected promoted channel intake artifacts/events, got artifacts=${channelIntakePromotedArtifactCount} events=${channelIntakePromotedEventCount}`
    );
  }
  for (const eventKind of ["crm.channel.authorized", "crm.message.normalized"]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (omnichannelIngestionPromotedArtifactCount < 3 || omnichannelIngestionPromotedEventCount < 2) {
    throw new Error(
      `expected promoted omnichannel ingestion artifacts/events, got artifacts=${omnichannelIngestionPromotedArtifactCount} events=${omnichannelIngestionPromotedEventCount}`
    );
  }
  for (const eventKind of ["crm.message.received", "crm.ticket.created"]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (omnichannelCenterPromotedArtifactCount < 4 || omnichannelCenterPromotedEventCount < 3) {
    throw new Error(
      `expected promoted omnichannel center artifacts/events, got artifacts=${omnichannelCenterPromotedArtifactCount} events=${omnichannelCenterPromotedEventCount}`
    );
  }
  for (const eventKind of ["crm.omnichannel.center_snapshot", "crm.conversation.unified", "crm.channel.identity_mapped"]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (supportReplyPromotedArtifactCount < 4 || supportReplyPromotedEventCount < 3) {
    throw new Error(
      `expected promoted support reply artifacts/events, got artifacts=${supportReplyPromotedArtifactCount} events=${supportReplyPromotedEventCount}`
    );
  }
  for (const eventKind of ["crm.reply.drafted", "crm.reply.approval_requested", "crm.handoff.delivery_blocked"]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (ticketSlaPromotedArtifactCount < 2 || ticketSlaPromotedEventCount < 3) {
    throw new Error(
      `expected promoted ticket SLA artifacts/events, got artifacts=${ticketSlaPromotedArtifactCount} events=${ticketSlaPromotedEventCount}`
    );
  }
  for (const eventKind of ["crm.message.received", "crm.ticket.created", "crm.sla.escalated"]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (operationsPromotedArtifactCount < 4 || operationsPromotedEventCount < 4) {
    throw new Error(
      `expected promoted operations project handoff artifacts/events, got artifacts=${operationsPromotedArtifactCount} events=${operationsPromotedEventCount}`
    );
  }
  for (const eventKind of [
    "crm.project.handoff_requested",
    "crm.task.created",
    "crm.task.blocked",
    "crm.project.accepted"
  ]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (internalCollaborationPromotedArtifactCount < 5 || internalCollaborationPromotedEventCount < 5) {
    throw new Error(
      `expected promoted internal collaboration artifacts/events, got artifacts=${internalCollaborationPromotedArtifactCount} events=${internalCollaborationPromotedEventCount}`
    );
  }
  for (const eventKind of [
    "crm.collaboration.thread_created",
    "crm.collaboration.note_recorded",
    "crm.collaboration.decision_recorded",
    "crm.collaboration.mention_routed"
  ]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }
  if (enterpriseJourneyPromotedArtifactCount < 3 || enterpriseJourneyPromotedEventCount < 3) {
    throw new Error(
      `expected promoted enterprise journey artifacts/events, got artifacts=${enterpriseJourneyPromotedArtifactCount} events=${enterpriseJourneyPromotedEventCount}`
    );
  }
  for (const eventKind of ["crm.journey.started", "crm.journey.stage_completed", "crm.journey.acceptance_reported"]) {
    if (!workflowEventKinds.includes(eventKind)) {
      throw new Error(`expected ${eventKind} in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
    }
  }

  const classifier = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.lead.classifier.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-lead-classification",
    "--input",
    JSON.stringify({
      lead_profile: {
        id: "lead-smoke-001",
        company: "Example Logistics",
        budget: 180000,
        company_size: 240,
        timeline: "this quarter",
        role: "COO",
        source: "inbound demo",
        pain: "Needs audited sales and support workflows connected to operations."
      }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  const proposal = runForge([
    "addons",
    "execute-executor",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.proposal.generator.executor",
    "--worker",
    workerId,
    "--task",
    "crm-smoke-proposal",
    "--input",
    JSON.stringify({
      opportunity: { id: "opp-smoke-001", company: "Example Logistics", amount: 180000 },
      account_context: { name: "Example Logistics" },
      approved_offer_terms: { amount: 180000, currency: "USD" }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  const validator = runForge([
    "addons",
    "execute-validator",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.document.validator",
    "--worker",
    workerId,
    "--subject",
    "proposal-smoke-001",
    "--input",
    JSON.stringify({
      artifact_ref: { id: "proposal-opp-smoke-001", sha256: "smoke" },
      approval_policy: { requires_human_approval: true, approved: true, approver: "forge-crm-smoke" },
      lineage: { workflow_id: "wf-smoke", artifact_id: "proposal-opp-smoke-001" }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  const handoff = runForge([
    "addons",
    "execute-handoff",
    "--addon-dir",
    "addons",
    "--addon",
    "forge.addon.crm",
    "--contract",
    "crm.omnichannel.handoff",
    "--worker",
    workerId,
    "--handoff",
    "ticket-smoke-001",
    "--input",
    JSON.stringify({
      ticket_context: { id: "ticket-smoke-001", channel: "email" },
      channel: "email",
      approved_message: { approved: true, summary: "Smoke handoff" },
      integration_policy: { approved: true, queue: "support" }
    }),
    "--context",
    JSON.stringify({ tenant: "smoke" }),
    "--output",
    "json"
  ]);

  const summary = {
    status: "ok",
    endpoint,
    workflow_id: workflowId,
    authorizations: authorizations.map((authorization) => authorization.status || authorization.authorization_status),
    planner_status: planner.status,
    bootstrap_status: bootstrap.status,
    bootstrap_promotion_status: bootstrap.promotion.status,
    bootstrap_promoted_artifacts: promotedArtifactCount,
    bootstrap_promoted_events: promotedEventCount,
    operating_snapshot_status: operatingSnapshot.status,
    operating_snapshot_promotion_status: operatingSnapshot.promotion.status,
    operating_snapshot_surfaces: operatingSnapshot.executor_result.outputs.operator_surface_count,
    operating_snapshot_modules: operatingSnapshot.executor_result.outputs.business_module_count,
    operating_snapshot_promoted_artifacts: snapshotPromotedArtifactCount,
    operating_snapshot_promoted_events: snapshotPromotedEventCount,
    copilot_status: copilot.status,
    copilot_promotion_status: copilot.promotion.status,
    copilot_priority_opportunity_id: copilot.executor_result.outputs.priority_opportunity_id,
    copilot_risk_count: copilot.executor_result.outputs.risk_count,
    copilot_promoted_artifacts: copilotPromotedArtifactCount,
    copilot_promoted_events: copilotPromotedEventCount,
    area_copilot_status: areaCopilot.status,
    area_copilot_promotion_status: areaCopilot.promotion.status,
    area_copilot_ready_area_count: areaCopilot.executor_result.outputs.ready_area_count,
    area_copilot_modes: areaCopilot.executor_result.outputs.copilot_modes,
    area_copilot_promoted_artifacts: areaCopilotPromotedArtifactCount,
    area_copilot_promoted_events: areaCopilotPromotedEventCount,
    work_queue_status: workQueue.status,
    work_queue_promotion_status: workQueue.promotion.status,
    work_queue_queue_count: workQueue.executor_result.outputs.queue_count,
    work_queue_risk_item_count: workQueue.executor_result.outputs.risk_item_count,
    work_queue_promoted_artifacts: workQueuePromotedArtifactCount,
    work_queue_promoted_events: workQueuePromotedEventCount,
    daily_operating_cycle_status: dailyOperatingCycle.status,
    daily_operating_cycle_promotion_status: dailyOperatingCycle.promotion.status,
    daily_operating_cycle_domain_count: dailyOperatingCycle.executor_result.outputs.domain_count,
    daily_operating_cycle_command_item_count: dailyOperatingCycle.executor_result.outputs.command_item_count,
    daily_operating_cycle_risk_count: dailyOperatingCycle.executor_result.outputs.risk_count,
    daily_operating_cycle_promoted_artifacts: dailyOperatingCyclePromotedArtifactCount,
    daily_operating_cycle_promoted_events: dailyOperatingCyclePromotedEventCount,
    approval_governance_status: approvalGovernance.status,
    approval_governance_promotion_status: approvalGovernance.promotion.status,
    approval_governance_state: approvalGovernance.executor_result.outputs.governance_state,
    approval_governance_approved_count: approvalGovernance.executor_result.outputs.approved_count,
    approval_governance_rework_count: approvalGovernance.executor_result.outputs.rework_count,
    approval_governance_promoted_artifacts: approvalGovernancePromotedArtifactCount,
    approval_governance_promoted_events: approvalGovernancePromotedEventCount,
    factory_blueprint_status: factoryBlueprint.status,
    factory_blueprint_promotion_status: factoryBlueprint.promotion.status,
    factory_blueprint_module_count: factoryBlueprint.executor_result.outputs.module_count,
    factory_blueprint_portability_state: factoryBlueprint.executor_result.outputs.portability_state,
    factory_blueprint_promoted_artifacts: factoryBlueprintPromotedArtifactCount,
    factory_blueprint_promoted_events: factoryBlueprintPromotedEventCount,
    subworkflow_orchestration_status: subworkflowOrchestration.status,
    subworkflow_orchestration_promotion_status: subworkflowOrchestration.promotion.status,
    subworkflow_orchestration_state: subworkflowOrchestration.executor_result.outputs.orchestration_state,
    subworkflow_orchestration_validated_count: subworkflowOrchestration.executor_result.outputs.validated_subworkflow_count,
    subworkflow_orchestration_promote_parent_allowed:
      subworkflowOrchestration.executor_result.outputs.promote_parent_allowed,
    subworkflow_orchestration_promoted_artifacts: subworkflowPromotedArtifactCount,
    subworkflow_orchestration_promoted_events: subworkflowPromotedEventCount,
    design_system_status: designSystem.status,
    design_system_promotion_status: designSystem.promotion.status,
    design_system_component_count: designSystem.executor_result.outputs.component_count,
    design_system_token_count: designSystem.executor_result.outputs.token_count,
    design_system_promoted_artifacts: designSystemPromotedArtifactCount,
    design_system_promoted_events: designSystemPromotedEventCount,
    memory_promotion_status: memoryPromotion.status,
    memory_promotion_promotion_status: memoryPromotion.promotion.status,
    memory_promotion_to_scope: memoryPromotion.executor_result.outputs.to_scope,
    memory_promotion_core_owner: memoryPromotion.executor_result.outputs.core_promotion_owner,
    memory_promotion_promoted_artifacts: memoryPromotedArtifactCount,
    memory_promotion_promoted_events: memoryPromotedEventCount,
    observability_status: observabilityInspection.status,
    observability_promotion_status: observabilityInspection.promotion.status,
    observability_cost_total_usd: observabilityInspection.executor_result.outputs.cost_total_usd,
    observability_inspection_status: observabilityInspection.executor_result.outputs.inspection_status,
    observability_promoted_artifacts: observabilityPromotedArtifactCount,
    observability_promoted_events: observabilityPromotedEventCount,
    executive_reporting_status: executiveReporting.status,
    executive_reporting_promotion_status: executiveReporting.promotion.status,
    executive_reporting_health_score: executiveReporting.executor_result.outputs.executive_health_score,
    executive_reporting_kpi_count: executiveReporting.executor_result.outputs.kpi_count,
    executive_reporting_risk_count: executiveReporting.executor_result.outputs.risk_count,
    executive_reporting_promoted_artifacts: executiveReportingPromotedArtifactCount,
    executive_reporting_promoted_events: executiveReportingPromotedEventCount,
    workflow_evolution_status: workflowEvolution.status,
    workflow_evolution_promotion_status: workflowEvolution.promotion.status,
    workflow_evolution_state: workflowEvolution.executor_result.outputs.evolution_state,
    workflow_evolution_candidate_count: workflowEvolution.executor_result.outputs.candidate_count,
    workflow_evolution_promotion_allowed: workflowEvolution.executor_result.outputs.promotion_allowed,
    workflow_evolution_benchmark_metric: workflowEvolution.executor_result.outputs.benchmark_metric,
    workflow_evolution_promoted_artifacts: workflowEvolutionPromotedArtifactCount,
    workflow_evolution_promoted_events: workflowEvolutionPromotedEventCount,
    workflow_automation_design_status: workflowAutomationDesign.status,
    workflow_automation_design_promotion_status: workflowAutomationDesign.promotion.status,
    workflow_automation_design_state: workflowAutomationDesign.executor_result.outputs.automation_state,
    workflow_automation_design_trigger_count: workflowAutomationDesign.executor_result.outputs.trigger_count,
    workflow_automation_design_action_count: workflowAutomationDesign.executor_result.outputs.action_count,
    workflow_automation_design_activation_allowed: workflowAutomationDesign.executor_result.outputs.activation_allowed,
    workflow_automation_design_promoted_artifacts: workflowAutomationDesignPromotedArtifactCount,
    workflow_automation_design_promoted_events: workflowAutomationDesignPromotedEventCount,
    workflow_automation_trace_status: workflowAutomationTrace.status,
    workflow_automation_trace_promotion_status: workflowAutomationTrace.promotion.status,
    workflow_automation_trace_dispatch_state: workflowAutomationTrace.executor_result.outputs.dispatch_state,
    workflow_automation_trace_action_dispatch_count: workflowAutomationTrace.executor_result.outputs.action_dispatch_count,
    workflow_automation_trace_local_execution_allowed: workflowAutomationTrace.executor_result.outputs.local_execution_allowed,
    workflow_automation_trace_promoted_artifacts: workflowAutomationTracePromotedArtifactCount,
    workflow_automation_trace_promoted_events: workflowAutomationTracePromotedEventCount,
    operating_readiness_status: operatingReadiness.status,
    operating_readiness_promotion_status: operatingReadiness.promotion.status,
    operating_readiness_success_criteria_status: operatingReadiness.executor_result.outputs.success_criteria_status,
    operating_readiness_ready_domain_count: operatingReadiness.executor_result.outputs.ready_domain_count,
    operating_readiness_user_deliverable_count: operatingReadiness.executor_result.outputs.user_facing_deliverable_count,
    operating_readiness_promoted_artifacts: readinessPromotedArtifactCount,
    operating_readiness_promoted_events: readinessPromotedEventCount,
    strategic_objective_audit_status: strategicObjectiveAudit.status,
    strategic_objective_audit_promotion_status: strategicObjectiveAudit.promotion.status,
    strategic_objective_audit_missing_requirements:
      strategicObjectiveAudit.executor_result.outputs.missing_requirement_count,
    strategic_objective_audit_requirement_count: strategicObjectiveAudit.executor_result.outputs.requirement_count,
    strategic_objective_audit_support_channel_count:
      strategicObjectiveAudit.executor_result.outputs.support_channel_count,
    strategic_objective_audit_promoted_artifacts: strategicAuditPromotedArtifactCount,
    strategic_objective_audit_promoted_events: strategicAuditPromotedEventCount,
    relationship_lifecycle_status: relationshipLifecycle.status,
    relationship_lifecycle_promotion_status: relationshipLifecycle.promotion.status,
    relationship_lifecycle_state: relationshipLifecycle.executor_result.outputs.lifecycle_state,
    relationship_lifecycle_next_workflow_count: relationshipLifecycle.executor_result.outputs.next_workflow_count,
    relationship_lifecycle_promoted_artifacts: relationshipLifecyclePromotedArtifactCount,
    relationship_lifecycle_promoted_events: relationshipLifecyclePromotedEventCount,
    relationship_profile_status: relationshipProfileEnrichment.status,
    relationship_profile_promotion_status: relationshipProfileEnrichment.promotion.status,
    relationship_profile_enrichment_state: relationshipProfileEnrichment.executor_result.outputs.enrichment_state,
    relationship_profile_promoted_artifacts: relationshipProfilePromotedArtifactCount,
    relationship_profile_promoted_events: relationshipProfilePromotedEventCount,
    relationship_timeline_status: relationshipTimeline.status,
    relationship_timeline_promotion_status: relationshipTimeline.promotion.status,
    relationship_timeline_pipeline_stage: relationshipTimeline.executor_result.outputs.pipeline_stage,
    relationship_timeline_promoted_artifacts: relationshipPromotedArtifactCount,
    relationship_timeline_promoted_events: relationshipPromotedEventCount,
    pipeline_stage_move_status: pipelineStageMove.status,
    pipeline_stage_move_promotion_status: pipelineStageMove.promotion.status,
    pipeline_stage_move_to_stage: pipelineStageMove.executor_result.outputs.to_stage,
    pipeline_stage_move_promoted_artifacts: pipelinePromotedArtifactCount,
    pipeline_stage_move_promoted_events: pipelinePromotedEventCount,
    commercial_followup_status: commercialFollowupForecast.status,
    commercial_followup_promotion_status: commercialFollowupForecast.promotion.status,
    commercial_followup_state: commercialFollowupForecast.executor_result.outputs.followup_state,
    commercial_followup_forecast_amount: commercialFollowupForecast.executor_result.outputs.forecast_amount,
    commercial_followup_promoted_artifacts: commercialPromotedArtifactCount,
    commercial_followup_promoted_events: commercialPromotedEventCount,
    commercial_forecast_review_status: commercialForecastReview.status,
    commercial_forecast_review_promotion_status: commercialForecastReview.promotion.status,
    commercial_forecast_review_amount: commercialForecastReview.executor_result.outputs.forecast_amount,
    commercial_forecast_review_followup_delivery_allowed: commercialForecastReview.executor_result.outputs.followup_delivery_allowed,
    commercial_forecast_review_promoted_artifacts: commercialForecastReviewPromotedArtifactCount,
    commercial_forecast_review_promoted_events: commercialForecastReviewPromotedEventCount,
    goal_commission_status: goalCommissionSettlement.status,
    goal_commission_promotion_status: goalCommissionSettlement.promotion.status,
    goal_commission_attainment_percent: goalCommissionSettlement.executor_result.outputs.attainment_percent,
    goal_commission_statement_amount: goalCommissionSettlement.executor_result.outputs.commission_statement_amount,
    goal_commission_payout_allowed: goalCommissionSettlement.executor_result.outputs.payout_allowed,
    goal_commission_promoted_artifacts: goalCommissionPromotedArtifactCount,
    goal_commission_promoted_events: goalCommissionPromotedEventCount,
    account_management_status: accountManagement.status,
    account_management_promotion_status: accountManagement.promotion.status,
    account_management_health_state: accountManagement.executor_result.outputs.health_state,
    account_management_next_state: accountManagement.executor_result.outputs.next_state,
    account_management_expansion_forecast_amount: accountManagement.executor_result.outputs.expansion_forecast_amount,
    account_management_promoted_artifacts: accountPromotedArtifactCount,
    account_management_promoted_events: accountPromotedEventCount,
    customer_success_status: customerSuccessPlan.status,
    customer_success_promotion_status: customerSuccessPlan.promotion.status,
    customer_success_adoption_state: customerSuccessPlan.executor_result.outputs.adoption_state,
    customer_success_renewal_risk_state: customerSuccessPlan.executor_result.outputs.renewal_risk_state,
    customer_success_expansion_playbook_count: customerSuccessPlan.executor_result.outputs.expansion_playbook_count,
    customer_success_promoted_artifacts: customerSuccessPromotedArtifactCount,
    customer_success_promoted_events: customerSuccessPromotedEventCount,
    contract_signature_status: contractSignature.status,
    contract_signature_promotion_status: contractSignature.promotion.status,
    contract_signature_state: contractSignature.executor_result.outputs.contract_state,
    contract_signature_renewal_state: contractSignature.executor_result.outputs.renewal_state,
    contract_signature_promoted_artifacts: contractSignaturePromotedArtifactCount,
    contract_signature_promoted_events: contractSignaturePromotedEventCount,
    document_generator_status: documentGenerator.status,
    document_generator_promotion_status: documentGenerator.promotion.status,
    document_generator_document_id: documentGenerator.executor_result.outputs.document_id,
    document_generator_promoted_artifacts: documentPromotedArtifactCount,
    document_generator_promoted_events: documentPromotedEventCount,
    document_approval_status: documentApproval.status,
    document_approval_promotion_status: documentApproval.promotion.status,
    document_approval_state: documentApproval.executor_result.outputs.approval_state,
    document_approval_external_delivery_allowed: documentApproval.executor_result.outputs.external_delivery_allowed,
    document_approval_promoted_artifacts: documentApprovalPromotedArtifactCount,
    document_approval_promoted_events: documentApprovalPromotedEventCount,
    document_library_status: documentLibrary.status,
    document_library_promotion_status: documentLibrary.promotion.status,
    document_library_version_id: documentLibrary.executor_result.outputs.version_id,
    document_library_version_state: documentLibrary.executor_result.outputs.version_state,
    document_library_promoted_artifacts: documentLibraryPromotedArtifactCount,
    document_library_promoted_events: documentLibraryPromotedEventCount,
    marketing_segment_status: marketingSegment.status,
    marketing_segment_promotion_status: marketingSegment.promotion.status,
    marketing_segment_approval_state: marketingSegment.executor_result.outputs.approval_state,
    marketing_segment_audience_count: marketingSegment.executor_result.outputs.audience_count,
    marketing_segment_promoted_artifacts: marketingSegmentPromotedArtifactCount,
    marketing_segment_promoted_events: marketingSegmentPromotedEventCount,
    marketing_automation_status: marketingAutomation.status,
    marketing_automation_promotion_status: marketingAutomation.promotion.status,
    marketing_automation_scheduled_state: marketingAutomation.executor_result.outputs.scheduled_state,
    marketing_automation_promoted_artifacts: marketingPromotedArtifactCount,
    marketing_automation_promoted_events: marketingPromotedEventCount,
    marketing_lead_nurture_status: marketingLeadNurture.status,
    marketing_lead_nurture_promotion_status: marketingLeadNurture.promotion.status,
    marketing_lead_nurture_next_state: marketingLeadNurture.executor_result.outputs.next_state,
    marketing_lead_nurture_external_send_allowed: marketingLeadNurture.executor_result.outputs.external_send_allowed,
    marketing_lead_nurture_promoted_artifacts: marketingLeadNurturePromotedArtifactCount,
    marketing_lead_nurture_promoted_events: marketingLeadNurturePromotedEventCount,
    marketing_landing_page_status: marketingLandingPage.status,
    marketing_landing_page_promotion_status: marketingLandingPage.promotion.status,
    marketing_landing_page_publication_state: marketingLandingPage.executor_result.outputs.publication_state,
    marketing_landing_page_external_publication_allowed: marketingLandingPage.executor_result.outputs.external_publication_allowed,
    marketing_landing_page_promoted_artifacts: landingPagePromotedArtifactCount,
    marketing_landing_page_promoted_events: landingPagePromotedEventCount,
    marketing_form_capture_status: marketingFormCapture.status,
    marketing_form_capture_promotion_status: marketingFormCapture.promotion.status,
    marketing_form_capture_lead_state: marketingFormCapture.executor_result.outputs.lead_state,
    marketing_form_capture_consent_state: marketingFormCapture.executor_result.outputs.consent_state,
    marketing_form_capture_promoted_artifacts: marketingFormPromotedArtifactCount,
    marketing_form_capture_promoted_events: marketingFormPromotedEventCount,
    channel_intake_status: channelIntake.status,
    channel_intake_promotion_status: channelIntake.promotion.status,
    channel_intake_state: channelIntake.executor_result.outputs.intake_state,
    channel_intake_ticket_creation_allowed: channelIntake.executor_result.outputs.ticket_creation_allowed,
    channel_intake_promoted_artifacts: channelIntakePromotedArtifactCount,
    channel_intake_promoted_events: channelIntakePromotedEventCount,
    omnichannel_ingestion_status: omnichannelIngestion.status,
    omnichannel_ingestion_promotion_status: omnichannelIngestion.promotion.status,
    omnichannel_ingestion_ticket_state: omnichannelIngestion.executor_result.outputs.ticket_state,
    omnichannel_ingestion_promoted_artifacts: omnichannelIngestionPromotedArtifactCount,
    omnichannel_ingestion_promoted_events: omnichannelIngestionPromotedEventCount,
    omnichannel_center_status: omnichannelCenter.status,
    omnichannel_center_promotion_status: omnichannelCenter.promotion.status,
    omnichannel_center_state: omnichannelCenter.executor_result.outputs.center_state,
    omnichannel_center_owner_queue: omnichannelCenter.executor_result.outputs.owner_queue,
    omnichannel_center_unified_conversations: omnichannelCenter.executor_result.outputs.unified_conversation_count,
    omnichannel_center_promoted_artifacts: omnichannelCenterPromotedArtifactCount,
    omnichannel_center_promoted_events: omnichannelCenterPromotedEventCount,
    support_reply_status: supportReply.status,
    support_reply_promotion_status: supportReply.promotion.status,
    support_reply_state: supportReply.executor_result.outputs.reply_state,
    support_reply_external_send_allowed: supportReply.executor_result.outputs.external_send_allowed,
    support_reply_promoted_artifacts: supportReplyPromotedArtifactCount,
    support_reply_promoted_events: supportReplyPromotedEventCount,
    ticket_sla_status: ticketSla.status,
    ticket_sla_promotion_status: ticketSla.promotion.status,
    ticket_sla_state: ticketSla.executor_result.outputs.sla_state,
    ticket_sla_promoted_artifacts: ticketSlaPromotedArtifactCount,
    ticket_sla_promoted_events: ticketSlaPromotedEventCount,
    operations_project_handoff_status: operationsProjectHandoff.status,
    operations_project_handoff_promotion_status: operationsProjectHandoff.promotion.status,
    operations_project_handoff_next_state: operationsProjectHandoff.executor_result.outputs.next_state,
    operations_project_handoff_promoted_artifacts: operationsPromotedArtifactCount,
    operations_project_handoff_promoted_events: operationsPromotedEventCount,
    internal_collaboration_status: internalCollaboration.status,
    internal_collaboration_promotion_status: internalCollaboration.promotion.status,
    internal_collaboration_next_state: internalCollaboration.executor_result.outputs.next_state,
    internal_collaboration_note_count: internalCollaboration.executor_result.outputs.note_count,
    internal_collaboration_decision_count: internalCollaboration.executor_result.outputs.decision_count,
    internal_collaboration_mention_count: internalCollaboration.executor_result.outputs.mention_count,
    internal_collaboration_promoted_artifacts: internalCollaborationPromotedArtifactCount,
    internal_collaboration_promoted_events: internalCollaborationPromotedEventCount,
    enterprise_journey_status: enterpriseJourney.status,
    enterprise_journey_promotion_status: enterpriseJourney.promotion.status,
    enterprise_journey_acceptance_status: enterpriseJourney.executor_result.outputs.acceptance_status,
    enterprise_journey_stage_count: enterpriseJourney.executor_result.outputs.stage_count,
    enterprise_journey_missing_stage_count: enterpriseJourney.executor_result.outputs.missing_stage_count,
    enterprise_journey_promoted_artifacts: enterpriseJourneyPromotedArtifactCount,
    enterprise_journey_promoted_events: enterpriseJourneyPromotedEventCount,
    workflow_artifact_count: workflowArtifactCount,
    workflow_event_kinds: workflowEventKinds,
    bootstrap_workflow_count: bootstrap.executor_result.outputs.workflow_count,
    bootstrap_complete_scope: bootstrap.executor_result.outputs.complete_scope,
    classifier_status: classifier.status,
    classifier_tier: classifier.executor_result.outputs.tier,
    proposal_status: proposal.status,
    proposal_id: proposal.executor_result.outputs.proposal_id,
    validator_status: validator.status,
    validator_decision: validator.validation.decision,
    handoff_status: handoff.status,
    handoff_receipt: handoff.handoff_result.receipt.id
  };
  console.log(JSON.stringify(summary, null, 2));
} finally {
  worker.kill("SIGTERM");
  rmSync(path.dirname(store), { recursive: true, force: true });
}
