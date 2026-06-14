const root = document.querySelector("#crm-app");
const snapshotSource = root?.dataset.snapshotSrc || "./data/operating-snapshot.json";

function text(value, fallback = "") {
  return value === undefined || value === null ? fallback : String(value);
}

function compactTitle(value) {
  return text(value).replace(/_/g, " ");
}

function nodeElement(tag, className, content) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (content !== undefined) {
    element.textContent = content;
  }
  return element;
}

function metric(label, value) {
  const item = nodeElement("div", "metric");
  item.append(nodeElement("span", "metric-label", label));
  item.append(nodeElement("strong", "metric-value", value));
  return item;
}

function renderHeader(snapshot) {
  const header = nodeElement("header", "app-header");
  const titleBlock = nodeElement("div", "title-block");
  titleBlock.append(nodeElement("span", "eyebrow", "Forge Addon"));
  titleBlock.append(nodeElement("h1", "", "Forge CRM"));
  titleBlock.append(
    nodeElement(
      "p",
      "subtitle",
      `Tenant ${snapshot.tenant_id} operated from ${snapshot.local_state_policy.state_owner}; browser persistence is disabled.`
    )
  );

  const metrics = nodeElement("div", "metrics");
  metrics.append(metric("Workflows", snapshot.metrics.workflow_count));
  metrics.append(metric("Surfaces", snapshot.metrics.surface_count));
  metrics.append(metric("Artifacts", snapshot.metrics.artifact_type_count));
  metrics.append(metric("Scope", snapshot.metrics.complete_scope ? "Complete" : "Open"));

  header.append(titleBlock, metrics);
  return header;
}

function renderSurfaceRail(snapshot) {
  const rail = nodeElement("nav", "surface-rail");
  rail.setAttribute("aria-label", "CRM surfaces");
  for (const surface of snapshot.surfaces) {
    const button = nodeElement("button", "surface-button");
    button.type = "button";
    button.dataset.surface = surface.id;
    button.title = `${surface.title} uses ${surface.workflow_ids.length} Forge workflows`;
    button.append(nodeElement("span", "surface-mark", surface.title.slice(0, 1).toUpperCase()));
    button.append(nodeElement("span", "surface-title", surface.title));
    rail.append(button);
  }
  return rail;
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency"
  }).format(Number(value || 0));
}

function workbenchPanel(snapshot, panelId) {
  return snapshot.operational_workbench?.panels.find((panel) => panel.id === panelId);
}

function actionLabel(snapshot, actionId) {
  return snapshot.actions.find((action) => action.id === actionId)?.label || actionId;
}

function actionPlan(snapshot, actionId) {
  return snapshot.action_invocation_plans?.plans.find((plan) => plan.action_id === actionId);
}

function actionStrip(snapshot, panel) {
  const strip = nodeElement("div", "action-strip");
  for (const actionId of panel.action_ids || []) {
    const item = nodeElement("span", "action-chip", actionLabel(snapshot, actionId));
    item.title = actionId;
    strip.append(item);
  }
  return strip;
}

function panelShell(snapshot, panelId, className) {
  const panel = workbenchPanel(snapshot, panelId);
  const section = nodeElement("section", `panel workbench-panel ${className}`);
  if (!panel) {
    section.append(nodeElement("h2", "", compactTitle(panelId)));
    section.append(nodeElement("p", "muted-copy", "Panel unavailable in this snapshot."));
    return { section, panel: null };
  }

  section.dataset.surfacePanel = panel.surface_id;
  section.append(nodeElement("h2", "", panel.title));
  section.append(nodeElement("p", "panel-source", `${panel.workflow_ids.length} Forge workflows · ${panel.state_source}`));
  section.append(actionStrip(snapshot, panel));
  return { section, panel };
}

export function renderWorkflowGraph(snapshot) {
  const section = nodeElement("section", "panel workflow-panel");
  section.append(nodeElement("h2", "", "Workflow Graph"));

  const graph = nodeElement("div", "workflow-graph");
  for (const node of snapshot.workflow_graph.nodes) {
    const item = nodeElement("article", `workflow-node domain-${node.domain}`);
    item.dataset.workflow = node.id;
    item.append(nodeElement("span", "node-domain", node.domain));
    item.append(nodeElement("h3", "", node.title));
    item.append(nodeElement("p", "", `${node.state_count} states · ${node.artifact_types.length} artifact types`));
    graph.append(item);
  }

  const edgeList = nodeElement("ol", "edge-list");
  for (const edge of snapshot.workflow_graph.edges) {
    const item = nodeElement("li", "edge-row");
    item.textContent = `${edge.from} -> ${edge.to}: ${edge.reason}`;
    edgeList.append(item);
  }

  section.append(graph, edgeList);
  return section;
}

export function renderKnowledgeGraph(snapshot) {
  const section = nodeElement("section", "panel knowledge-panel");
  section.append(nodeElement("h2", "", "Knowledge & Relationships"));

  const graph = nodeElement("div", "knowledge-graph");
  for (const node of snapshot.knowledge_graph.nodes) {
    const item = nodeElement("article", `knowledge-node kind-${node.kind}`);
    item.append(nodeElement("span", "node-kind", node.kind));
    item.append(nodeElement("strong", "", node.label));
    item.append(nodeElement("small", "", node.source_workflow));
    graph.append(item);
  }

  const relations = nodeElement("ul", "relation-list");
  for (const edge of snapshot.knowledge_graph.edges) {
    const item = nodeElement("li", "relation-row");
    item.textContent = `${edge.from} ${edge.relation} ${edge.to}`;
    relations.append(item);
  }

  const profiles = nodeElement("div", "relationship-profile-list");
  for (const profile of snapshot.knowledge_graph.enrichment_profiles || []) {
    const item = nodeElement("article", "relationship-profile");
    item.append(nodeElement("strong", "", profile.label));
    item.append(nodeElement("span", "", `${compactTitle(profile.entity_kind)} · ${compactTitle(profile.state)} · ${profile.source_count} sources`));
    item.append(nodeElement("code", "", actionLabel(snapshot, profile.action_id)));
    item.title = profile.artifact_ref;
    profiles.append(item);
  }

  section.append(graph, relations, profiles);
  return section;
}

