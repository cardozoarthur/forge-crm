import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";
import { buildEnterpriseReadinessAudit } from "../scripts/crm-enterprise-readiness-audit-lib.mjs";

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

  assert.equal(audit.user_facing_deliverables.length, 10);
  assert.ok(audit.user_facing_deliverables.every((deliverable) => deliverable.ready === true));
  assert.equal(audit.summary.missing_objective_item_count, 0);
  assert.equal(audit.summary.ready_user_facing_deliverable_count, 10);
  assert.deepEqual(
    audit.forge_core_requirements
      .filter((requirement) => requirement.status === "requires_forge_core_gap_review")
      .map((requirement) => requirement.id),
    []
  );
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
