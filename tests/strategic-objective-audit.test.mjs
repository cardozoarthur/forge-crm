import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";
import {
  buildCrmStrategicObjectiveAudit,
  crmStrategicObjectiveAuditToMarkdown
} from "../scripts/crm-strategic-objective-audit-lib.mjs";

const execFileAsync = promisify(execFile);

test("strategic objective audit maps every requested CRM domain to Forge-owned evidence", () => {
  const audit = buildCrmStrategicObjectiveAudit({ tenant_id: "demo" });

  assert.equal(audit.schema_version, "forge.crm_strategic_objective_audit.v1");
  assert.equal(audit.tenant_id, "demo");
  assert.equal(audit.status, "covered_by_current_addon_evidence");
  assert.equal(audit.summary.missing_requirement_count, 0);
  assert.equal(audit.summary.section_count, 9);

  for (const sectionId of [
    "principle",
    "relationship",
    "commercial",
    "support",
    "marketing",
    "operations",
    "ai_automation",
    "forge_platform",
    "ui"
  ]) {
    const section = audit.sections.find((candidate) => candidate.id === sectionId);
    assert.ok(section, `missing section ${sectionId}`);
    assert.equal(section.status, "covered_by_current_addon_evidence", `${sectionId} should be complete`);
    assert.equal(section.missing.length, 0, `${sectionId} should have no missing requirements`);
    assert.ok(section.requirements.length > 0, `${sectionId} should list requirements`);
    assert.ok(
      section.requirements.every((requirement) => requirement.status === "covered_by_forge_evidence"),
      `${sectionId} should only contain Forge-backed requirements`
    );
  }
});

test("strategic objective audit proves support channels include chat, WhatsApp, Telegram and email", () => {
  const audit = buildCrmStrategicObjectiveAudit({ tenant_id: "demo" });
  const support = audit.sections.find((section) => section.id === "support");
  const channels = support.requirements.find((requirement) => requirement.id === "support_channels");

  assert.deepEqual(channels.required_channels, ["chat", "email", "telegram", "whatsapp"]);
  assert.deepEqual(channels.missing_channels, []);
  assert.deepEqual(channels.integration_ids, ["crm.chat", "crm.email", "crm.telegram", "crm.whatsapp"]);
  assert.deepEqual(channels.event_adapter_origins, ["chat", "email", "telegram", "whatsapp"]);
  assert.ok(channels.workflow_ids.includes("crm.omnichannel.channel_intake"));
  assert.ok(channels.runtime_contracts.includes("crm.support.channel_intake.executor"));
  assert.ok(channels.artifact_types.includes("crm_channel_intake"));
  assert.ok(channels.event_types.includes("crm.channel.authorized"));
});

test("strategic objective audit proves memory, artifacts, observability and UI requirements", () => {
  const audit = buildCrmStrategicObjectiveAudit({ tenant_id: "demo" });
  const platform = audit.sections.find((section) => section.id === "forge_platform");
  const ui = audit.sections.find((section) => section.id === "ui");

  const memory = platform.requirements.find((requirement) => requirement.id === "memory_scopes_and_semantic_search");
  assert.equal(memory.status, "covered_by_forge_evidence");
  assert.deepEqual(memory.required_scopes, ["global", "organization", "processing", "project"]);
  assert.deepEqual(memory.missing_scopes, []);
  assert.equal(memory.semantic_search_enabled, true);
  assert.equal(memory.governed_promotion_contract, "crm.memory.promotion.executor");
  assert.equal(memory.memory_search_contract, "crm.memory.knowledge_search.executor");
  assert.equal(memory.project_governance.status, "memory_governance_configured");

  const artifacts = platform.requirements.find((requirement) => requirement.id === "artifact_portfolio");
  assert.equal(artifacts.status, "covered_by_forge_evidence");
  for (const artifact of ["crm_document", "crm_proposal", "crm_contract", "crm_report", "crm_presentation", "crm_email", "crm_campaign"]) {
    assert.ok(artifacts.artifact_types.includes(artifact), `missing artifact ${artifact}`);
  }

  const observability = platform.requirements.find((requirement) => requirement.id === "observability_stack");
  assert.equal(observability.status, "covered_by_forge_evidence");
  for (const artifact of ["crm_audit_report", "crm_lineage_map", "crm_cost_report", "crm_metric_snapshot"]) {
    assert.ok(observability.artifact_types.includes(artifact), `missing observability artifact ${artifact}`);
  }
  assert.ok(observability.event_types.includes("crm.observability.inspected"));

  const hybrid = ui.requirements.find((requirement) => requirement.id === "hybrid_ui_experience");
  assert.equal(hybrid.status, "covered_by_forge_evidence");
  assert.equal(hybrid.tui_view_id, "crm.operational-cockpit");
  assert.equal(hybrid.web_entrypoint, "web/index.html");
  assert.equal(hybrid.visual_workflow_style, "n8n_inspired_graph");
  assert.equal(hybrid.knowledge_style, "obsidian_inspired_relationships");
  assert.equal(hybrid.document_style, "paperclip_inspired_artifact_queue");
  assert.equal(hybrid.design_system_style, "penpot_open_design_inspired_tokens");
});

test("strategic objective audit CLI and committed Markdown match current evidence", async () => {
  const { stdout } = await execFileAsync("node", ["scripts/audit-crm-strategic-objective.mjs", "default"], {
    cwd: new URL("..", import.meta.url)
  });
  const audit = JSON.parse(stdout);
  const markdown = crmStrategicObjectiveAuditToMarkdown(buildCrmStrategicObjectiveAudit({ tenant_id: "default" }));
  const committed = await readFile(new URL("../docs/strategic-objective-audit.md", import.meta.url), "utf8");

  assert.equal(audit.schema_version, "forge.crm_strategic_objective_audit.v1");
  assert.equal(audit.status, "covered_by_current_addon_evidence");
  assert.equal(audit.summary.missing_requirement_count, 0);
  assert.match(markdown, /Support: covered_by_current_addon_evidence/);
  assert.match(markdown, /support_channels: covered_by_forge_evidence/);
  assert.match(markdown, /Forge Platform: covered_by_current_addon_evidence/);
  assert.match(markdown, /hybrid_ui_experience: covered_by_forge_evidence/);
  assert.equal(committed, markdown);
});