export function renderRelationshipProfiles(snapshot) {
  const { section, panel } = panelShell(snapshot, "relationship_graph", "relationship-panel");
  if (!panel) {
    return section;
  }

  const profiles = nodeElement("div", "relationship-profile-list");
  for (const profile of panel.profiles || []) {
    const item = nodeElement("article", "relationship-profile");
    item.append(nodeElement("strong", "", `${profile.entity_id} · ${profile.account}`));
    item.append(
      nodeElement(
        "span",
        "",
        `${compactTitle(profile.entity_kind)} · ${compactTitle(profile.state)} · ${profile.relationship_signal_count} signals`
      )
    );
    item.append(nodeElement("code", "", actionLabel(snapshot, profile.action_id)));
    item.title = profile.contract_id;
    profiles.append(item);
  }

  section.append(profiles);
  return section;
}

export function renderPipelineKanban(snapshot) {
  const { section, panel } = panelShell(snapshot, "pipeline_kanban", "pipeline-panel");
  if (!panel) {
    return section;
  }

  const board = nodeElement("div", "pipeline-board");
  for (const lane of panel.lanes) {
    const laneElement = nodeElement("section", "pipeline-lane");
    laneElement.append(nodeElement("h3", "", compactTitle(lane.title)));
    laneElement.append(nodeElement("span", "lane-count", `${lane.cards.length} open`));
    for (const card of lane.cards) {
      const item = nodeElement("article", "pipeline-card");
      item.append(nodeElement("strong", "", card.account));
      item.append(nodeElement("span", "", `${card.opportunity_id} · ${money(card.amount)} · ${Math.round(card.probability * 100)}%`));
      item.append(nodeElement("small", "", `${compactTitle(card.current_state)} -> ${compactTitle(card.next_state)}`));
      item.append(nodeElement("code", "", actionLabel(snapshot, card.next_action_id)));
      item.title = card.validation_gate;
      laneElement.append(item);
    }
    board.append(laneElement);
  }
  section.append(board);
  return section;
}

export function renderCommercialCommand(snapshot) {
  const { section, panel } = panelShell(snapshot, "commercial_command", "commercial-command");
  if (!panel) {
    return section;
  }

  const summary = nodeElement("div", "command-summary");
  summary.append(metric("Pipeline", money(panel.forecast.pipeline_value)));
  summary.append(metric("Weighted", money(panel.forecast.weighted_value)));
  summary.append(metric("Goal", money(panel.forecast.goal_value)));
  summary.append(metric("Commission", money(panel.commission.accrued_value)));
  if (panel.goal_commission) {
    summary.append(metric("Attainment", `${panel.goal_commission.attainment_percent}%`));
  }

  const contracts = nodeElement("div", "commercial-list");
  for (const contract of panel.contracts) {
    const item = nodeElement("article", "commercial-row");
    item.append(nodeElement("strong", "", contract.account));
    item.append(nodeElement("span", "", `${compactTitle(contract.state)} · ${money(contract.amount)}`));
    item.append(nodeElement("code", "", actionLabel(snapshot, contract.next_action_id)));
    contracts.append(item);
  }

  const accounts = nodeElement("div", "commercial-list account-list");
  for (const account of panel.accounts) {
    const item = nodeElement("article", "commercial-row");
    item.append(nodeElement("strong", "", account.account));
    item.append(nodeElement("span", "", `Health ${account.health_score} · ${compactTitle(account.renewal_state)}`));
    item.append(nodeElement("code", "", actionLabel(snapshot, account.next_action_id)));
    accounts.append(item);
  }

  const settlement = nodeElement("div", "commercial-list goal-commission-inline");
  if (panel.goal_commission) {
    const item = nodeElement("article", "commercial-row");
    item.append(nodeElement("strong", "", `Settlement ${panel.goal_commission.period}`));
    item.append(
      nodeElement(
        "span",
        "",
        `${money(panel.goal_commission.recognized_revenue_amount)} recognized · ${compactTitle(panel.goal_commission.statement_state)}`
      )
    );
    item.append(nodeElement("code", "", actionLabel(snapshot, panel.goal_commission.action_id)));
    settlement.append(item);
  }

  section.append(summary, contracts, accounts, settlement);
  return section;
}

export function renderSupportQueue(snapshot) {
  const { section, panel } = panelShell(snapshot, "support_queue", "support-queue");
  if (!panel) {
    return section;
  }

  const channels = nodeElement("div", "channel-strip");
  for (const channel of panel.channels) {
    channels.append(nodeElement("span", "channel-chip", channel));
  }

  const intakes = nodeElement("div", "channel-intake-list");
  for (const intake of panel.channel_intake || []) {
    const item = nodeElement("article", `channel-intake state-${intake.intake_state}`);
    item.append(nodeElement("strong", "", `${intake.channel} · ${intake.provider}`));
    item.append(nodeElement("span", "", `${compactTitle(intake.intake_state)} · ${intake.ticket_creation_allowed ? "ticket ready" : "authorization wait"}`));
    item.append(nodeElement("code", "", actionLabel(snapshot, intake.action_id)));
    intakes.append(item);
  }

  const centers = nodeElement("div", "omnichannel-center-list");
  for (const center of panel.omnichannel_center || []) {
    const item = nodeElement("article", `omnichannel-center-row state-${center.center_state || center.state}`);
    item.append(nodeElement("strong", "", center.account || center.center_id));
    item.append(
      nodeElement(
        "span",
        "",
        `${(center.channels || []).length} channels · ${center.unified_conversation_count} conversations · ${compactTitle(center.center_state || center.state)}`
      )
    );
    item.append(nodeElement("code", "", actionLabel(snapshot, center.action_id)));
    centers.append(item);
  }

  const threads = nodeElement("div", "message-thread-list");
  for (const thread of panel.message_threads || []) {
    const item = nodeElement("article", `message-thread state-${thread.thread_state}`);
    item.append(nodeElement("strong", "", `${thread.account || thread.thread_id} · ${thread.channel}`));
    item.append(
      nodeElement(
        "span",
        "",
        `${thread.message_count} messages · ${compactTitle(thread.thread_state)} · ${thread.ticket_workflow_id}`
      )
    );
    item.append(nodeElement("code", "", actionLabel(snapshot, thread.action_id)));
    threads.append(item);
  }

  const tickets = nodeElement("div", "support-ticket-list");
  for (const ticket of panel.tickets) {
    const item = nodeElement("article", `support-ticket status-${ticket.sla_status}`);
    item.append(nodeElement("strong", "", `${ticket.ticket_id} · ${ticket.account}`));
    item.append(nodeElement("span", "", `${ticket.channel} · ${compactTitle(ticket.state)} · ${ticket.minutes_to_breach} min`));
    item.append(nodeElement("code", "", actionLabel(snapshot, ticket.action_id)));
    tickets.append(item);
  }

  section.append(channels, intakes, threads, centers, tickets);
  return section;
}

