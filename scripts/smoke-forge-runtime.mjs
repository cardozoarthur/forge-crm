#!/usr/bin/env node
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const forgeBin = process.env.FORGE_BIN || "forge";
const workerId = "forge-crm-runtime-worker";
const store = path.join(mkdtempSync(path.join(os.tmpdir(), "forge-crm-smoke-")), "forge.sqlite");

function runForge(args) {
  const result = spawnSync(forgeBin, ["--store", store, ...args], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(
      [
        `forge command failed: ${forgeBin} --store ${store} ${args.join(" ")}`,
        result.stdout.trim(),
        result.stderr.trim()
      ]
        .filter(Boolean)
        .join("\n")
    );
  }
  return JSON.parse(result.stdout);
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
      "forge_crm.record_relationship_event",
      "forge_crm.move_opportunity_stage",
      "forge_crm.operating_copilot",
      "forge_crm.prepare_memory_promotion",
      "forge_crm.inspect_observability",
      "forge_crm.generate_operating_readiness",
      "forge_crm.generate_proposal",
      "forge_crm.review_followup_forecast",
      "forge_crm.manage_account",
      "forge_crm.manage_contract_signature",
      "forge_crm.generate_document",
      "forge_crm.validate_document",
      "forge_crm.record_document_approval",
      "forge_crm.automate_campaign",
      "forge_crm.capture_form_submission",
      "forge_crm.ingest_omnichannel_message",
      "forge_crm.triage_ticket_sla",
      "forge_crm.plan_project_handoff",
      "forge_crm.deliver_handoff"
    ],
    allowed_contracts: [
      "crm.factory.planning",
      "crm.tenant.bootstrap.executor",
      "crm.operating.snapshot.executor",
      "crm.lead.classifier.executor",
      "crm.relationship.timeline.executor",
      "crm.pipeline.stage_move.executor",
      "crm.ai.operating_copilot.executor",
      "crm.memory.promotion.executor",
      "crm.observability.inspector.executor",
      "crm.operating.readiness.executor",
      "crm.proposal.generator.executor",
      "crm.commercial.followup_forecast.executor",
      "crm.commercial.account_management.executor",
      "crm.commercial.contract_signature.executor",
      "crm.document.generator.executor",
      "crm.document.validator",
      "crm.document.approval.executor",
      "crm.marketing.campaign_automation.executor",
      "crm.marketing.form_capture.executor",
      "crm.support.omnichannel_message.executor",
      "crm.support.ticket_sla.executor",
      "crm.operations.project_handoff.executor",
      "crm.omnichannel.handoff"
    ],
    timeout_seconds: 5,
    max_response_bytes: 262144
  };

  const authorizations = [
    ["crm.workflow.mutate", "high"],
    ["crm.document.generate", "medium"],
    ["crm.omnichannel.ingest", "medium"],
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

  const workflowPackArtifact = bootstrap.executor_result.artifacts.find((artifact) => artifact.kind === "crm_workflow_pack");
  const operatingSnapshotArtifact = operatingSnapshot.executor_result.artifacts.find((artifact) => artifact.kind === "crm_operating_snapshot");
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
      workflow_pack: workflowPackArtifact?.data,
      operating_snapshot: operatingSnapshotArtifact?.data,
      validation_evidence: {
        commands: ["npm test", "forge addons validate", "forge runtime smoke"],
        workflow_artifact_count: observabilityInspection.promotion?.artifact_count ?? 0,
        runtime_contract_count: workflowPackArtifact?.data?.summary?.runtime_contract_count
      },
      success_criteria: {
        goal: "Operate a complete enterprise CRM through Forge workflows",
        required_deliverables: [
          "relationship workspace",
          "commercial command center",
          "support inbox",
          "marketing automation",
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
  const memoryPromotedArtifactCount = memoryPromotion.promotion?.artifact_count ?? 0;
  const memoryPromotedEventCount = memoryPromotion.promotion?.event_count ?? 0;
  const observabilityPromotedArtifactCount = observabilityInspection.promotion?.artifact_count ?? 0;
  const observabilityPromotedEventCount = observabilityInspection.promotion?.event_count ?? 0;
  const readinessPromotedArtifactCount = operatingReadiness.promotion?.artifact_count ?? 0;
  const readinessPromotedEventCount = operatingReadiness.promotion?.event_count ?? 0;
  const relationshipPromotedArtifactCount = relationshipTimeline.promotion?.artifact_count ?? 0;
  const relationshipPromotedEventCount = relationshipTimeline.promotion?.event_count ?? 0;
  const pipelinePromotedArtifactCount = pipelineStageMove.promotion?.artifact_count ?? 0;
  const pipelinePromotedEventCount = pipelineStageMove.promotion?.event_count ?? 0;
  const commercialPromotedArtifactCount = commercialFollowupForecast.promotion?.artifact_count ?? 0;
  const commercialPromotedEventCount = commercialFollowupForecast.promotion?.event_count ?? 0;
  const accountPromotedArtifactCount = accountManagement.promotion?.artifact_count ?? 0;
  const accountPromotedEventCount = accountManagement.promotion?.event_count ?? 0;
  const contractSignaturePromotedArtifactCount = contractSignature.promotion?.artifact_count ?? 0;
  const contractSignaturePromotedEventCount = contractSignature.promotion?.event_count ?? 0;
  const documentPromotedArtifactCount = documentGenerator.promotion?.artifact_count ?? 0;
  const documentPromotedEventCount = documentGenerator.promotion?.event_count ?? 0;
  const documentApprovalPromotedArtifactCount = documentApproval.promotion?.artifact_count ?? 0;
  const documentApprovalPromotedEventCount = documentApproval.promotion?.event_count ?? 0;
  const marketingPromotedArtifactCount = marketingAutomation.promotion?.artifact_count ?? 0;
  const marketingPromotedEventCount = marketingAutomation.promotion?.event_count ?? 0;
  const marketingFormPromotedArtifactCount = marketingFormCapture.promotion?.artifact_count ?? 0;
  const marketingFormPromotedEventCount = marketingFormCapture.promotion?.event_count ?? 0;
  const omnichannelIngestionPromotedArtifactCount = omnichannelIngestion.promotion?.artifact_count ?? 0;
  const omnichannelIngestionPromotedEventCount = omnichannelIngestion.promotion?.event_count ?? 0;
  const ticketSlaPromotedArtifactCount = ticketSla.promotion?.artifact_count ?? 0;
  const ticketSlaPromotedEventCount = ticketSla.promotion?.event_count ?? 0;
  const operationsPromotedArtifactCount = operationsProjectHandoff.promotion?.artifact_count ?? 0;
  const operationsPromotedEventCount = operationsProjectHandoff.promotion?.event_count ?? 0;
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
    operating_readiness_status: operatingReadiness.status,
    operating_readiness_promotion_status: operatingReadiness.promotion.status,
    operating_readiness_success_criteria_status: operatingReadiness.executor_result.outputs.success_criteria_status,
    operating_readiness_ready_domain_count: operatingReadiness.executor_result.outputs.ready_domain_count,
    operating_readiness_user_deliverable_count: operatingReadiness.executor_result.outputs.user_facing_deliverable_count,
    operating_readiness_promoted_artifacts: readinessPromotedArtifactCount,
    operating_readiness_promoted_events: readinessPromotedEventCount,
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
    account_management_status: accountManagement.status,
    account_management_promotion_status: accountManagement.promotion.status,
    account_management_health_state: accountManagement.executor_result.outputs.health_state,
    account_management_next_state: accountManagement.executor_result.outputs.next_state,
    account_management_expansion_forecast_amount: accountManagement.executor_result.outputs.expansion_forecast_amount,
    account_management_promoted_artifacts: accountPromotedArtifactCount,
    account_management_promoted_events: accountPromotedEventCount,
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
    marketing_automation_status: marketingAutomation.status,
    marketing_automation_promotion_status: marketingAutomation.promotion.status,
    marketing_automation_scheduled_state: marketingAutomation.executor_result.outputs.scheduled_state,
    marketing_automation_promoted_artifacts: marketingPromotedArtifactCount,
    marketing_automation_promoted_events: marketingPromotedEventCount,
    marketing_form_capture_status: marketingFormCapture.status,
    marketing_form_capture_promotion_status: marketingFormCapture.promotion.status,
    marketing_form_capture_lead_state: marketingFormCapture.executor_result.outputs.lead_state,
    marketing_form_capture_consent_state: marketingFormCapture.executor_result.outputs.consent_state,
    marketing_form_capture_promoted_artifacts: marketingFormPromotedArtifactCount,
    marketing_form_capture_promoted_events: marketingFormPromotedEventCount,
    omnichannel_ingestion_status: omnichannelIngestion.status,
    omnichannel_ingestion_promotion_status: omnichannelIngestion.promotion.status,
    omnichannel_ingestion_ticket_state: omnichannelIngestion.executor_result.outputs.ticket_state,
    omnichannel_ingestion_promoted_artifacts: omnichannelIngestionPromotedArtifactCount,
    omnichannel_ingestion_promoted_events: omnichannelIngestionPromotedEventCount,
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
