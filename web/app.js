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

export function renderDocumentQueue(snapshot) {
  const section = nodeElement("section", "panel document-panel");
  section.append(nodeElement("h2", "", "Document Queue"));

  const lanes = nodeElement("div", "document-lanes");
  for (const lane of snapshot.document_queue.lanes) {
    const item = nodeElement("article", "document-row");
    item.append(nodeElement("strong", "", compactTitle(lane.title)));
    item.append(nodeElement("span", "", `${lane.workflow_ids.length} workflows`));
    lanes.append(item);
  }

  const artifactLine = nodeElement("p", "artifact-line", snapshot.document_queue.artifact_types.join(" · "));
  section.append(lanes, artifactLine);
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

function wireSurfaceFiltering(snapshot) {
  const buttons = [...document.querySelectorAll(".surface-button")];
  const nodes = [...document.querySelectorAll(".workflow-node")];

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
    });
  }
}

function render(snapshot) {
  root.replaceChildren();
  root.append(renderHeader(snapshot));

  const shell = nodeElement("div", "app-shell");
  shell.append(renderSurfaceRail(snapshot));

  const workspace = nodeElement("div", "workspace");
  workspace.append(renderWorkflowGraph(snapshot));
  workspace.append(renderModuleBoard(snapshot));
  workspace.append(renderKnowledgeGraph(snapshot));
  workspace.append(renderDocumentQueue(snapshot));
  workspace.append(renderActions(snapshot));
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