export function renderMarketingCalendar(snapshot) {
  const { section, panel } = panelShell(snapshot, "marketing_calendar", "marketing-calendar");
  if (!panel) {
    return section;
  }

  const segments = nodeElement("div", "segment-list");
  for (const segment of panel.segments || []) {
    const item = nodeElement("article", `segment-row state-${segment.state}`);
    item.append(nodeElement("strong", "", segment.name || segment.segment_id));
    item.append(nodeElement("span", "", `${segment.audience_count} leads · ${compactTitle(segment.state)}`));
    item.append(nodeElement("code", "", actionLabel(snapshot, segment.action_id)));
    segments.append(item);
  }

  const campaigns = nodeElement("div", "campaign-grid");
  for (const campaign of panel.campaigns) {
    const item = nodeElement("article", "campaign-row");
    item.append(nodeElement("strong", "", campaign.campaign_id));
    item.append(nodeElement("span", "", `${campaign.segment} · ${compactTitle(campaign.state)} · ${campaign.launch_window}`));
    item.append(nodeElement("code", "", actionLabel(snapshot, campaign.next_action_id)));
    campaigns.append(item);
  }

  const landingPages = nodeElement("div", "landing-page-list");
  for (const page of panel.landing_pages || []) {
    const item = nodeElement("article", "landing-page-row");
    item.append(nodeElement("strong", "", page.landing_page_id));
    item.append(nodeElement("span", "", `${compactTitle(page.publication_state)} · ${page.form_schema_artifact_type}`));
    item.append(nodeElement("code", "", actionLabel(snapshot, page.publish_action_id)));
    landingPages.append(item);
  }

  const forms = nodeElement("div", "form-list");
  for (const form of panel.forms) {
    const item = nodeElement("article", "form-row");
    item.append(nodeElement("strong", "", form.landing_page));
    item.append(nodeElement("span", "", `${form.pending_submissions} pending submissions`));
    item.append(nodeElement("code", "", actionLabel(snapshot, form.capture_action_id)));
    forms.append(item);
  }

  section.append(segments, campaigns, landingPages, forms);
  return section;
}

export function renderDocumentQueue(snapshot) {
  const section = nodeElement("section", "panel document-panel");
  section.append(nodeElement("h2", "", "Document Queue"));
  const panel = workbenchPanel(snapshot, "document_queue");

  const lanes = nodeElement("div", "document-lanes");
  for (const lane of snapshot.document_queue.lanes) {
    const item = nodeElement("article", "document-row");
    item.append(nodeElement("strong", "", compactTitle(lane.title)));
    item.append(nodeElement("span", "", `${lane.workflow_ids.length} workflows`));
    lanes.append(item);
  }

  const artifactLine = nodeElement("p", "artifact-line", snapshot.document_queue.artifact_types.join(" · "));
  section.append(lanes, artifactLine);

  if (panel?.documents?.length) {
    const documents = nodeElement("div", "document-table");
    for (const documentItem of panel.documents) {
      const item = nodeElement("article", "document-item document-row");
      item.append(nodeElement("strong", "", documentItem.document_id));
      item.append(nodeElement("span", "", `${documentItem.type} · ${compactTitle(documentItem.state)}`));
      item.append(nodeElement("code", "", actionLabel(snapshot, documentItem.approval_action_id)));
      documents.append(item);
    }
    section.dataset.surfacePanel = panel.surface_id;
    section.append(documents);
  }

  if (panel?.library_records?.length) {
    const records = nodeElement("div", "document-library-list");
    for (const record of panel.library_records) {
      const item = nodeElement("article", "document-library-record document-row");
      item.append(nodeElement("strong", "", record.version_id));
      item.append(nodeElement("span", "", `${record.collection_id} · ${compactTitle(record.version_state)}`));
      item.append(nodeElement("code", "", actionLabel(snapshot, record.action_id)));
      item.title = record.artifact_ref;
      records.append(item);
    }
    section.dataset.surfacePanel = panel.surface_id;
    section.append(records);
  }

  return section;
}

export function renderWorkQueue(snapshot) {
  const { section, panel } = panelShell(snapshot, "work_queue", "work-queue");
  if (!panel) {
    return section;
  }

  const summary = nodeElement("div", "command-summary");
  summary.append(metric("Queues", panel.queue_modes.length));
  summary.append(metric("Risk items", panel.risk_summary.risk_item_count));
  summary.append(metric("Ownership gaps", panel.risk_summary.ownership_gap_count));

  const queues = nodeElement("div", "work-queue-grid");
  for (const queue of panel.queues) {
    const item = nodeElement("article", "work-queue-card");
    item.append(nodeElement("strong", "", compactTitle(queue.title)));
    item.append(nodeElement("span", "", `${queue.item_count} items · ${queue.risk_item_count} risks`));
    item.append(nodeElement("small", "", `${queue.workflow_ids.length} workflows`));
    item.append(nodeElement("code", "", actionLabel(snapshot, queue.action_id)));
    queues.append(item);
  }

  const assignments = nodeElement("div", "assignment-list");
  for (const assignment of panel.assignments) {
    const item = nodeElement("article", "assignment-row");
    item.append(nodeElement("strong", "", compactTitle(assignment.queue)));
    item.append(nodeElement("span", "", assignment.owner));
    item.append(nodeElement("code", "", assignment.contract_id));
    assignments.append(item);
  }

  section.append(summary, queues, assignments);
  return section;
}

