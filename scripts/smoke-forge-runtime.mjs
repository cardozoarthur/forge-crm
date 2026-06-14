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
      "forge_crm.operating_copilot",
      "forge_crm.generate_proposal",
      "forge_crm.validate_document",
      "forge_crm.deliver_handoff"
    ],
    allowed_contracts: [
      "crm.factory.planning",
      "crm.tenant.bootstrap.executor",
      "crm.operating.snapshot.executor",
      "crm.lead.classifier.executor",
      "crm.ai.operating_copilot.executor",
      "crm.proposal.generator.executor",
      "crm.document.validator",
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
