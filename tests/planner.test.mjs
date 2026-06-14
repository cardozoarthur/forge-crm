import assert from "node:assert/strict";
import test from "node:test";
import { buildCrmPlan } from "../scripts/crm-plan-lib.mjs";

test("planner result has Forge Addon planning strategy shape", () => {
  const result = buildCrmPlan("Create a CRM tenant");
  assert.equal(result.schema_version, "forge.addon_planning_strategy_result.v1");
  assert.equal(result.planner.addon_id, "forge.addon.crm");
  assert.ok(Array.isArray(result.tasks));
  assert.ok(result.tasks.length >= 10);

  const ids = new Set(result.tasks.map((task) => task.id));
  for (const task of result.tasks) {
    assert.ok(task.title);
    assert.equal(typeof task.expected_output, "string");
    assert.ok(task.expected_output.length > 0);
    assert.ok(task.validation_rules.length > 0);
    for (const dependency of task.dependencies) {
      assert.ok(ids.has(dependency), `${task.id} has unknown dependency ${dependency}`);
    }
  }
});

test("planner output is serializable JSON", () => {
  const stdout = JSON.stringify(buildCrmPlan("Create CRM"));
  const result = JSON.parse(stdout);
  assert.equal(result.goal, "Create CRM");
  assert.equal(result.core_gap_policy.repository, "forge-core");
});

test("planner publishes a portable workflow-system factory blueprint", () => {
  const result = buildCrmPlan("Create a reusable CRM workflow system");

  assert.equal(result.factory_blueprint.schema_version, "forge.crm_workflow_factory_blueprint.v1");
  assert.equal(result.factory_blueprint.addon_id, "forge.addon.crm");
  assert.equal(result.factory_blueprint.state_owner, "forge_workflow_runtime");
  assert.equal(result.factory_blueprint.local_state_allowed, false);
  assert.equal(result.factory_blueprint.runtime_contract_id, "crm.factory.blueprint_export.executor");
  assert.ok(result.factory_blueprint.module_templates.length >= 6);
  assert.ok(
    result.factory_blueprint.module_templates.every(
      (module) => module.workflow_ids.length > 0 && module.runtime_contracts.length > 0 && module.artifact_types.length > 0
    )
  );
  assert.ok(result.factory_blueprint.core_primitive_mapping.some((mapping) => mapping.primitive === "approvals"));
  assert.ok(result.factory_blueprint.core_primitive_mapping.every((mapping) => mapping.repository === "forge-core"));
  assert.deepEqual(
    result.factory_blueprint.portability_gates.map((gate) => gate.id),
    ["workflow_contracts_declared", "runtime_contracts_authorized", "artifact_lineage_declared", "core_gaps_routed"]
  );
});
