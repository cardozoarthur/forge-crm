import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";
import { buildCrmWebAppSnapshot } from "../scripts/crm-web-app-lib.mjs";

const execFileAsync = promisify(execFile);

test("web app snapshot exposes business CRM surfaces from Forge state only", () => {
  const snapshot = buildCrmWebAppSnapshot({ tenant_id: "demo" });

  assert.equal(snapshot.schema_version, "forge.crm_web_app_snapshot.v1");
  assert.equal(snapshot.tenant_id, "demo");
  assert.equal(snapshot.local_state_policy.state_owner, "forge_workflow_runtime");
  assert.equal(snapshot.local_state_policy.external_database_required, false);
  assert.equal(snapshot.local_state_policy.direct_browser_persistence, false);
  assert.equal(snapshot.local_state_policy.allowed_mutation_path, "Forge workflow command, runtime contract or approved event");

  const surfaceIds = new Set(snapshot.surfaces.map((surface) => surface.id));
  for (const surfaceId of [
    "crm.system-map",
    "crm.relationship-graph",
    "crm.pipeline-kanban",
    "crm.commercial-command",
    "crm.support-queue",
    "crm.marketing-calendar",
    "crm.document-queue",
    "crm.work-queue",
    "crm.design-system",
    "crm.ai-workbench"
  ]) {
    assert.ok(surfaceIds.has(surfaceId), `missing web surface ${surfaceId}`);
  }

  assert.ok(snapshot.surfaces.every((surface) => surface.state_source === "forge_workflow_artifacts_and_events"));
  assert.ok(snapshot.surfaces.every((surface) => surface.mutation_requires_forge === true));
});

test("web app snapshot models workflow graph, knowledge graph and document queue contracts", () => {
  const snapshot = buildCrmWebAppSnapshot({ tenant_id: "demo" });

  assert.equal(snapshot.ui_contract.operational_center, "forge_tui");
  assert.equal(snapshot.ui_contract.web_experience, "business_user_workbench");
  assert.equal(snapshot.ui_contract.workflow_visualization, "n8n_inspired_graph");
  assert.equal(snapshot.ui_contract.knowledge_graph, "obsidian_inspired_relationships");
  assert.equal(snapshot.ui_contract.document_management, "paperclip_inspired_artifact_queue");
  assert.equal(snapshot.ui_contract.design_system, "penpot_open_design_inspired_tokens");

  assert.ok(snapshot.workflow_graph.nodes.length >= 10);
  assert.ok(snapshot.workflow_graph.edges.some((edge) => edge.from === "crm.opportunity.pipeline" && edge.to === "crm.proposal.approval"));
  assert.ok(snapshot.knowledge_graph.nodes.some((node) => node.kind === "company"));
  assert.ok(snapshot.knowledge_graph.nodes.some((node) => node.kind === "opportunity"));
  assert.ok(snapshot.document_queue.lanes.some((lane) => lane.id === "approval_wait"));
  assert.ok(snapshot.document_queue.artifact_types.includes("crm_proposal"));
  assert.ok(snapshot.document_queue.artifact_types.includes("crm_contract"));
  assert.ok(snapshot.document_queue.artifact_types.includes("crm_presentation"));
});

