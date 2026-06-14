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

  section.append(graph, relations);
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

  section.append(summary, contracts, accounts);
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

  const tickets = nodeElement("div", "support-ticket-list");
  for (const ticket of panel.tickets) {
    const item = nodeElement("article", `support-ticket status-${ticket.sla_status}`);
    item.append(nodeElement("strong", "", `${ticket.ticket_id} · ${ticket.account}`));
    item.append(nodeElement("span", "", `${ticket.channel} · ${compactTitle(ticket.state)} · ${ticket.minutes_to_breach} min`));
    item.append(nodeElement("code", "", actionLabel(snapshot, ticket.action_id)));
    tickets.append(item);
  }

  section.append(channels, tickets);
  return section;
}

export function renderMarketingCalendar(snapshot) {
  const { section, panel } = panelShell(snapshot, "marketing_calendar", "marketing-calendar");
  if (!panel) {
    return section;
  }

  const campaigns = nodeElement("div", "campaign-grid");
  for (const campaign of panel.campaigns) {
    const item = nodeElement("article", "campaign-row");
    item.append(nodeElement("strong", "", campaign.campaign_id));
    item.append(nodeElement("span", "", `${campaign.segment} · ${compactTitle(campaign.state)} · ${campaign.launch_window}`));
    item.append(nodeElement("code", "", actionLabel(snapshot, campaign.next_action_id)));
    campaigns.append(item);
  }

  const forms = nodeElement("div", "form-list");
  for (const form of panel.forms) {
    const item = nodeElement("article", "form-row");
    item.append(nodeElement("strong", "", form.landing_page));
    item.append(nodeElement("span", "", `${form.pending_submissions} pending submissions`));
    item.append(nodeElement("code", "", actionLabel(snapshot, form.capture_action_id)));
    forms.append(item);
  }

  section.append(campaigns, forms);
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
  section.append(recommendations, memory, observability);
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
  workspace.append(renderPipelineKanban(snapshot));
  workspace.append(renderCommercialCommand(snapshot));
  workspace.append(renderSupportQueue(snapshot));
  workspace.append(renderMarketingCalendar(snapshot));
  workspace.append(renderAiWorkbench(snapshot));
  workspace.append(renderWorkflowCadences(snapshot));
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

boot();