export function renderDailyOperatingCycle(snapshot) {
  const workbench = snapshot.daily_operating_cycle_workbench;
  const section = nodeElement("section", "panel daily-cycle");
  section.dataset.surfacePanel = "crm.work-queue";
  section.append(nodeElement("h2", "", "Daily Operating Cycle"));
  if (!workbench) {
    section.append(nodeElement("p", "muted-copy", "Daily operating cycle unavailable in this snapshot."));
    return section;
  }

  section.append(nodeElement("p", "panel-source", `${workbench.workflow_id} · ${workbench.contract_id}`));
  section.append(nodeElement("code", "", actionLabel(snapshot, workbench.action_id)));

  const summary = nodeElement("div", "daily-domain-grid");
  for (const domain of workbench.domain_summaries || []) {
    const item = nodeElement("article", "daily-domain");
    item.append(nodeElement("strong", "", compactTitle(domain.domain)));
    item.append(nodeElement("span", "", `${domain.command_count} commands · ${domain.risk_count} risks`));
    item.append(nodeElement("small", "", domain.workflow_id));
    summary.append(item);
  }

  const commands = nodeElement("div", "daily-command-list");
  for (const command of workbench.command_queue || []) {
    const item = nodeElement("article", "daily-command");
    item.append(nodeElement("strong", "", command.title));
    item.append(nodeElement("span", "", `${compactTitle(command.domain)} · ${compactTitle(command.state)} · ${command.owner}`));
    item.append(nodeElement("code", "", actionLabel(snapshot, command.action_id)));
    item.title = `${command.contract_id} · ${command.command_owner}`;
    commands.append(item);
  }

  const risks = nodeElement("div", "daily-risk-list");
  for (const risk of workbench.risk_register || []) {
    const item = nodeElement("article", `daily-risk severity-${risk.severity}`);
    item.append(nodeElement("strong", "", compactTitle(risk.domain)));
    item.append(nodeElement("span", "", `${compactTitle(risk.severity)} · ${risk.owner}`));
    item.append(nodeElement("small", "", risk.closure_policy));
    risks.append(item);
  }

  section.append(summary, commands, risks);
  return section;
}

export function renderDesignSystem(snapshot) {
  const designSystem = snapshot.design_system;
  const section = nodeElement("section", "panel design-system-panel");
  section.dataset.surfacePanel = "crm.design-system";
  section.append(nodeElement("h2", "", "Design System"));
  if (!designSystem) {
    section.append(nodeElement("p", "muted-copy", "Design system unavailable in this snapshot."));
    return section;
  }

  section.append(nodeElement("p", "panel-source", `${designSystem.workflow_id} · ${designSystem.contract_id}`));

  const swatches = nodeElement("div", "token-grid");
  for (const [name, value] of Object.entries(designSystem.tokens.color || {})) {
    const item = nodeElement("article", "token-swatch");
    const swatch = nodeElement("span", "swatch-color");
    swatch.style.background = value;
    item.append(swatch, nodeElement("strong", "", name), nodeElement("code", "", value));
    swatches.append(item);
  }

  const components = nodeElement("div", "component-catalog");
  for (const component of designSystem.components || []) {
    const item = nodeElement("article", "component-row");
    item.append(nodeElement("strong", "", component.title));
    item.append(nodeElement("span", "", component.surface_ids.join(" · ")));
    item.append(nodeElement("code", "", component.state_source));
    components.append(item);
  }

  section.append(swatches, components);
  return section;
}

export function renderAiWorkbench(snapshot) {
  const { section, panel } = panelShell(snapshot, "ai_workbench", "ai-workbench");
  if (!panel) {
    return section;
  }

  const recommendations = nodeElement("div", "ai-recommendation-list");
  for (const recommendation of panel.recommendations) {
    const item = nodeElement("article", "ai-recommendation");
    item.append(nodeElement("strong", "", compactTitle(recommendation.kind)));
    item.append(nodeElement("span", "", `${compactTitle(recommendation.state)} · ${recommendation.evidence_artifact_type}`));
    item.append(nodeElement("code", "", actionLabel(snapshot, recommendation.action_id)));
    recommendations.append(item);
  }

  const areaCopilots = nodeElement("div", "area-copilot-list");
  for (const copilot of panel.specialized_copilots || []) {
    const item = nodeElement("article", "area-copilot");
    item.append(nodeElement("strong", "", copilot.title || compactTitle(copilot.area)));
    item.append(nodeElement("span", "", `${compactTitle(copilot.area)} · ${copilot.evidence_artifact_type}`));
    item.append(nodeElement("small", "", copilot.recommended_focus));
    item.append(nodeElement("code", "", actionLabel(snapshot, copilot.action_id)));
    areaCopilots.append(item);
  }

  const memory = nodeElement("div", "memory-promotion-list");
  for (const promotion of panel.memory_promotions) {
    const item = nodeElement("article", "memory-promotion");
    item.append(nodeElement("strong", "", promotion.candidate_id));
    item.append(nodeElement("span", "", `${promotion.source_scope} -> ${promotion.target_scope} · ${promotion.visibility}`));
    item.append(nodeElement("code", "", actionLabel(snapshot, promotion.action_id)));
    memory.append(item);
  }

  const observability = nodeElement(
    "p",
    "observability-line",
    `${panel.observability.risk_count} risks · ${panel.observability.lineage_source} · ${actionLabel(snapshot, panel.observability.readiness_action_id)}`
  );
  section.append(recommendations, areaCopilots, memory, observability);
  return section;
}

export function renderWorkflowCadences(snapshot) {
  const section = nodeElement("section", "panel cadence-panel");
  section.append(nodeElement("h2", "", "Workflow Cadences"));
  section.append(
    nodeElement(
      "p",
      "panel-source",
      `${snapshot.workflow_cadences?.event_channel_id || "crm.schedule"} · Forge-owned wait states and triggers`
    )
  );

  const list = nodeElement("div", "cadence-list");
  for (const cadence of snapshot.workflow_cadences?.cadences || []) {
    const item = nodeElement("article", "cadence-row");
    item.dataset.surfacePanel = cadence.surface_id;
    item.append(nodeElement("strong", "", cadence.title));
    item.append(nodeElement("span", "cadence-workflow", cadence.workflow_id));
    item.append(nodeElement("span", "cadence-state", compactTitle(cadence.due_state)));
    item.append(nodeElement("code", "", actionLabel(snapshot, cadence.action_id)));

    const steps = nodeElement("ol", "cadence-steps");
    for (const step of cadence.operation_plan) {
      const stepItem = nodeElement("li", "", step.title);
      stepItem.title = `${step.owner}: ${step.evidence}`;
      steps.append(stepItem);
    }
    item.append(steps);
    list.append(item);
  }

  section.append(list);
  return section;
}