test("web app snapshot provides Forge command actions instead of local automation", () => {
  const snapshot = buildCrmWebAppSnapshot({ tenant_id: "demo" });

  assert.ok(snapshot.actions.length >= 4);
  assert.ok(snapshot.actions.every((action) => action.mutates_workflow === true));
  assert.ok(snapshot.actions.every((action) => action.requires_permission));
  assert.ok(snapshot.actions.every((action) => action.command_template[0] === "forge"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.operating.snapshot.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.relationship.timeline.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.relationship.profile_enrichment.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.pipeline.stage_move.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.commercial.followup_forecast.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.commercial.goal_commission.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.commercial.account_management.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.commercial.contract_signature.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.support.channel_intake.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.support.omnichannel_center.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.support.omnichannel_message.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.support.ticket_sla.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.operations.project_handoff.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.marketing.campaign_automation.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.marketing.segment_builder.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.marketing.landing_page.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.marketing.form_capture.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.proposal.generator.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.document.generator.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.document.approval.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.document.library.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.queue.orchestrator.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.design_system.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.memory.promotion.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.observability.inspector.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.analytics.executive_report.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.operating.readiness.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.ai.operating_copilot.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.workflow.evolution.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.enterprise.journey.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.workflow.subworkflow_orchestrator.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.workflow.automation_designer.executor"));
});

test("web app snapshot exposes relationship profile enrichment in the relationship graph", () => {
  const snapshot = buildCrmWebAppSnapshot({ tenant_id: "demo" });
  const action = snapshot.actions.find((candidate) => candidate.id === "crm.enrich-relationship-profile");

  assert.ok(action);
  assert.equal(action.surface_id, "crm.relationship-graph");
  assert.equal(action.contract_id, "crm.relationship.profile_enrichment.executor");
  assert.equal(action.requires_permission, "crm.workflow.mutate");
  assert.equal(action.command_template[0], "forge");

  assert.ok(snapshot.knowledge_graph.enrichment_profiles.some((profile) => profile.action_id === "crm.enrich-relationship-profile"));
  assert.ok(snapshot.knowledge_graph.enrichment_profiles.every((profile) => profile.state_owner === "forge_workflow_runtime"));
  assert.ok(snapshot.knowledge_graph.enrichment_profiles.every((profile) => profile.contract_id === "crm.relationship.profile_enrichment.executor"));
  assert.ok(snapshot.knowledge_graph.nodes.some((node) => node.kind === "relationship_profile"));
});

test("web app snapshot exposes auditable Forge action invocation plans", () => {
  const snapshot = buildCrmWebAppSnapshot({ tenant_id: "demo" });
  const plans = snapshot.action_invocation_plans;

  assert.equal(plans.schema_version, "forge.crm_web_action_invocation_plans.v1");
  assert.equal(plans.state_owner, "forge_workflow_runtime");
  assert.equal(plans.local_mutation_allowed, false);
  assert.equal(plans.plans.length, snapshot.actions.length);

  const byAction = new Map(plans.plans.map((plan) => [plan.action_id, plan]));
  for (const action of snapshot.actions) {
    const plan = byAction.get(action.id);
    assert.ok(plan, `missing plan for ${action.id}`);
    assert.equal(plan.contract_id, action.contract_id);
    assert.equal(plan.required_permission, action.requires_permission);
    assert.deepEqual(plan.selected_command, action.command_template);
    assert.equal(plan.permission_gate.status, "requires_forge_permission");
    assert.equal(plan.output_policy.promote_result_to_workflow, true);
    assert.equal(plan.output_policy.browser_local_state_write, false);
    assert.deepEqual(
      plan.operation_plan.map((step) => step.id),
      ["check_addon_permission", "execute_runtime_contract", "promote_result_to_workflow", "refresh_operating_snapshot"]
    );
  }
});

test("web app snapshot exposes Forge-owned operational workflow cadences", () => {
  const snapshot = buildCrmWebAppSnapshot({ tenant_id: "demo" });
  const cadences = snapshot.workflow_cadences;

  assert.equal(cadences.schema_version, "forge.crm_workflow_cadences.v1");
  assert.equal(cadences.state_owner, "forge_workflow_runtime");
  assert.equal(cadences.local_scheduler_allowed, false);
  assert.equal(cadences.event_channel_id, "crm.schedule");

  const actionById = new Map(snapshot.actions.map((action) => [action.id, action]));
  const workflowIds = new Set(snapshot.workflow_graph.nodes.map((node) => node.id));
  const surfaceIds = new Set(snapshot.surfaces.map((surface) => surface.id));
  const cadenceByWorkflow = new Map(cadences.cadences.map((cadence) => [cadence.workflow_id, cadence]));

  for (const workflowId of [
    "crm.followup.forecast",
    "crm.contract.signature",
    "crm.ticket.sla",
    "crm.campaign.lifecycle",
    "crm.lead.nurture",
    "crm.project.handoff"
  ]) {
    assert.ok(cadenceByWorkflow.has(workflowId), `missing cadence for ${workflowId}`);
  }

  for (const cadence of cadences.cadences) {
    const action = actionById.get(cadence.action_id);
    assert.ok(action, `missing action ${cadence.action_id}`);
    assert.ok(workflowIds.has(cadence.workflow_id), `missing workflow ${cadence.workflow_id}`);
    assert.ok(surfaceIds.has(cadence.surface_id), `missing surface ${cadence.surface_id}`);
    assert.equal(cadence.contract_id, action.contract_id);
    assert.equal(cadence.required_permission, action.requires_permission);
    assert.equal(cadence.output_policy.promote_schedule_result_to_workflow, true);
    assert.equal(cadence.output_policy.browser_local_timer, false);
    assert.deepEqual(
      cadence.operation_plan.map((step) => step.id),
      [
        "detect_due_wait_state",
        "emit_forge_schedule_event",
        "execute_runtime_contract",
        "promote_artifacts_and_events",
        "refresh_operating_snapshot"
      ]
    );
  }
});

test("web app snapshot exposes an operational workbench backed by Forge artifacts and events", () => {
  const snapshot = buildCrmWebAppSnapshot({ tenant_id: "demo" });
  const workbench = snapshot.operational_workbench;

  assert.equal(workbench.schema_version, "forge.crm_operational_workbench.v1");
  assert.equal(workbench.state_source, "forge_workflow_artifacts_and_events");
  assert.equal(workbench.mutation_requires_forge, true);

  const panels = new Map(workbench.panels.map((panel) => [panel.id, panel]));
  for (const [panelId, surfaceId] of [
    ["pipeline_kanban", "crm.pipeline-kanban"],
    ["commercial_command", "crm.commercial-command"],
    ["support_queue", "crm.support-queue"],
    ["marketing_calendar", "crm.marketing-calendar"],
    ["document_queue", "crm.document-queue"],
    ["work_queue", "crm.work-queue"],
    ["ai_workbench", "crm.ai-workbench"]
  ]) {
    const panel = panels.get(panelId);
    assert.ok(panel, `missing ${panelId}`);
    assert.equal(panel.surface_id, surfaceId);
    assert.equal(panel.state_source, "forge_workflow_artifacts_and_events");
    assert.equal(panel.mutation_requires_forge, true);
    assert.ok(panel.workflow_ids.length > 0, `${panelId} should be tied to Forge workflows`);
    assert.ok(panel.action_ids.length > 0, `${panelId} should expose Forge command actions`);
  }

  assert.ok(panels.get("pipeline_kanban").lanes.some((lane) => lane.cards.some((card) => card.next_action_id === "crm.move-pipeline-stage")));
  assert.ok(panels.get("commercial_command").forecast.pipeline_value > 0);
  assert.ok(panels.get("commercial_command").commission.plan_action_id === "crm.review-followup-forecast");
  assert.ok(panels.get("commercial_command").goal_commission.action_id === "crm.settle-goal-commission");
  assert.equal(panels.get("commercial_command").goal_commission.contract_id, "crm.commercial.goal_commission.executor");
  assert.ok(panels.get("support_queue").tickets.some((ticket) => ticket.sla_status === "at_risk"));
  assert.ok(panels.get("support_queue").channels.includes("whatsapp"));
  assert.ok(panels.get("support_queue").channel_intake.some((intake) => intake.action_id === "crm.normalize-channel-intake"));
  assert.ok(panels.get("support_queue").channel_intake.every((intake) => intake.contract_id === "crm.support.channel_intake.executor"));
  assert.ok(panels.get("support_queue").message_threads.some((thread) => thread.action_id === "crm.ingest-omnichannel-message"));
  assert.ok(panels.get("support_queue").message_threads.every((thread) => thread.workflow_id === "crm.omnichannel.message"));
  assert.deepEqual(
    panels
      .get("support_queue")
      .message_threads.map((thread) => thread.channel)
      .sort(),
    ["chat", "email", "telegram", "whatsapp"]
  );
  assert.ok(panels.get("support_queue").omnichannel_center.some((center) => center.action_id === "crm.run-omnichannel-center"));
  assert.ok(panels.get("support_queue").omnichannel_center.every((center) => center.contract_id === "crm.support.omnichannel_center.executor"));
  assert.ok(panels.get("marketing_calendar").campaigns.some((campaign) => campaign.next_action_id === "crm.automate-campaign"));
  assert.ok(panels.get("marketing_calendar").segments.some((segment) => segment.action_id === "crm.build-marketing-segment"));
  assert.ok(panels.get("marketing_calendar").segments.every((segment) => segment.contract_id === "crm.marketing.segment_builder.executor"));
  assert.ok(panels.get("marketing_calendar").landing_pages.some((page) => page.publish_action_id === "crm.publish-landing-page"));
  assert.ok(panels.get("marketing_calendar").landing_pages.every((page) => page.contract_id === "crm.marketing.landing_page.executor"));
  assert.ok(panels.get("marketing_calendar").forms.some((form) => form.capture_action_id === "crm.capture-form-submission"));
  assert.ok(panels.get("document_queue").documents.some((document) => document.approval_action_id === "crm.record-document-approval"));
  assert.ok(panels.get("document_queue").library_records.some((record) => record.action_id === "crm.manage-document-library"));
  assert.ok(panels.get("document_queue").library_records.every((record) => record.contract_id === "crm.document.library.executor"));
  assert.ok(panels.get("work_queue").queues.some((queue) => queue.action_id === "crm.run-work-queue"));
  assert.ok(panels.get("work_queue").assignments.every((assignment) => assignment.contract_id === "crm.queue.orchestrator.executor"));
  assert.ok(panels.get("ai_workbench").recommendations.some((recommendation) => recommendation.action_id === "crm.run-operating-copilot"));
  assert.ok(panels.get("ai_workbench").specialized_copilots.some((copilot) => copilot.action_id === "crm.run-area-copilot"));
  assert.ok(panels.get("ai_workbench").executive_reports.some((report) => report.action_id === "crm.generate-executive-report"));
  assert.ok(panels.get("ai_workbench").executive_reports.every((report) => report.contract_id === "crm.analytics.executive_report.executor"));
  assert.ok(panels.get("ai_workbench").memory_promotions.some((promotion) => promotion.action_id === "crm.prepare-memory-promotion"));
});

test("web app snapshot exposes the omnichannel center as a Forge command surface", () => {
  const snapshot = buildCrmWebAppSnapshot({ tenant_id: "demo" });
  const action = snapshot.actions.find((candidate) => candidate.id === "crm.run-omnichannel-center");
  const supportPanel = snapshot.operational_workbench.panels.find((panel) => panel.id === "support_queue");

  assert.ok(action);
  assert.equal(action.surface_id, "crm.support-queue");
  assert.equal(action.contract_id, "crm.support.omnichannel_center.executor");
  assert.equal(action.requires_permission, "crm.omnichannel.ingest");
  assert.deepEqual(action.command_template.slice(0, 3), ["forge", "addons", "execute-executor"]);

  assert.ok(supportPanel);
  assert.ok(supportPanel.action_ids.includes("crm.run-omnichannel-center"));
  assert.ok(supportPanel.workflow_ids.includes("crm.omnichannel.center"));
  assert.ok(supportPanel.omnichannel_center.some((center) => center.center_state === "routing_ready"));
  assert.ok(supportPanel.omnichannel_center.every((center) => center.state_owner === "forge_workflow_runtime"));
});

test("web app snapshot exposes omnichannel message threads before ticket SLA", () => {
  const snapshot = buildCrmWebAppSnapshot({ tenant_id: "demo" });
  const action = snapshot.actions.find((candidate) => candidate.id === "crm.ingest-omnichannel-message");
  const supportPanel = snapshot.operational_workbench.panels.find((panel) => panel.id === "support_queue");

  assert.ok(action);
  assert.equal(action.surface_id, "crm.support-queue");
  assert.equal(action.contract_id, "crm.support.omnichannel_message.executor");
  assert.equal(action.requires_permission, "crm.omnichannel.ingest");
  assert.deepEqual(action.command_template.slice(0, 3), ["forge", "addons", "execute-executor"]);

  assert.ok(supportPanel);
  assert.ok(supportPanel.action_ids.includes("crm.ingest-omnichannel-message"));
  assert.ok(supportPanel.workflow_ids.includes("crm.omnichannel.message"));
  assert.ok(supportPanel.message_threads.length >= 4);
  assert.ok(supportPanel.message_threads.every((thread) => thread.state_owner === "forge_workflow_runtime"));
  assert.ok(supportPanel.message_threads.every((thread) => thread.contract_id === "crm.support.omnichannel_message.executor"));
  assert.ok(supportPanel.message_threads.every((thread) => thread.ticket_workflow_id === "crm.ticket.sla"));
});

test("web app snapshot exposes document library versioning as a Forge command surface", () => {
  const snapshot = buildCrmWebAppSnapshot({ tenant_id: "demo" });
  const action = snapshot.actions.find((candidate) => candidate.id === "crm.manage-document-library");
  const documentPanel = snapshot.operational_workbench.panels.find((panel) => panel.id === "document_queue");

  assert.ok(action);
  assert.equal(action.surface_id, "crm.document-queue");
  assert.equal(action.contract_id, "crm.document.library.executor");
  assert.equal(action.requires_permission, "crm.workflow.mutate");
  assert.deepEqual(action.command_template.slice(0, 3), ["forge", "addons", "execute-executor"]);

  assert.ok(documentPanel);
  assert.ok(documentPanel.action_ids.includes("crm.manage-document-library"));
  assert.ok(documentPanel.workflow_ids.includes("crm.document.library"));
  assert.ok(documentPanel.artifact_types.includes("crm_document_version"));
  assert.ok(documentPanel.library_records.some((record) => record.version_state === "approval_wait"));
  assert.ok(documentPanel.library_records.every((record) => record.state_owner === "forge_workflow_runtime"));
  assert.ok(documentPanel.library_records.every((record) => record.action_id === "crm.manage-document-library"));
});

test("web app snapshot exposes goal and commission settlement as a Forge commercial workbench", () => {
  const snapshot = buildCrmWebAppSnapshot({ tenant_id: "demo" });
  const action = snapshot.actions.find((candidate) => candidate.id === "crm.settle-goal-commission");
  const commercialPanel = snapshot.operational_workbench.panels.find((panel) => panel.id === "commercial_command");
  const workbench = snapshot.goal_commission_workbench;

  assert.ok(action);
  assert.equal(action.surface_id, "crm.commercial-command");
  assert.equal(action.contract_id, "crm.commercial.goal_commission.executor");
  assert.equal(action.requires_permission, "crm.workflow.mutate");
  assert.deepEqual(action.command_template.slice(0, 3), ["forge", "addons", "execute-executor"]);

  assert.ok(commercialPanel);
  assert.ok(commercialPanel.action_ids.includes("crm.settle-goal-commission"));
  assert.ok(commercialPanel.workflow_ids.includes("crm.goal.commission"));

  assert.ok(workbench);
  assert.equal(workbench.schema_version, "forge.crm_goal_commission_workbench.v1");
  assert.equal(workbench.workflow_id, "crm.goal.commission");
  assert.equal(workbench.contract_id, "crm.commercial.goal_commission.executor");
  assert.equal(workbench.state_owner, "forge_workflow_runtime");
  assert.equal(workbench.local_state_allowed, false);
  assert.ok(workbench.goal_targets.length >= 2);
  assert.ok(workbench.revenue_events.every((event) => event.contract_artifact_ref));
  assert.ok(workbench.commission_statements.every((statement) => statement.payout_allowed === false));
  assert.ok(workbench.validation_gates.some((gate) => gate.includes("revenue event lineage")));
});

test("web app snapshot exposes cross-domain work queues as Forge command surfaces", () => {
  const snapshot = buildCrmWebAppSnapshot({ tenant_id: "demo" });
  const workQueue = snapshot.operational_workbench.panels.find((panel) => panel.id === "work_queue");

  assert.ok(workQueue);
  assert.equal(workQueue.surface_id, "crm.work-queue");
  assert.equal(workQueue.state_owner, "forge_workflow_runtime");
  assert.ok(workQueue.action_ids.includes("crm.run-work-queue"));
  assert.ok(workQueue.queue_modes.includes("approvals"));
  assert.ok(workQueue.queue_modes.includes("sla"));
  assert.ok(workQueue.queue_modes.includes("documents"));
  assert.ok(workQueue.risk_summary.risk_item_count > 0);
  assert.ok(workQueue.queues.every((queue) => queue.workflow_ids.length > 0));
  assert.ok(workQueue.assignments.every((assignment) => assignment.requires_forge_approval === true));
  assert.ok(snapshot.actions.some((action) => action.id === "crm.run-work-queue" && action.contract_id === "crm.queue.orchestrator.executor"));
});

test("web app snapshot exposes Forge-owned design system tokens and components", () => {
  const snapshot = buildCrmWebAppSnapshot({ tenant_id: "demo" });
  const designSystem = snapshot.design_system;

  assert.ok(designSystem);
  assert.equal(designSystem.schema_version, "forge.crm_design_system.v1");
  assert.equal(designSystem.workflow_id, "crm.design.system");
  assert.equal(designSystem.contract_id, "crm.design_system.executor");
  assert.equal(designSystem.design_system, "penpot_open_design_inspired_tokens");
  assert.equal(designSystem.state_source, "forge_workflow_artifacts_and_events");
  assert.equal(designSystem.direct_browser_persistence, false);
  assert.ok(designSystem.artifact_types.includes("crm_design_system"));
  assert.ok(designSystem.artifact_types.includes("crm_design_token_manifest"));
  assert.ok(designSystem.components.some((component) => component.id === "workflow_node"));
  assert.ok(designSystem.components.some((component) => component.id === "queue_card"));
  assert.ok(snapshot.actions.some((action) => action.id === "crm.generate-design-system" && action.contract_id === "crm.design_system.executor"));
});

test("web app snapshot exposes specialized CRM area copilots in the AI workbench", () => {
  const snapshot = buildCrmWebAppSnapshot({ tenant_id: "demo" });
  const aiPanel = snapshot.operational_workbench.panels.find((panel) => panel.id === "ai_workbench");

  assert.ok(aiPanel);
  assert.equal(aiPanel.surface_id, "crm.ai-workbench");
  assert.ok(aiPanel.action_ids.includes("crm.run-area-copilot"));
  assert.deepEqual(
    aiPanel.specialized_copilots.map((copilot) => copilot.area).sort(),
    ["commercial", "documents", "marketing", "operations", "support"]
  );
  assert.ok(aiPanel.specialized_copilots.every((copilot) => copilot.state_owner === "forge_workflow_runtime"));
  assert.ok(aiPanel.specialized_copilots.every((copilot) => copilot.contract_id === "crm.ai.area_copilot.executor"));
  assert.ok(snapshot.actions.some((action) => action.id === "crm.run-area-copilot" && action.contract_id === "crm.ai.area_copilot.executor"));
});

test("web app snapshot exposes executive reporting as a Forge-owned business review workbench", () => {
  const snapshot = buildCrmWebAppSnapshot({ tenant_id: "demo" });
  const action = snapshot.actions.find((candidate) => candidate.id === "crm.generate-executive-report");
  const aiPanel = snapshot.operational_workbench.panels.find((panel) => panel.id === "ai_workbench");
  const workbench = snapshot.executive_reporting_workbench;

  assert.ok(action);
  assert.equal(action.surface_id, "crm.ai-workbench");
  assert.equal(action.contract_id, "crm.analytics.executive_report.executor");
  assert.equal(action.requires_permission, "crm.observability.inspect");
  assert.deepEqual(action.command_template.slice(0, 3), ["forge", "addons", "execute-executor"]);

  assert.ok(aiPanel);
  assert.ok(aiPanel.action_ids.includes("crm.generate-executive-report"));
  assert.ok(aiPanel.workflow_ids.includes("crm.executive.reporting"));

  assert.ok(workbench);
  assert.equal(workbench.schema_version, "forge.crm_executive_reporting_workbench.v1");
  assert.equal(workbench.workflow_id, "crm.executive.reporting");
  assert.equal(workbench.contract_id, "crm.analytics.executive_report.executor");
  assert.equal(workbench.state_owner, "forge_workflow_runtime");
  assert.equal(workbench.local_state_allowed, false);
  assert.equal(workbench.external_analytics_database_required, false);
  assert.ok(workbench.kpis.length >= 8);
  assert.ok(workbench.kpis.some((kpi) => kpi.id === "pipeline_value"));
  assert.ok(workbench.business_reviews.some((review) => review.artifact_type === "crm_business_review_report"));
  assert.ok(workbench.executive_summaries.every((summary) => summary.artifact_type === "crm_executive_summary"));
  assert.ok(workbench.validation_gates.some((gate) => gate.includes("Forge workflow artifacts and events")));
});

test("web app snapshot exposes adaptive workflow evolution as Forge-governed experiments", () => {
  const snapshot = buildCrmWebAppSnapshot({ tenant_id: "demo" });
  const workbench = snapshot.workflow_evolution_workbench;

  assert.equal(workbench.schema_version, "forge.crm_workflow_evolution_workbench.v1");
  assert.equal(workbench.state_source, "forge_improve_candidates_and_benchmarks");
  assert.equal(workbench.local_self_modification_allowed, false);
  assert.equal(workbench.workflow_id, "crm.workflow.evolution");
  assert.ok(workbench.evolution_loop.operation_plan.map((step) => step.id).includes("benchmark_candidate"));
  assert.ok(workbench.evolution_loop.operation_plan.map((step) => step.id).includes("promote_only_after_validation"));
  assert.ok(workbench.candidates.some((candidate) => candidate.target_workflow_id === "crm.ticket.sla"));
  assert.ok(workbench.candidates.every((candidate) => candidate.rollback_plan));
  assert.ok(workbench.benchmark_queue.every((benchmark) => benchmark.command_template[0] === "forge"));
  assert.ok(workbench.promotion_gates.every((gate) => gate.required_before_promotion === true));

  const action = snapshot.actions.find((candidate) => candidate.id === "crm.evolve-workflow");
  assert.ok(action);
  assert.equal(action.contract_id, "crm.workflow.evolution.executor");
  assert.equal(action.requires_permission, "crm.workflow.mutate");
});

test("web app snapshot exposes an enterprise journey workbench for end-to-end CRM acceptance", () => {
  const snapshot = buildCrmWebAppSnapshot({ tenant_id: "demo" });
  const workbench = snapshot.enterprise_journey_workbench;

  assert.ok(workbench);
  assert.equal(workbench.schema_version, "forge.crm_enterprise_journey_workbench.v1");
  assert.equal(workbench.state_owner, "forge_workflow_runtime");
  assert.equal(workbench.local_state_allowed, false);
  assert.equal(workbench.workflow_id, "crm.enterprise.customer_journey");
  assert.equal(workbench.contract_id, "crm.enterprise.journey.executor");
  assert.equal(workbench.action_id, "crm.run-enterprise-journey");
  assert.deepEqual(
    workbench.stage_lanes.map((lane) => lane.id),
    ["lead_capture", "opportunity", "proposal", "contract", "account", "support", "handoff"]
  );
  assert.ok(workbench.acceptance_gates.every((gate) => gate.owner === "Forge validation"));

  const action = snapshot.actions.find((candidate) => candidate.id === "crm.run-enterprise-journey");
  assert.ok(action);
  assert.equal(action.contract_id, "crm.enterprise.journey.executor");
});

test("web app snapshot exposes CRM subworkflow orchestration through Forge child workflow bindings", () => {
  const snapshot = buildCrmWebAppSnapshot({ tenant_id: "demo" });
  const workbench = snapshot.subworkflow_orchestration_workbench;

  assert.ok(workbench);
  assert.equal(workbench.schema_version, "forge.crm_subworkflow_orchestration_workbench.v1");
  assert.equal(workbench.state_owner, "forge_workflow_runtime");
  assert.equal(workbench.local_state_allowed, false);
  assert.equal(workbench.workflow_id, "crm.subworkflow.orchestration");
  assert.equal(workbench.contract_id, "crm.workflow.subworkflow_orchestrator.executor");
  assert.equal(workbench.action_id, "crm.orchestrate-subworkflows");
  assert.equal(workbench.parent_workflow_id, "crm.enterprise.customer_journey");
  assert.ok(workbench.child_bindings.length >= 4);
  assert.ok(workbench.child_bindings.every((binding) => binding.validation_gate));
  assert.ok(workbench.promotion_gates.every((gate) => gate.owner === "Forge validation"));

  const action = snapshot.actions.find((candidate) => candidate.id === "crm.orchestrate-subworkflows");
  assert.ok(action);
  assert.equal(action.contract_id, "crm.workflow.subworkflow_orchestrator.executor");
  assert.equal(action.requires_permission, "crm.workflow.mutate");
});

test("web app snapshot exposes a Forge-owned workflow automation designer", () => {
  const snapshot = buildCrmWebAppSnapshot({ tenant_id: "demo" });
  const workbench = snapshot.workflow_automation_designer_workbench;

  assert.ok(workbench);
  assert.equal(workbench.schema_version, "forge.crm_workflow_automation_designer_workbench.v1");
  assert.equal(workbench.state_owner, "forge_workflow_runtime");
  assert.equal(workbench.local_state_allowed, false);
  assert.equal(workbench.workflow_id, "crm.workflow.automation_design");
  assert.equal(workbench.contract_id, "crm.workflow.automation_designer.executor");
  assert.equal(workbench.action_id, "crm.design-workflow-automation");
  assert.ok(workbench.trigger_palette.length >= 3);
  assert.ok(workbench.action_palette.some((action) => action.contract_id === "crm.queue.orchestrator.executor"));
  assert.ok(workbench.rule_graph.nodes.some((node) => node.kind === "trigger"));
  assert.ok(workbench.rule_graph.nodes.some((node) => node.kind === "condition"));
  assert.ok(workbench.rule_graph.nodes.some((node) => node.kind === "action"));
  assert.ok(workbench.validation_gates.every((gate) => gate.owner === "Forge validation"));

  const action = snapshot.actions.find((candidate) => candidate.id === "crm.design-workflow-automation");
  assert.ok(action);
  assert.equal(action.contract_id, "crm.workflow.automation_designer.executor");
  assert.equal(action.requires_permission, "crm.workflow.mutate");
});

test("web assets mount the generated CRM snapshot without a build step", async () => {
  const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../web/app.js", import.meta.url), "utf8");
  const styles = await readFile(new URL("../web/styles.css", import.meta.url), "utf8");
  const favicon = await readFile(new URL("../web/favicon.svg", import.meta.url), "utf8");

  assert.match(html, /id="crm-app"/);
  assert.match(html, /data-snapshot-src="\.\/data\/operating-snapshot\.json"/);
  assert.match(html, /rel="icon"/);
  assert.match(html, /\.\/favicon\.svg/);
  assert.match(html, /web\/app\.js|\.\/app\.js/);
  assert.match(app, /renderWorkflowGraph/);
  assert.match(app, /renderRelationshipProfiles/);
  assert.match(app, /renderKnowledgeGraph/);
  assert.match(app, /renderDocumentQueue/);
  assert.match(app, /renderPipelineKanban/);
  assert.match(app, /renderCommercialCommand/);
  assert.match(app, /renderSupportQueue/);
  assert.match(app, /renderMarketingCalendar/);
  assert.match(app, /renderAiWorkbench/);
  assert.match(app, /specialized_copilots/);
  assert.match(app, /renderActionInvocationPlans/);
  assert.match(app, /renderWorkflowCadences/);
  assert.match(app, /renderWorkflowEvolutionWorkbench/);
  assert.match(app, /renderEnterpriseJourneyWorkbench/);
  assert.match(app, /renderSubworkflowOrchestrationWorkbench/);
  assert.match(app, /renderWorkflowAutomationDesignerWorkbench/);
  assert.match(app, /renderGoalCommissionWorkbench/);
  assert.match(app, /renderExecutiveReportingWorkbench/);
  assert.match(styles, /\.workflow-node/);
  assert.match(styles, /\.relationship-profile/);
  assert.match(styles, /\.knowledge-node/);
  assert.match(styles, /\.document-row/);
  assert.match(styles, /\.pipeline-board/);
  assert.match(styles, /\.commercial-command/);
  assert.match(styles, /\.support-queue/);
  assert.match(styles, /\.marketing-calendar/);
  assert.match(styles, /\.ai-workbench/);
  assert.match(styles, /\.area-copilot/);
  assert.match(styles, /\.action-plan/);
  assert.match(styles, /\.cadence-row/);
  assert.match(styles, /\.evolution-workbench/);
  assert.match(styles, /\.journey-workbench/);
  assert.match(styles, /\.subworkflow-workbench/);
  assert.match(styles, /\.automation-designer/);
  assert.match(styles, /\.goal-commission/);
  assert.match(styles, /\.executive-reporting/);
  assert.match(favicon, /<svg/);
});

test("web snapshot generator honors the tenant argument when printing JSON", async () => {
  const { stdout } = await execFileAsync("node", ["scripts/generate-crm-web-snapshot.mjs", "demo"], {
    cwd: new URL("..", import.meta.url)
  });
  const snapshot = JSON.parse(stdout);

  assert.equal(snapshot.schema_version, "forge.crm_web_app_snapshot.v1");
  assert.equal(snapshot.tenant_id, "demo");
});
