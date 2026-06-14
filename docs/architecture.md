# Forge CRM Architecture

Forge CRM is a product proof for Forge as a factory/framework for agentic workflow systems.

## Layering

`forge-core` owns the universal workflow runtime:

- durable workflow state;
- interrupt/resume and checkpoints;
- ownership, waiting states, approvals and subworkflows;
- schedules, triggers and graph execution;
- memory governance and semantic retrieval;
- artifact identity, lineage and audit;
- observability for events, logs, costs and metrics;
- executor policy and bounded runtime adapters.

`forge-crm` owns the CRM domain Addon:

- CRM capabilities and workflow extensions;
- relationship, commercial, support, marketing and operation templates;
- CRM artifact types and views;
- CRM event adapters and runtime contracts;
- CRM-specific workers that produce bounded outputs for Forge.

## Runtime Rule

No important CRM automation should bypass Forge. External tools may execute bounded work, but Forge owns the workflow, state transitions, approvals, memory scope, artifact attachment, event history and validation gates.

The current CRM worker exposes forty-six Forge runtime entrypoints:

- `forge_crm.plan_system` for CRM system planning;
- `forge_crm.bootstrap_tenant` for a Forge-owned tenant workflow pack;
- `forge_crm.operating_snapshot` for a Forge-owned business operating snapshot;
- `forge_crm.classify_lead` for recommendation-only lead scoring;
- `forge_crm.run_relationship_lifecycle` for packaging lead, contact, company and opportunity records into Forge-owned lifecycle artifacts;
- `forge_crm.record_relationship_event` for entity relationships, unified timeline and pipeline stage events;
- `forge_crm.enrich_relationship_profile` for contact and company profile enrichment with source lineage, relationship signals and approval gates;
- `forge_crm.move_opportunity_stage` for Forge-owned Kanban movement across multiple funnels with board, stage-change and forecast artifacts;
- `forge_crm.operating_copilot` for opportunity priority, risk analysis, executive summary and next-step recommendations;
- `forge_crm.run_area_copilot` for specialized commercial, support, marketing, operations and document copilot briefs;
- `forge_crm.orchestrate_work_queue` for cross-domain approvals, SLA risks, documents, campaigns, handoffs and waiting states;
- `forge_crm.run_daily_operating_cycle` for a Forge-owned daily command package across sales, marketing, support, documents and handoffs;
- `forge_crm.govern_approval_queue` for approval decisions that either promote or return work to Forge with a rework reason;
- `forge_crm.export_factory_blueprint` for reusable workflow-system blueprints, module catalogs and Core primitive mapping;
- `forge_crm.generate_design_system` for Penpot/Open Design-inspired CRM tokens and UI component catalogs as Forge artifacts;
- `forge_crm.orchestrate_subworkflows` for binding CRM child workflows through Forge child_subflows, lineage maps and validation gates before parent promotion;
- `forge_crm.prepare_memory_promotion` for curated CRM knowledge summaries and governed `forge memory promote` requests;
- `forge_crm.evolve_workflow` for governed Forge improve experiments, benchmarks, rollback plans and promotion decisions;
- `forge_crm.design_workflow_automation` for compiling CRM trigger-condition-action automation designs into Forge workflows, schedules and event listeners without local execution;
- `forge_crm.trace_workflow_automation` for tracing approved automation trigger events, condition evidence and action dispatch receipts through Forge runtime contracts without local execution;
- `forge_crm.run_enterprise_journey` for packaging a lead-to-support customer lifecycle as Forge-owned acceptance evidence;
- `forge_crm.inspect_observability` for CRM audit reports, lineage maps, cost reports, metrics, logs and state inspection from Forge-owned evidence;
- `forge_crm.generate_executive_report` for executive summaries, KPI dashboards and business reviews derived from Forge workflow artifacts and events;
- `forge_crm.generate_operating_readiness` for mapping CRM success criteria to user-facing deliverables backed by Forge workflows, artifacts, events and validation evidence;
- `forge_crm.generate_proposal` for draft proposal artifacts;
- `forge_crm.review_followup_forecast` for follow-up scheduling, forecast, goal progress and commission evidence;
- `forge_crm.review_commercial_forecast` for advisory forecast review without sending follow-ups;
- `forge_crm.settle_goal_commission` for goal attainment, revenue-event lineage, commission statements and payout approval gates;
- `forge_crm.manage_account` for account health, renewal, expansion and success-plan task workflows;
- `forge_crm.plan_customer_success` for adoption scorecards, renewal risk review, expansion playbooks and success milestone task workflows;
- `forge_crm.manage_contract_signature` for contract review, signature receipts and renewal scheduling;
- `forge_crm.generate_document` for contract, campaign, email, landing page, report and presentation drafts;
- `forge_crm.publish_landing_page` for approval-gated landing pages, form schemas and automation plans as Forge artifacts;
- `forge_crm.validate_document` for approval and lineage checks;
- `forge_crm.record_document_approval` for approval/rework decisions, handoff records and external-delivery unblock events;
- `forge_crm.manage_document_library` for Forge-owned file records, document versions, collections and promotion approval state;
- `forge_crm.build_marketing_segment` for segment definitions, audience selection and campaign readiness artifacts;
- `forge_crm.automate_campaign` for segment-backed campaign scheduling and lead nurture workflow events;
- `forge_crm.run_lead_nurture` for wait-step and nurture progression through Forge artifacts;
- `forge_crm.capture_form_submission` for landing-page form submissions, consent records and lead lifecycle intake;
- `forge_crm.normalize_channel_intake` for approved channel adapter checks and normalized support intake artifacts before ticket creation;
- `forge_crm.unify_omnichannel_center` for channel-thread unification, identity mapping and Forge-owned support queue snapshots;
- `forge_crm.ingest_omnichannel_message` for channel receipts, message threads and Forge event intake before SLA or handoff;
- `forge_crm.compose_support_reply` for approval-gated support reply drafts without direct external sending;
- `forge_crm.triage_ticket_sla` for ticket intake, SLA state and support routing artifacts;
- `forge_crm.plan_project_handoff` for project, task, blocked-wait and acceptance handoff planning;
- `forge_crm.deliver_handoff` for approved omnichannel handoff receipts.

