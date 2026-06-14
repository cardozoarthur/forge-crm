# Initial Validation

Date: 2026-06-14

## Commands

```bash
npm test
node scripts/generate-crm-workflow-pack.mjs smoke
node scripts/generate-crm-operating-model.mjs smoke
node scripts/generate-crm-web-snapshot.mjs smoke
npm run web:snapshot
/home/arthur/projects/forge-core/target/release/forge addons validate --addon-dir /home/arthur/projects/forge-crm/addons --output json
/home/arthur/projects/forge-core/target/release/forge addons resolve --goal "Create a workflow-first CRM" --addon-dir /home/arthur/projects/forge-crm/addons --output json
FORGE_BIN=/home/arthur/projects/forge-core/target/release/forge npm run smoke:forge
```

## Result

- Node tests passed: 31 tests, 0 failures.
- CRM workflow pack generation produced `schema_version=forge.crm_workflow_pack.v1`, 11 workflows, 44 object types and complete scope coverage.
- CRM operating model generation produced `schema_version=forge.crm_operating_model.v1`, 8 operator surfaces and 6 complete business modules.
- CRM web snapshot generation produced `schema_version=forge.crm_web_app_snapshot.v1`, 8 business surfaces, 11 workflow graph nodes, document queue lanes and Forge command actions without browser persistence.
- CRM operating copilot produced `crm_ai_recommendation`, `crm_risk_analysis` and `crm_report` artifacts with no direct CRM state mutation.
- CRM document generator produced Forge-gated `crm_document`, `crm_contract`, `crm_campaign`, `crm_email`, `crm_landing_page`, `crm_report` and `crm_presentation` artifacts with no direct CRM state mutation or external delivery.
- Forge Addon validation passed: `status=valid`, `issue_count=0`.
- Forge capability resolution sees `forge.addon.crm` as an authorization-blocked Addon capability, preserving human approval before execution while keeping the CRM discoverable.
- Runtime smoke passed through Forge `external_api`: tenant bootstrap, operating snapshot, operating copilot, lead classifier, proposal executor and document generator completed, document validator passed, and omnichannel handoff delivered.
- Tenant bootstrap returned `addon_executor_completed`, `bootstrap_workflow_count=11` and `bootstrap_complete_scope=true`.
- Operating snapshot returned `addon_executor_completed`, `operator_surface_count=8`, `business_module_count=6` and promoted `crm.operating.snapshot_generated` into the workflow timeline.
- Planner execution completed and returned `planning_strategy_equivalence_review_required`, which is expected for the CRM domain planner because it augments rather than replaces the Core generic planning strategy.
