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

The current CRM worker exposes twenty-five Forge runtime entrypoints:

- `forge_crm.plan_system` for CRM system planning;
- `forge_crm.bootstrap_tenant` for a Forge-owned tenant workflow pack;
- `forge_crm.operating_snapshot` for a Forge-owned business operating snapshot;
- `forge_crm.classify_lead` for recommendation-only lead scoring;
- `forge_crm.record_relationship_event` for entity relationships, unified timeline and pipeline stage events;
- `forge_crm.move_opportunity_stage` for Forge-owned Kanban movement across multiple funnels with board, stage-change and forecast artifacts;
- `forge_crm.operating_copilot` for opportunity priority, risk analysis, executive summary and next-step recommendations;
- `forge_crm.prepare_memory_promotion` for curated CRM knowledge summaries and governed `forge memory promote` requests;
- `forge_crm.evolve_workflow` for governed Forge improve experiments, benchmarks, rollback plans and promotion decisions;
- `forge_crm.run_enterprise_journey` for packaging a lead-to-support customer lifecycle as Forge-owned acceptance evidence;
- `forge_crm.inspect_observability` for CRM audit reports, lineage maps, cost reports, metrics, logs and state inspection from Forge-owned evidence;
- `forge_crm.generate_operating_readiness` for mapping CRM success criteria to user-facing deliverables backed by Forge workflows, artifacts, events and validation evidence;
- `forge_crm.generate_proposal` for draft proposal artifacts;
- `forge_crm.review_followup_forecast` for follow-up scheduling, forecast, goal progress and commission evidence;
- `forge_crm.manage_account` for account health, renewal, expansion and success-plan task workflows;
- `forge_crm.manage_contract_signature` for contract review, signature receipts and renewal scheduling;
- `forge_crm.generate_document` for contract, campaign, email, landing page, report and presentation drafts;
- `forge_crm.validate_document` for approval and lineage checks;
- `forge_crm.record_document_approval` for approval/rework decisions, handoff records and external-delivery unblock events;
- `forge_crm.automate_campaign` for segment-backed campaign scheduling and lead nurture workflow events;
- `forge_crm.capture_form_submission` for landing-page form submissions, consent records and lead lifecycle intake;
- `forge_crm.ingest_omnichannel_message` for channel receipts, message threads and Forge event intake before SLA or handoff;
- `forge_crm.triage_ticket_sla` for ticket intake, SLA state and support routing artifacts;
- `forge_crm.plan_project_handoff` for project, task, blocked-wait and acceptance handoff planning;
- `forge_crm.deliver_handoff` for approved omnichannel handoff receipts.

The worker returns Forge Addon result schemas and does not persist CRM state directly. State changes remain Forge workflow mutations or artifacts.

## Tenant Workflow Pack

`scripts/crm-workflow-pack-lib.mjs` produces the first operational workflow model for a CRM tenant. It declares 16 Forge-owned workflows across relationship, commercial, support, marketing, operations, AI automation, operational observability, enterprise readiness and end-to-end customer journey acceptance. Each workflow carries explicit states, transitions, object types, runtime contracts, artifact types, events, memory scopes, permissions, validation gates and mutation policy.

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
- `crm.ai-workbench`.

`crm.operating.snapshot.executor` returns a `crm_operating_snapshot` artifact with the same Forge-owned state contract. It does not create or require a CRM-local database; it is a projection of Forge workflow artifacts and events for enterprise users and future web/TUI rendering.

## Web Application Surface

The first web surface lives in `web/` and is declared by `crm.system-map.props.web_app` in the Addon manifest. It is intentionally static and no-build:

- `scripts/generate-crm-web-snapshot.mjs` writes `web/data/operating-snapshot.json`;
- `web/index.html` loads the snapshot;
- `web/app.js` renders workflow graph, knowledge graph, business modules, document queue, enterprise journey workbench, operating copilot action and Forge action templates;
- `web/styles.css` carries compact operational styling and design tokens.

This is a business-user view over Forge-owned state. It does not introduce browser persistence, a CRM-local database or a side automation engine. Any action shown in the UI is represented as a Forge command template that routes through Addon runtime contracts and permission gates.

## Dogfooding Rule

When CRM implementation exposes a missing Forge capability, the fix belongs in `forge-core` first. The CRM repository may record the gap and consume the resulting contract after it exists.
