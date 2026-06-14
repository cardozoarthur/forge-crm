# Initial Validation

Date: 2026-06-14

## Commands

```bash
npm test
/home/arthur/projects/forge-core/target/debug/forge addons validate --addon-dir /home/arthur/projects/forge-crm/addons --output json
/home/arthur/projects/forge-core/target/debug/forge addons resolve --goal "Create a workflow-first CRM" --addon-dir /home/arthur/projects/forge-crm/addons --output json
FORGE_BIN=/home/arthur/projects/forge-core/target/debug/forge npm run smoke:forge
```

## Result

- Node tests passed: 11 tests, 0 failures.
- Forge Addon validation passed: `status=valid`, `issue_count=0`.
- Forge capability resolution sees `forge.addon.crm` as an authorization-blocked Addon capability, preserving human approval before execution while keeping the CRM discoverable.
- Runtime smoke passed through Forge `external_api`: lead classifier and proposal executor completed, document validator passed, and omnichannel handoff delivered.
- Planner execution completed and returned `planning_strategy_equivalence_review_required`, which is expected for the CRM domain planner because it augments rather than replaces the Core generic planning strategy.
