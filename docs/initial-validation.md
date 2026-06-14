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

- Node tests passed: 61 tests, 0 failures.
- CRM workflow pack generation produced `schema_version=forge.crm_workflow_pack.v1`, 12 workflows, 47 object types and complete scope coverage.
- CRM operating model generation produced `schema_version=forge.crm_operating_model.v1`, 8 operator surfaces and 6 complete business modules.
- CRM web snapshot generation produced `schema_version=forge.crm_web_app_snapshot.v1`, 8 business surfaces, 12 workflow graph nodes, document queue lanes and 17 Forge command actions without browser persistence.
- CRM relationship timeline executor produced `crm_timeline_snapshot` and `crm_entity_model` artifacts and promoted `crm.relationship.recorded`, `crm.opportunity.stage_changed` and `crm.forecast.updated` events without direct CRM state mutation.
- CRM pipeline stage movement produced `crm_pipeline_board`, `crm_stage_change` and `crm_forecast_report` artifacts and promoted `crm.opportunity.stage_changed` and `crm.forecast.updated` events across multiple funnels without direct CRM state mutation.
- CRM operating copilot produced `crm_ai_recommendation`, `crm_risk_analysis` and `crm_report` artifacts with no direct CRM state mutation.
- CRM commercial follow-up forecast executor produced `crm_followup_plan`, `crm_email`, `crm_forecast_report` and `crm_commission_record` artifacts and promoted `crm.followup.scheduled`, `crm.forecast.reviewed`, `crm.goal.progress_reviewed` and `crm.commission.accrued` events without direct CRM state mutation.
- CRM account management executor produced `crm_account_plan`, `crm_health_report`, `crm_forecast_report` and `crm_task_plan` artifacts and promoted `crm.account.health_reviewed`, `crm.account.renewal_planned`, `crm.account.expansion_identified` and `crm.task.created` events without direct CRM state mutation.
- CRM contract signature executor produced `crm_contract`, `crm_signature_receipt`, `crm_renewal_plan` and `crm_report` artifacts and promoted `crm.contract.reviewed`, `crm.contract.signed` and `crm.contract.renewal_scheduled` events without direct CRM state mutation.
- CRM document generator produced Forge-gated `crm_document`, `crm_contract`, `crm_campaign`, `crm_email`, `crm_landing_page`, `crm_report` and `crm_presentation` artifacts with no direct CRM state mutation or external delivery.
- CRM marketing campaign automation produced `crm_campaign`, `crm_segment`, `crm_automation_plan` and `crm_landing_page` artifacts and promoted `crm.campaign.created`, `crm.campaign.scheduled` and `crm.nurture.step_due` events without direct CRM state mutation.
- CRM marketing form capture produced `crm_form_submission`, `crm_lead_capture`, `crm_consent_record` and `crm_automation_plan` artifacts and promoted `crm.form.submitted`, `crm.lead.created` and `crm.nurture.step_due` events without direct CRM state mutation.
- CRM omnichannel message ingestion produced `crm_message_thread`, `crm_channel_receipt` and `crm_support_summary` artifacts and promoted `crm.message.received` and `crm.ticket.created` events before SLA triage or handoff, without direct CRM state mutation.
- CRM ticket SLA triage produced `crm_support_summary` and `crm_handoff_record` artifacts and promoted `crm.message.received`, `crm.ticket.created` and `crm.sla.escalated` events without direct CRM state mutation.
- CRM project handoff planner produced `crm_project_plan`, `crm_task_plan`, `crm_handoff_record` and `crm_report` artifacts and promoted `crm.project.handoff_requested`, `crm.task.created`, `crm.task.blocked` and `crm.project.accepted` events without direct CRM state mutation.
- Forge Addon validation passed: `status=valid`, `issue_count=0`.
- Forge capability resolution sees `forge.addon.crm` as an authorization-blocked Addon capability, preserving human approval before execution while keeping the CRM discoverable.
- Runtime smoke passed through Forge `external_api`: tenant bootstrap, operating snapshot, relationship timeline, pipeline stage movement, operating copilot, lead classifier, proposal executor, commercial follow-up forecast, account management, contract signature, document generator, marketing campaign automation, marketing form capture, omnichannel message ingestion, ticket SLA triage and project handoff planning completed, document validator passed, and omnichannel handoff delivered.
- Tenant bootstrap returned `addon_executor_completed`, `bootstrap_workflow_count=12` and `bootstrap_complete_scope=true`.
- Operating snapshot returned `addon_executor_completed`, `operator_surface_count=8`, `business_module_count=6` and promoted `crm.operating.snapshot_generated` into the workflow timeline.
- Planner execution completed and returned `planning_strategy_equivalence_review_required`, which is expected for the CRM domain planner because it augments rather than replaces the Core generic planning strategy.