export function renderWorkflowEvolutionWorkbench(snapshot) {
  const workbench = snapshot.workflow_evolution_workbench;
  const section = nodeElement("section", "panel evolution-workbench");
  section.dataset.surfacePanel = "crm.ai-workbench";
  section.append(nodeElement("h2", "", "Workflow Evolution"));
  if (!workbench) {
    section.append(nodeElement("p", "muted-copy", "Evolution workbench unavailable in this snapshot."));
    return section;
  }

  section.append(nodeElement("p", "panel-source", `${workbench.workflow_id} · ${workbench.state_source}`));

  const steps = nodeElement("ol", "evolution-steps");
  for (const step of workbench.evolution_loop.operation_plan) {
    const item = nodeElement("li", "", step.title);
    item.title = step.owner;
    steps.append(item);
  }

  const candidates = nodeElement("div", "evolution-candidates");
  for (const candidate of workbench.candidates) {
    const item = nodeElement("article", "evolution-candidate");
    item.append(nodeElement("strong", "", candidate.title));
    item.append(nodeElement("span", "", `${candidate.target_workflow_id} · ${candidate.expected_metric} ${candidate.expected_delta}`));
    item.append(nodeElement("code", "", actionLabel(snapshot, candidate.action_id)));
    item.title = candidate.rollback_plan;
    candidates.append(item);
  }

  const queue = nodeElement("div", "benchmark-queue");
  for (const benchmark of workbench.benchmark_queue) {
    const item = nodeElement("article", "benchmark-row");
    item.append(nodeElement("strong", "", benchmark.candidate_id));
    item.append(nodeElement("span", "", benchmark.metric));
    item.append(nodeElement("code", "", benchmark.command_template.join(" ")));
    queue.append(item);
  }

  section.append(steps, candidates, queue);
  return section;
}

export function renderBenchmarkEvidenceMatrix(snapshot) {
  const matrix = snapshot.benchmark_evidence_matrix;
  const section = nodeElement("section", "panel benchmark-evidence");
  section.dataset.surfacePanel = "crm.system-map";
  section.append(nodeElement("h2", "", "Benchmark Evidence"));
  if (!matrix) {
    section.append(nodeElement("p", "muted-copy", "Benchmark evidence unavailable in this snapshot."));
    return section;
  }

  section.append(nodeElement("p", "panel-source", `${matrix.schema_version} · ${matrix.state_owner}`));

  const entries = nodeElement("div", "benchmark-entry-grid");
  for (const entry of matrix.entries) {
    const item = nodeElement("article", "benchmark-entry");
    item.dataset.surfacePanel = entry.surface_id;
    item.append(nodeElement("span", "benchmark-reference", entry.reference_product));
    item.append(nodeElement("strong", "", entry.title));
    item.append(nodeElement("span", "", `${entry.surface_id} · ${entry.evidence_surface}`));
    item.append(nodeElement("code", "", entry.contract_id));

    const proofList = nodeElement("ul", "benchmark-proof-list");
    for (const proof of entry.proof_points || []) {
      proofList.append(nodeElement("li", "", proof));
    }

    item.append(proofList);
    item.title = `${entry.command_owner} · ${entry.local_engine_policy}`;
    entries.append(item);
  }

  section.append(entries);
  return section;
}

export function renderEnterpriseJourneyWorkbench(snapshot) {
  const workbench = snapshot.enterprise_journey_workbench;
  const section = nodeElement("section", "panel journey-workbench");
  section.dataset.surfacePanel = "crm.system-map";
  section.append(nodeElement("h2", "", "Enterprise Journey"));
  if (!workbench) {
    section.append(nodeElement("p", "muted-copy", "Enterprise journey workbench unavailable in this snapshot."));
    return section;
  }

  section.append(nodeElement("p", "panel-source", `${workbench.workflow_id} · ${workbench.contract_id}`));

  const lanes = nodeElement("div", "journey-lanes");
  for (const lane of workbench.stage_lanes) {
    const item = nodeElement("article", "journey-lane");
    item.append(nodeElement("strong", "", lane.title));
    item.append(nodeElement("span", "", lane.workflow_id));
    item.append(nodeElement("code", "", lane.contract_id));
    item.title = `${lane.required_artifacts.join(", ")} · ${lane.required_events.join(", ")}`;
    lanes.append(item);
  }

  const gates = nodeElement("div", "journey-gates");
  for (const gate of workbench.acceptance_gates) {
    const item = nodeElement("article", "journey-gate");
    item.append(nodeElement("strong", "", gate.title));
    item.append(nodeElement("span", "", gate.owner));
    gates.append(item);
  }

  section.append(lanes, gates);
  return section;
}

export function renderOperatingReadinessWorkbench(snapshot) {
  const workbench = snapshot.operating_readiness_workbench;
  const section = nodeElement("section", "panel readiness-workbench");
  section.dataset.surfacePanel = "crm.system-map";
  section.append(nodeElement("h2", "", "Operating Readiness"));
  if (!workbench) {
    section.append(nodeElement("p", "muted-copy", "Operating readiness workbench unavailable in this snapshot."));
    return section;
  }

  section.append(nodeElement("p", "panel-source", `${workbench.workflow_id} · ${workbench.contract_id}`));
  section.append(nodeElement("code", "", actionLabel(snapshot, workbench.action_id)));

  const summary = nodeElement("div", "readiness-summary");
  summary.append(metric("Status", compactTitle(workbench.success_criteria_status)));
  summary.append(metric("Domains", `${workbench.ready_domain_count}/${workbench.domain_coverage.domains.length}`));
  summary.append(metric("Outcomes", workbench.user_facing_deliverable_count));
  summary.append(metric("Forge only", workbench.forge_only_operations ? "Yes" : "No"));

  const domains = nodeElement("div", "readiness-domain-grid");
  for (const domain of workbench.domain_coverage.domains || []) {
    const item = nodeElement("article", `readiness-domain ${domain.ready ? "ready" : "needs-rework"}`);
    item.append(nodeElement("strong", "", domain.title));
    item.append(nodeElement("span", "", domain.user_facing_deliverable));
    item.append(nodeElement("small", "", `${domain.workflow_ids.length} workflows · ${domain.runtime_contract_evidence.length} contracts`));
    item.title = `${domain.artifact_evidence.join(", ")} · ${domain.event_evidence.join(", ")}`;
    domains.append(item);
  }

  const operations = nodeElement("div", "readiness-operation-list");
  for (const operation of workbench.daily_operations || []) {
    const item = nodeElement("article", "readiness-operation");
    item.append(nodeElement("strong", "", operation.deliverable));
    item.append(nodeElement("span", "", `${operation.command_owner} · ${operation.workflow_ids.length} workflows`));
    item.append(nodeElement("small", "", operation.rework_path));
    operations.append(item);
  }

  const gates = nodeElement("div", "readiness-gates");
  for (const gate of workbench.readiness_gates || []) {
    const item = nodeElement("article", "readiness-gate");
    item.append(nodeElement("strong", "", gate.title));
    item.append(nodeElement("span", "", gate.owner));
    gates.append(item);
  }

  section.append(summary, domains, operations, gates);
  return section;
}

