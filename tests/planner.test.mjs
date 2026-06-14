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
