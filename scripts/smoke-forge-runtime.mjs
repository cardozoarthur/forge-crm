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
      "forge_crm.operating_copilot",
      "forge_crm.generate_proposal",
      "forge_crm.review_followup_forecast",
      "forge_crm.generate_document",
      "forge_crm.validate_document",
      "forge_crm.automate_campaign",
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
      "crm.ai.operating_copilot.executor",
      "crm.proposal.generator.executor",
      "crm.commercial.followup_forecast.executor",
      "crm.document.generator.executor",
      "crm.document.validator",
      "crm.marketing.campaign_automation.executor",
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
    ["crm.omnichannel.ingest", "medium"]
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
  const relationshipPromotedArtifactCount = relationshipTimeline.promotion?.artifact_count ?? 0;
  const relationshipPromotedEventCount = relationshipTimeline.promotion?.event_count ?? 0;
  const commercialPromotedArtifactCount = commercialFollowupForecast.promotion?.artifact_count ?? 0;
  const commercialPromotedEventCount = commercialFollowupForecast.promotion?.event_count ?? 0;
  const documentPromotedArtifactCount = documentGenerator.promotion?.artifact_count ?? 0;
  const documentPromotedEventCount = documentGenerator.promotion?.event_count ?? 0;
  const marketingPromotedArtifactCount = marketingAutomation.promotion?.artifact_count ?? 0;
  const marketingPromotedEventCount = marketingAutomation.promotion?.event_count ?? 0;
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
  if (documentPromotedArtifactCount < 7 || documentPromotedEventCount < 1) {
    throw new Error(
      `expected promoted document artifacts/events, got artifacts=${documentPromotedArtifactCount} events=${documentPromotedEventCount}`
    );
  }
  if (!workflowEventKinds.includes("crm.document.generated")) {
    throw new Error(`expected document generation event in workflow timeline, got ${workflowEventKinds.join(",") || "none"}`);
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
    relationship_timeline_status: relationshipTimeline.status,
    relationship_timeline_promotion_status: relationshipTimeline.promotion.status,
    relationship_timeline_pipeline_stage: relationshipTimeline.executor_result.outputs.pipeline_stage,
    relationship_timeline_promoted_artifacts: relationshipPromotedArtifactCount,
    relationship_timeline_promoted_events: relationshipPromotedEventCount,
    commercial_followup_status: commercialFollowupForecast.status,
    commercial_followup_promotion_status: commercialFollowupForecast.promotion.status,
    commercial_followup_state: commercialFollowupForecast.executor_result.outputs.followup_state,
    commercial_followup_forecast_amount: commercialFollowupForecast.executor_result.outputs.forecast_amount,
    commercial_followup_promoted_artifacts: commercialPromotedArtifactCount,
    commercial_followup_promoted_events: commercialPromotedEventCount,
    document_generator_status: documentGenerator.status,
    document_generator_promotion_status: documentGenerator.promotion.status,
    document_generator_document_id: documentGenerator.executor_result.outputs.document_id,
    document_generator_promoted_artifacts: documentPromotedArtifactCount,
    document_generator_promoted_events: documentPromotedEventCount,
    marketing_automation_status: marketingAutomation.status,
    marketing_automation_promotion_status: marketingAutomation.promotion.status,
    marketing_automation_scheduled_state: marketingAutomation.executor_result.outputs.scheduled_state,
    marketing_automation_promoted_artifacts: marketingPromotedArtifactCount,
    marketing_automation_promoted_events: marketingPromotedEventCount,
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