The worker returns Forge Addon result schemas and does not persist CRM state directly. State changes remain Forge workflow mutations or artifacts.

## Tenant Workflow Pack

`scripts/crm-workflow-pack-lib.mjs` produces the first operational workflow model for a CRM tenant. It declares 37 Forge-owned workflows across relationship lifecycle packaging, relationship profile enrichment, commercial follow-up, account management, customer success planning, goal and commission settlement, executive reporting, support channel intake, omnichannel message threads, unified omnichannel center, marketing segment building, campaigns, document library/versioning, operations, cross-domain work queues, daily operating cycle, subworkflow orchestration, workflow automation design, workflow automation execution trace, user experience/design system, AI automation, operational observability, enterprise readiness and end-to-end customer journey acceptance. Each workflow carries explicit states, transitions, object types, runtime contracts, artifact types, events, memory scopes, permissions, validation gates and mutation policy.

The pack uses `workflow_id`, `artifact_id` and `event_id` as durable identities. External primary keys and direct external persistence are explicitly disabled.

## Operating Model

The workflow pack now includes `forge.crm_operating_model.v1`. It maps CRM business modules and operator surfaces to workflow IDs, artifact types, event types, memory scopes and validation gates.

The operating surfaces are:

- `crm.system-map`;
- `crm.relationship-graph`;
- `crm.pipeline-kanban`;
- `crm.commercial-command`;
- `crm.support-queue`;
- `crm.marketing-calendar`;
- `crm.document-queue`;
- `crm.work-queue`;
- `crm.design-system`;
- `crm.ai-workbench`.

`crm.operating.snapshot.executor` returns a `crm_operating_snapshot` artifact with the same Forge-owned state contract. It does not create or require a CRM-local database; it is a projection of Forge workflow artifacts and events for enterprise users and future web/TUI rendering.

## Web Application Surface

The first web surface lives in `web/` and is declared by `crm.system-map.props.web_app` in the Addon manifest. It is intentionally static and no-build:

- `scripts/generate-crm-web-snapshot.mjs` writes `web/data/operating-snapshot.json`;
- `web/index.html` loads the snapshot;
- `web/app.js` renders workflow graph, knowledge graph, relationship lifecycle packages, relationship profile enrichment, business modules, commercial goal and commission settlement, executive reporting, support channel intake, omnichannel message threads, unified omnichannel center, marketing segments and landing pages, document queue with library version records, cross-domain work queue, daily operating cycle workbench, subworkflow orchestration, workflow automation designer and execution trace, benchmark evidence matrix, design system, enterprise journey workbench, operating copilot and area copilot actions, and Forge action templates;
- `web/styles.css` carries compact operational styling and design tokens.

This is a business-user view over Forge-owned state. It does not introduce browser persistence, a CRM-local database or a side automation engine. Any action shown in the UI is represented as a Forge command template that routes through Addon runtime contracts and permission gates.

## Dogfooding Rule

When CRM implementation exposes a missing Forge capability, the fix belongs in `forge-core` first. The CRM repository may record the gap and consume the resulting contract after it exists.