export function renderApprovalGovernanceWorkbench(snapshot) {
  const workbench = snapshot.approval_governance_workbench;
  const section = nodeElement("section", "panel approval-governance");
  section.dataset.surfacePanel = "crm.work-queue";
  section.append(nodeElement("h2", "", "Approval Governance"));
  if (!workbench) {
    section.append(nodeElement("p", "muted-copy", "Approval governance unavailable in this snapshot."));
    return section;
  }

  section.append(nodeElement("p", "panel-source", `${workbench.workflow_id} · ${workbench.contract_id}`));
  section.append(nodeElement("code", "", actionLabel(snapshot, workbench.action_id)));

  const queue = nodeElement("div", "approval-queue-grid");
  for (const approval of workbench.approval_queue || []) {
    const item = nodeElement("article", "approval-queue-item");
    item.append(nodeElement("strong", "", approval.title));
    item.append(nodeElement("span", "", `${approval.workflow_id} · ${compactTitle(approval.approval_state)}`));
    item.append(nodeElement("small", "", approval.required_permission));
    item.append(nodeElement("code", "", approval.contract_id || approval.action_id));
    item.title = `${approval.artifact_type} · ${approval.rework_action}`;
    queue.append(item);
  }

  const gates = nodeElement("div", "approval-gate-grid");
  for (const gate of workbench.permission_gates || []) {
    const item = nodeElement("article", "approval-gate");
    item.append(nodeElement("strong", "", gate.required_permission));
    item.append(nodeElement("span", "", `${compactTitle(gate.status)} · ${gate.owner}`));
    gates.append(item);
  }

  const plan = nodeElement("ol", "approval-operation-plan");
  for (const step of workbench.operation_plan || []) {
    const item = nodeElement("li", "approval-operation-step");
    item.append(nodeElement("strong", "", step.title));
    item.append(nodeElement("span", "", step.owner));
    plan.append(item);
  }

  section.append(queue, gates, plan);
  return section;
}

export function renderWorkflowFactoryBlueprintWorkbench(snapshot) {
  const workbench = snapshot.workflow_factory_blueprint_workbench;
  const section = nodeElement("section", "panel factory-blueprint");
  section.dataset.surfacePanel = "crm.system-map";
  section.append(nodeElement("h2", "", "Workflow Factory Blueprint"));
  if (!workbench) {
    section.append(nodeElement("p", "muted-copy", "Workflow factory blueprint unavailable in this snapshot."));
    return section;
  }

  section.append(nodeElement("p", "panel-source", `${workbench.workflow_id} · ${workbench.contract_id}`));
  section.append(nodeElement("code", "", actionLabel(snapshot, workbench.action_id)));

  const modules = nodeElement("div", "factory-module-grid");
  for (const module of workbench.module_templates || []) {
    const item = nodeElement("article", "factory-module");
    item.append(nodeElement("strong", "", module.title));
    item.append(nodeElement("span", "", `${module.domain} · ${module.workflow_ids.length} workflow`));
    item.append(nodeElement("small", "", `${module.runtime_contracts.length} contracts · ${module.artifact_types.length} artifacts`));
    item.title = module.validation_gates.join(", ");
    modules.append(item);
  }

  const primitives = nodeElement("div", "factory-primitive-grid");
  for (const mapping of workbench.core_primitive_mapping || []) {
    const item = nodeElement("article", "factory-primitive");
    item.append(nodeElement("strong", "", compactTitle(mapping.primitive)));
    item.append(nodeElement("span", "", mapping.repository));
    primitives.append(item);
  }

  const gates = nodeElement("ol", "factory-gate-list");
  for (const gate of workbench.portability_gates || []) {
    const item = nodeElement("li", "factory-gate");
    item.append(nodeElement("strong", "", gate.title));
    item.append(nodeElement("span", "", gate.owner));
    gates.append(item);
  }

  section.append(modules, primitives, gates);
  return section;
}

export function renderSubworkflowOrchestrationWorkbench(snapshot) {
  const workbench = snapshot.subworkflow_orchestration_workbench;
  const section = nodeElement("section", "panel subworkflow-workbench");
  section.dataset.surfacePanel = "crm.system-map";
  section.append(nodeElement("h2", "", "Subworkflow Orchestration"));
  if (!workbench) {
    section.append(nodeElement("p", "muted-copy", "Subworkflow orchestration unavailable in this snapshot."));
    return section;
  }

  section.append(nodeElement("p", "panel-source", `${workbench.parent_workflow_id} · ${workbench.contract_id}`));

  const bindings = nodeElement("div", "subworkflow-bindings");
  for (const binding of workbench.child_bindings) {
    const item = nodeElement("article", "subworkflow-binding");
    item.append(nodeElement("strong", "", binding.child_workflow_id));
    item.append(nodeElement("span", "", `${binding.child_task_id} · ${binding.lifecycle_state}`));
    item.append(nodeElement("code", "", binding.validation_gate));
    item.title = binding.artifact_types.join(", ");
    bindings.append(item);
  }

  const gates = nodeElement("div", "subworkflow-gates");
  for (const gate of workbench.promotion_gates) {
    const item = nodeElement("article", "subworkflow-gate");
    item.append(nodeElement("strong", "", gate.title));
    item.append(nodeElement("span", "", gate.owner));
    gates.append(item);
  }

  section.append(bindings, gates);
  return section;
}

