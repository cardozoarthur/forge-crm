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
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.proposal.generator.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.document.generator.executor"));
  assert.ok(snapshot.actions.some((action) => action.contract_id === "crm.ai.operating_copilot.executor"));
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
  assert.match(app, /renderKnowledgeGraph/);
  assert.match(app, /renderDocumentQueue/);
  assert.match(styles, /\.workflow-node/);
  assert.match(styles, /\.knowledge-node/);
  assert.match(styles, /\.document-row/);
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
