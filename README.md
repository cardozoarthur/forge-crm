# Forge CRM

Forge CRM is the first reference product for Forge as a factory/framework for agentic workflow systems.

The CRM is not a separate system that merely calls Forge. It is a Forge Addon and application surface built on Forge workflows, memory, artifacts, agents, approvals, queues, context routing and runtime contracts.

## Current Scope

This repository starts the CRM as a verifiable Forge Addon:

- `addons/forge-crm.json` declares CRM capabilities, workflows, permissions, event adapters, memory/context providers, artifact types and runtime contracts.
- `scripts/generate-crm-plan.mjs` emits a deterministic Forge-compatible planning result for CRM system creation.
- `runtime/crm-worker.mjs` exposes planner, executor, validator and handoff contracts over a local Forge `external_api` worker.
- `scripts/crm-workflow-pack-lib.mjs` generates a workflow-backed CRM tenant pack covering relationship, commercial, support, marketing, operations, AI automation, observability and enterprise readiness.
- `scripts/generate-crm-operating-model.mjs` emits the Forge-owned operating model for pipeline, support, marketing, documents, commercial command and AI workbench surfaces.
- `scripts/generate-crm-web-snapshot.mjs` emits the static web app snapshot derived from the operating model, including Forge-owned action invocation plans and operational workflow cadences for schedules, waits and triggers.
- `scripts/audit-crm-enterprise-readiness.mjs` emits a deterministic readiness audit that maps the strategic objective, Forge v0.5/v0.6/v0.7 benchmark tracks, public AddOn posture, user-facing deliverables and Core requirements to current Forge-owned evidence.
- `web/` contains a no-build business CRM web surface that renders workflows, knowledge relationships, document queues and Forge actions from `web/data/operating-snapshot.json`.
- `crm.operational-cockpit` exposes a Forge TUI dashboard view with permission-gated CRM actions for operating snapshot refresh, commercial forecast review, SLA triage, campaign automation, document generation, operating copilot and readiness packaging.
- `scripts/smoke-forge-runtime.mjs` registers the worker in Forge and executes planner, tenant bootstrap, operating snapshot, relationship timeline, pipeline stage movement, operating copilot, memory promotion preparation, observability inspection, operating readiness, lead classification, proposal generation, commercial follow-up forecast, account management, contract signature, document generation, document validation, document approval, marketing campaign automation, marketing form capture, omnichannel message ingestion, ticket SLA triage, project handoff planning and omnichannel handoff contracts.
- `workflows/crm-system-template.json` maps the enterprise CRM domains into workflow-backed modules.
- `docs/` records the architecture boundary between `forge-core` and this Addon.

## Boundary

Implementation that evolves Forge itself belongs in `forge-core`: durable workflows, interrupt/resume, checkpoints, ownership, waiting states, approvals, subworkflows, schedules, triggers, graph execution, memory governance, artifact lineage and observability.

Implementation that is CRM-specific belongs here: relationship objects, commercial flows, support flows, marketing flows, operational handoffs, CRM views, CRM templates and CRM runtime adapters.

## Quick Start

```bash
npm test
forge addons validate --addon-dir addons --output json
forge addons catalog --addon-dir addons --output json
node scripts/generate-crm-plan.mjs "Create a workflow-first CRM tenant"
node scripts/generate-crm-workflow-pack.mjs "acme"
node scripts/generate-crm-operating-model.mjs "acme"
npm run web:snapshot
npm run enterprise:audit -- demo
```

Run the runtime smoke against a Forge binary:

```bash
FORGE_BIN=/path/to/forge npm run smoke:forge
```

Package the Addon:

```bash
forge addons package \
  --manifest addons/forge-crm.json \
  --repository https://github.com/cardozoarthur/forge-crm \
  --channel stable \
  --package-path forge-crm-0.1.0.package.json \
  --output json
```

The versioned package `forge-crm-0.1.0.package.json` is committed to this public repository so Forge operators can inspect the Addon manifest, validation receipt, runtime contracts, dependency list and distribution metadata without relying on a local build artifact.

Run the local CRM runtime worker:

```bash
PORT=8787 npm run worker
```

`runtime/crm-planner-worker.mjs` remains as a compatibility wrapper around the multi-contract worker.

Open the static web surface directly from `web/index.html` after `npm run web:snapshot`. The page does not create a CRM-local database; it renders the generated Forge CRM snapshot and exposes Forge command templates for workflow mutations.

## Operating Model

The tenant bootstrap emits a `crm_operating_model` artifact, and `crm.operating.snapshot.executor` emits a promoted `crm_operating_snapshot` artifact. These artifacts describe the business-facing CRM surfaces from Forge workflow state:

- relationship graph;
- pipeline Kanban;
- commercial command panel;
- support queue;
- marketing calendar;
- document queue;
- AI workbench.

The operating model is explicitly `forge_workflow_runtime` owned and declares `external_database_required=false`; CRM state is expected to come from Forge workflow artifacts, events, memory scopes and validation gates.

## Forge TUI Surface

The Addon declares `crm.operational-cockpit` with `surface=tui`. The cockpit is the Forge operator entrypoint for CRM operations and exposes only Forge commands for the main flows:

- refresh the CRM operating snapshot;
- review commercial follow-up, forecast, goals and commissions;
- triage support SLA;
- automate campaigns and nurture;
- generate governed CRM documents;
- run the operating copilot;
- generate the operating readiness package.

Each action declares its Addon permission, risk level, confirmation requirement, payload schema and CLI command template. The TUI surface remains diagnosable when human approval is missing; it does not introduce a CRM-local execution path.

## Web Surface

The first business user surface is a static Addon asset:

- workflow graph view for CRM process topology;
- relationship graph view for company, contact, lead, opportunity, ticket and artifact relationships;
- document queue view for proposals, contracts, approval waits and rework;
- workflow cadence view for follow-ups, renewals, SLA clocks, campaign launches, nurture waits and project handoff reviews sourced from Forge schedule events;
- Forge action list for runtime contracts such as operating snapshot refresh, tenant bootstrap, observability inspection, operating readiness package generation, relationship timeline recording, pipeline stage movement, operating copilot, proposal generation, commercial follow-up forecast, account management, contract signature management, document generation, document validation, marketing campaign automation, form submission capture, omnichannel message ingestion, ticket SLA triage, project handoff planning and omnichannel handoff.

The manifest declares this through `crm.system-map.props.web_app`, with `web/index.html` as the entrypoint and `web/data/operating-snapshot.json` as the generated data source.

## Success Direction

A company should be able to operate sales, marketing, support, documents, automation and internal collaboration through CRM workflows powered by Forge, without parallel automation outside the Forge runtime for the main flows.