export function renderWorkflowAutomationDesignerWorkbench(snapshot) {
  const workbench = snapshot.workflow_automation_designer_workbench;
  const section = nodeElement("section", "panel automation-designer");
  section.dataset.surfacePanel = "crm.system-map";
  section.append(nodeElement("h2", "", "Workflow Automation Designer"));
  if (!workbench) {
    section.append(nodeElement("p", "muted-copy", "Workflow automation designer unavailable in this snapshot."));
    return section;
  }

  section.append(nodeElement("p", "panel-source", `${workbench.workflow_id} · ${workbench.contract_id}`));
  section.append(nodeElement("code", "", actionLabel(snapshot, workbench.action_id)));

  const graph = nodeElement("div", "automation-graph");
  for (const graphNode of workbench.rule_graph.nodes) {
    const item = nodeElement("article", `automation-node automation-${graphNode.kind}`);
    item.append(nodeElement("span", "node-kind", graphNode.kind));
    item.append(nodeElement("strong", "", graphNode.title));
    item.append(nodeElement("small", "", graphNode.workflow_id || graphNode.expression || graphNode.contract_id || ""));
    graph.append(item);
  }

  const palettes = nodeElement("div", "automation-palettes");
  const triggers = nodeElement("div", "automation-palette");
  triggers.append(nodeElement("h3", "", "Triggers"));
  for (const trigger of workbench.trigger_palette) {
    const item = nodeElement("article", "automation-palette-item");
    item.append(nodeElement("strong", "", trigger.title));
    item.append(nodeElement("span", "", trigger.event_type || trigger.schedule || trigger.kind));
    triggers.append(item);
  }

  const actions = nodeElement("div", "automation-palette");
  actions.append(nodeElement("h3", "", "Actions"));
  for (const automationAction of workbench.action_palette) {
    const item = nodeElement("article", "automation-palette-item");
    item.append(nodeElement("strong", "", automationAction.title));
    item.append(nodeElement("code", "", automationAction.contract_id));
    actions.append(item);
  }
  palettes.append(triggers, actions);

  const gates = nodeElement("ul", "automation-gates");
  for (const gate of workbench.validation_gates) {
    const item = nodeElement("li", "automation-gate");
    item.textContent = `${gate.title} · ${gate.owner}`;
    gates.append(item);
  }

  section.append(graph, palettes, gates);
  return section;
}

export function renderGoalCommissionWorkbench(snapshot) {
  const workbench = snapshot.goal_commission_workbench;
  const section = nodeElement("section", "panel goal-commission");
  section.dataset.surfacePanel = "crm.commercial-command";
  section.append(nodeElement("h2", "", "Goal & Commission Settlement"));
  if (!workbench) {
    section.append(nodeElement("p", "muted-copy", "Goal and commission settlement unavailable in this snapshot."));
    return section;
  }

  section.append(nodeElement("p", "panel-source", `${workbench.workflow_id} · ${workbench.contract_id}`));
  section.append(nodeElement("code", "", actionLabel(snapshot, workbench.action_id)));

  const targets = nodeElement("div", "goal-commission-grid");
  for (const target of workbench.goal_targets || []) {
    const item = nodeElement("article", "goal-target");
    item.append(nodeElement("strong", "", target.title || target.id));
    item.append(nodeElement("span", "", `${target.owner} · ${money(target.target_amount)} · weight ${target.weight}`));
    item.append(nodeElement("code", "", target.artifact_type));
    targets.append(item);
  }

  const revenue = nodeElement("div", "goal-commission-grid");
  for (const event of workbench.revenue_events || []) {
    const item = nodeElement("article", "revenue-event");
    item.append(nodeElement("strong", "", event.account));
    item.append(nodeElement("span", "", `${money(event.amount)} · ${event.goal_id}`));
    item.append(nodeElement("code", "", event.contract_artifact_ref));
    revenue.append(item);
  }

  const statements = nodeElement("div", "goal-commission-grid");
  for (const statement of workbench.commission_statements || []) {
    const item = nodeElement("article", "commission-statement");
    item.append(nodeElement("strong", "", statement.period));
    item.append(nodeElement("span", "", `${statement.owner} · ${money(statement.commission_statement_amount)}`));
    item.append(nodeElement("small", "", statement.payout_allowed ? "payout allowed" : statement.payout_blocked_reason));
    statements.append(item);
  }

  const gates = nodeElement("ul", "goal-commission-gates");
  for (const gate of workbench.validation_gates || []) {
    gates.append(nodeElement("li", "goal-commission-gate", gate));
  }

  section.append(targets, revenue, statements, gates);
  return section;
}

export function renderExecutiveReportingWorkbench(snapshot) {
  const workbench = snapshot.executive_reporting_workbench;
  const section = nodeElement("section", "panel executive-reporting");
  section.dataset.surfacePanel = "crm.ai-workbench";
  section.append(nodeElement("h2", "", "Executive Reporting"));
  if (!workbench) {
    section.append(nodeElement("p", "muted-copy", "Executive reporting unavailable in this snapshot."));
    return section;
  }

  section.append(nodeElement("p", "panel-source", `${workbench.workflow_id} · ${workbench.contract_id}`));
  section.append(nodeElement("code", "", actionLabel(snapshot, workbench.action_id)));

  const kpis = nodeElement("div", "executive-kpi-grid");
  for (const kpi of workbench.kpis || []) {
    const item = nodeElement("article", "executive-kpi");
    item.append(nodeElement("span", "kpi-label", kpi.label || compactTitle(kpi.id)));
    item.append(nodeElement("strong", "", kpi.unit === "currency" ? money(kpi.value) : String(kpi.value)));
    item.append(nodeElement("small", "", kpi.source_workflow_id || workbench.state_source));
    kpis.append(item);
  }

  const summaries = nodeElement("div", "executive-report-grid");
  for (const summary of workbench.executive_summaries || []) {
    const item = nodeElement("article", "executive-summary-card");
    item.append(nodeElement("strong", "", summary.id));
    item.append(nodeElement("span", "", summary.summary));
    item.append(nodeElement("code", "", summary.artifact_type));
    summaries.append(item);
  }

  const reviews = nodeElement("div", "executive-report-grid");
  for (const review of workbench.business_reviews || []) {
    const item = nodeElement("article", "business-review-card");
    item.append(nodeElement("strong", "", review.id));
    item.append(nodeElement("span", "", `${review.review_state} · ${review.risk_count} risks`));
    item.append(nodeElement("code", "", review.artifact_type));
    item.title = (review.source_workflows || []).join(", ");
    reviews.append(item);
  }

  const gates = nodeElement("ul", "executive-reporting-gates");
  for (const gate of workbench.validation_gates || []) {
    gates.append(nodeElement("li", "executive-reporting-gate", gate));
  }

  section.append(kpis, summaries, reviews, gates);
  return section;
}

