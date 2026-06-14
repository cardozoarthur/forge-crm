import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";
import {
  buildEnterpriseReadinessAudit,
  enterpriseReadinessAuditToMarkdown
} from "../scripts/crm-enterprise-readiness-audit-lib.mjs";

const execFileAsync = promisify(execFile);

test("enterprise readiness audit maps every objective domain to Forge-owned evidence", () => {
  const audit = buildEnterpriseReadinessAudit({ tenant_id: "demo" });

  assert.equal(audit.schema_version, "forge.crm_enterprise_readiness_audit.v1");
  assert.equal(audit.tenant_id, "demo");
  assert.equal(audit.status, "ready_for_forge_runtime_audit");
  assert.equal(audit.local_state_policy.state_owner, "forge_workflow_runtime");
  assert.equal(audit.local_state_policy.external_database_required, false);
  assert.equal(audit.local_state_policy.direct_external_persistence, false);

  for (const domain of ["relationship", "commercial", "support", "marketing", "operations", "ai_automation"]) {
    const matrix = audit.objective_matrix[domain];
    assert.ok(matrix, `missing audit domain ${domain}`);
    assert.equal(matrix.complete, true, `${domain} should be completely mapped`);
    assert.equal(matrix.missing.length, 0, `${domain} should not have missing objective items`);
    for (const item of matrix.items) {
      assert.equal(item.status, "covered_by_forge_workflow", `${domain}.${item.id} should be workflow-backed`);
      assert.ok(item.workflow_ids.length > 0, `${domain}.${item.id} needs workflow evidence`);
      assert.ok(item.runtime_contracts.length > 0, `${domain}.${item.id} needs runtime contract evidence`);
      assert.ok(item.artifact_types.length > 0, `${domain}.${item.id} needs artifact evidence`);
      assert.ok(item.event_types.length > 0, `${domain}.${item.id} needs event evidence`);
      assert.ok(item.surface_ids.length > 0, `${domain}.${item.id} needs UI surface evidence`);
      assert.equal(item.state_owner, "forge_workflow_runtime");
    }
  }
});

test("enterprise readiness audit keeps CRM as a public Forge Addon and maps benchmark tracks", () => {
  const audit = buildEnterpriseReadinessAudit({ tenant_id: "demo" });

  assert.equal(audit.repository.name, "forge-crm");
  assert.equal(audit.repository.private, false);
  assert.equal(audit.repository.public_repository_declared, true);
  assert.equal(audit.addon.id, "forge.addon.crm");
  assert.equal(audit.addon.lifecycle, "enabled");
  assert.equal(audit.addon.core_dependency, "forge.core.kernel");
  assert.equal(audit.core_gap_policy.repository, "forge-core");

  for (const trackId of ["forge_0_5_runtime_operability", "forge_0_6_adaptive_intelligence", "forge_0_7_universal_workflow_framework"]) {
    const track = audit.benchmark_tracks.find((candidate) => candidate.id === trackId);
    assert.ok(track, `missing benchmark track ${trackId}`);
    assert.equal(track.status, "covered_by_current_addon_evidence");
    assert.ok(track.evidence.workflow_ids.length > 0, `${trackId} needs workflow evidence`);
    assert.ok(track.evidence.runtime_contracts.length > 0, `${trackId} needs runtime contract evidence`);
    assert.ok(track.evidence.artifact_types.length > 0, `${trackId} needs artifact evidence`);
    assert.ok(track.evidence.event_types.length > 0, `${trackId} needs event evidence`);
  }

  assert.equal(audit.user_facing_deliverables.length, 18);
  assert.ok(audit.user_facing_deliverables.some((deliverable) => deliverable.id === "sales_cycle_orchestration"));
  assert.ok(audit.user_facing_deliverables.some((deliverable) => deliverable.id === "goal_commission_settlement"));
  assert.ok(audit.user_facing_deliverables.some((deliverable) => deliverable.id === "executive_reporting"));
  assert.ok(audit.user_facing_deliverables.some((deliverable) => deliverable.id === "knowledge_context_search"));
  assert.ok(audit.user_facing_deliverables.some((deliverable) => deliverable.id === "omnichannel_conversation_threads"));
  assert.ok(audit.user_facing_deliverables.some((deliverable) => deliverable.id === "workflow_system_factory_blueprint"));
  assert.ok(audit.user_facing_deliverables.some((deliverable) => deliverable.id === "daily_operating_cycle"));
  assert.ok(audit.user_facing_deliverables.some((deliverable) => deliverable.id === "internal_collaboration"));
  assert.ok(audit.user_facing_deliverables.every((deliverable) => deliverable.ready === true));
  assert.equal(audit.summary.missing_objective_item_count, 0);
  assert.equal(audit.summary.ready_user_facing_deliverable_count, audit.user_facing_deliverables.length);
  assert.deepEqual(
    audit.forge_core_requirements
      .filter((requirement) => requirement.status === "requires_forge_core_gap_review")
      .map((requirement) => requirement.id),
    []
  );
});

