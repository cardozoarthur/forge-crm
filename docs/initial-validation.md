# Initial Validation

Date: 2026-06-14

## Commands

```bash
npm test
node scripts/generate-crm-workflow-pack.mjs smoke
/home/arthur/projects/forge-core/target/debug/forge addons validate --addon-dir /home/arthur/projects/forge-crm/addons --output json
/home/arthur/projects/forge-core/target/debug/forge addons resolve --goal "Create a workflow-first CRM" --addon-dir /home/arthur/projects/forge-crm/addons --output json
FORGE_BIN=/home/arthur/projects/forge-core/target/debug/forge npm run smoke:forge
```

## Result

- Node tests passed: 16 tests, 0 failures.
- CRM workflow pack generation produced `schema_version=forge.crm_workflow_pack.v1`, 11 workflows, 44 object types and complete scope coverage.
- Forge Addon validation passed: `status=valid`, `issue_count=0`.
- Forge capability resolution sees `forge.addon.crm` as an authorization-blocked Addon capability, preserving human approval before execution while keeping the CRM discoverable.
- Runtime smoke passed through Forge `external_api`: tenant bootstrap, lead classifier and proposal executor completed, document validator passed, and omnichannel handoff delivered.
- Tenant bootstrap returned `addon_executor_completed`, `bootstrap_workflow_count=11` and `bootstrap_complete_scope=true`.
- Planner execution completed and returned `planning_strategy_equivalence_review_required`, which is expected for the CRM domain planner because it augments rather than replaces the Core generic planning strategy.