function renderModuleBoard(snapshot) {
  const section = nodeElement("section", "panel module-panel");
  section.append(nodeElement("h2", "", "Business Modules"));
  const grid = nodeElement("div", "module-grid");
  for (const module of snapshot.business_modules) {
    const item = nodeElement("article", "module-card");
    item.append(nodeElement("span", "module-state", module.complete ? "Ready" : "Open"));
    item.append(nodeElement("h3", "", compactTitle(module.id)));
    item.append(nodeElement("p", "", `${module.workflow_ids.length} workflows · ${module.validation_gates.length} validation gates`));
    grid.append(item);
  }
  section.append(grid);
  return section;
}

function renderActions(snapshot) {
  const section = nodeElement("section", "panel actions-panel");
  section.append(nodeElement("h2", "", "Forge Actions"));
  const list = nodeElement("div", "action-list");
  for (const action of snapshot.actions) {
    const item = nodeElement("article", "action-row");
    item.append(nodeElement("strong", "", action.label));
    item.append(nodeElement("span", "", action.contract_id));
    item.append(nodeElement("code", "", action.command_template.slice(0, 5).join(" ")));
    list.append(item);
  }
  section.append(list);
  return section;
}

export function renderActionInvocationPlans(snapshot) {
  const section = nodeElement("section", "panel action-plan-panel");
  section.append(nodeElement("h2", "", "Action Plans"));
  const plans = nodeElement("div", "action-plan-list");

  for (const action of snapshot.actions) {
    const plan = actionPlan(snapshot, action.id);
    const item = nodeElement("article", "action-plan");
    item.dataset.surfacePanel = action.surface_id;
    item.append(nodeElement("strong", "", action.label));
    item.append(nodeElement("span", "plan-contract", action.contract_id));
    item.append(nodeElement("span", "plan-permission", plan?.required_permission || action.requires_permission));

    const steps = nodeElement("ol", "plan-steps");
    for (const step of plan?.operation_plan || []) {
      const stepItem = nodeElement("li", "", step.title);
      stepItem.title = `${step.owner}: ${step.evidence}`;
      steps.append(stepItem);
    }

    const command = nodeElement("code", "plan-command", (plan?.selected_command || action.command_template).join(" "));
    item.append(steps, command);
    plans.append(item);
  }

  section.append(plans);
  return section;
}

function wireSurfaceFiltering(snapshot) {
  const buttons = [...document.querySelectorAll(".surface-button")];
  const nodes = [...document.querySelectorAll(".workflow-node")];
  const panels = [...document.querySelectorAll("[data-surface-panel]")];

  for (const button of buttons) {
    button.addEventListener("click", () => {
      const selected = button.dataset.surface;
      const surface = snapshot.surfaces.find((item) => item.id === selected);
      for (const other of buttons) {
        other.classList.toggle("active", other === button);
      }
      for (const node of nodes) {
        node.classList.toggle("muted", !surface?.workflow_ids.includes(node.dataset.workflow));
      }
      for (const panel of panels) {
        panel.classList.toggle("muted", panel.dataset.surfacePanel !== selected);
      }
    });
  }
}

function render(snapshot) {
  root.replaceChildren();
  root.append(renderHeader(snapshot));

  const shell = nodeElement("div", "app-shell");
  shell.append(renderSurfaceRail(snapshot));

  const workspace = nodeElement("div", "workspace");
  workspace.append(renderRelationshipProfiles(snapshot));
  workspace.append(renderPipelineKanban(snapshot));
  workspace.append(renderCommercialCommand(snapshot));
  workspace.append(renderSupportQueue(snapshot));
  workspace.append(renderMarketingCalendar(snapshot));
  workspace.append(renderWorkQueue(snapshot));
  workspace.append(renderDailyOperatingCycle(snapshot));
  workspace.append(renderDesignSystem(snapshot));
  workspace.append(renderAiWorkbench(snapshot));
  workspace.append(renderWorkflowCadences(snapshot));
  workspace.append(renderWorkflowEvolutionWorkbench(snapshot));
  workspace.append(renderBenchmarkEvidenceMatrix(snapshot));
  workspace.append(renderEnterpriseJourneyWorkbench(snapshot));
  workspace.append(renderOperatingReadinessWorkbench(snapshot));
  workspace.append(renderApprovalGovernanceWorkbench(snapshot));
  workspace.append(renderWorkflowFactoryBlueprintWorkbench(snapshot));
  workspace.append(renderSubworkflowOrchestrationWorkbench(snapshot));
  workspace.append(renderWorkflowAutomationDesignerWorkbench(snapshot));
  workspace.append(renderExecutiveReportingWorkbench(snapshot));
  workspace.append(renderGoalCommissionWorkbench(snapshot));
  workspace.append(renderWorkflowGraph(snapshot));
  workspace.append(renderModuleBoard(snapshot));
  workspace.append(renderKnowledgeGraph(snapshot));
  workspace.append(renderDocumentQueue(snapshot));
  workspace.append(renderActions(snapshot));
  workspace.append(renderActionInvocationPlans(snapshot));
  shell.append(workspace);

  root.append(shell);
  wireSurfaceFiltering(snapshot);
}

async function boot() {
  try {
    const response = await fetch(snapshotSource, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Snapshot request failed with ${response.status}`);
    }
    render(await response.json());
  } catch (error) {
    root.replaceChildren();
    const panel = nodeElement("section", "boot-panel error");
    panel.append(nodeElement("h1", "", "Forge CRM"));
    panel.append(nodeElement("p", "", `Unable to load operating snapshot: ${error.message}`));
    root.append(panel);
  }
}

if (root) {
  boot();
}