test("enterprise readiness audit proves public Addon distribution and dependency publication", () => {
  const audit = buildEnterpriseReadinessAudit({ tenant_id: "demo" });
  const distribution = audit.distribution_evidence;

  assert.equal(distribution.schema_version, "forge.crm_distribution_evidence.v1");
  assert.equal(distribution.status, "ready_for_public_addon_distribution");
  assert.equal(distribution.local_crm_infrastructure_required, false);

  assert.equal(distribution.repository.public_repository_declared, true);
  assert.equal(distribution.repository.package_repository, "https://github.com/cardozoarthur/forge-crm");
  assert.equal(distribution.repository.manifest_repository, "https://github.com/cardozoarthur/forge-crm");
  assert.equal(distribution.repository.package_matches_manifest, true);

  assert.equal(distribution.package.path, "forge-crm-0.1.0.package.json");
  assert.equal(distribution.package.exists, true);
  assert.equal(distribution.package.status, "addon_package_ready");
  assert.equal(distribution.package.package_id, "forge.addon.crm@0.1.0");
  assert.equal(distribution.package.validation_status, "valid");
  assert.equal(distribution.package.validation_issue_count, 0);
  assert.equal(distribution.package.repository, "https://github.com/cardozoarthur/forge-crm");
  assert.equal(distribution.package.channel, "stable");
  assert.equal(distribution.package.install_command, "forge addons install --manifest addons/forge-crm.json --output json");

  assert.equal(distribution.dependency_publication.all_required_dependencies_public, true);
  assert.equal(distribution.dependency_publication.dependencies.length, 1);
  assert.deepEqual(distribution.dependency_publication.dependencies[0], {
    id: "forge.core.kernel",
    required: true,
    repository: "https://github.com/cardozoarthur/forge-core",
    public_repository_declared: true,
    publication_status: "public_repository_declared"
  });

  assert.equal(distribution.ci.workflow_path, ".github/workflows/ci.yml");
  assert.equal(distribution.ci.status, "distribution_gates_declared");
  assert.equal(distribution.ci.validates_forge_core_checkout, true);
  assert.equal(distribution.ci.validates_tests, true);
  assert.equal(distribution.ci.validates_memory_policy, true);
  assert.equal(distribution.ci.validates_ops_snapshot, true);
  assert.equal(distribution.ci.validates_addon_validation, true);
  assert.equal(distribution.ci.validates_addon_catalog, true);
  assert.equal(distribution.ci.validates_addon_package, true);
  assert.equal(distribution.ci.validates_runtime_smoke, true);
});

test("enterprise readiness audit CLI emits JSON for release evidence", async () => {
  const { stdout } = await execFileAsync("node", ["scripts/audit-crm-enterprise-readiness.mjs", "demo"], {
    cwd: new URL("..", import.meta.url)
  });
  const audit = JSON.parse(stdout);

  assert.equal(audit.schema_version, "forge.crm_enterprise_readiness_audit.v1");
  assert.equal(audit.tenant_id, "demo");
  assert.equal(audit.summary.workflow_count >= 14, true);
  assert.equal(audit.summary.runtime_contract_count >= 23, true);
  assert.equal(audit.summary.missing_objective_item_count, 0);
});

test("enterprise readiness Markdown report is generated from current audit evidence", async () => {
  const audit = buildEnterpriseReadinessAudit({ tenant_id: "default" });
  const markdown = enterpriseReadinessAuditToMarkdown(audit);
  const committed = await readFile(new URL("../docs/enterprise-readiness-audit.md", import.meta.url), "utf8");

  assert.match(markdown, new RegExp(`- Workflows: ${audit.summary.workflow_count}`));
  assert.match(markdown, new RegExp(`- Runtime contracts: ${audit.summary.runtime_contract_count}`));
  assert.match(markdown, new RegExp(`- User-facing deliverables ready: ${audit.summary.ready_user_facing_deliverable_count}/${audit.user_facing_deliverables.length}`));
  assert.match(markdown, /## Forge Core Requirements/);
  assert.match(markdown, /## Distribution Evidence/);
  assert.match(markdown, /Distribution status: ready_for_public_addon_distribution/);
  assert.match(markdown, /durable_workflows: crm_consumes_forge_core_contract/);
  assert.match(markdown, /## Core Gap Policy/);
  assert.match(markdown, /Repository: forge-core/);
  assert.match(markdown, /Forge v0\.7 Universal Workflow Framework: covered_by_current_addon_evidence/);
  assert.equal(committed, markdown);
});
