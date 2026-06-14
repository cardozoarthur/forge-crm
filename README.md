# Forge CRM

Forge CRM is the first reference product for Forge as a factory/framework for agentic workflow systems.

The CRM is not a separate system that merely calls Forge. It is a Forge Addon and application surface built on Forge workflows, memory, artifacts, agents, approvals, queues, context routing and runtime contracts.

## Current Scope

This repository starts the CRM as a verifiable Forge Addon:

- `addons/forge-crm.json` declares CRM capabilities, workflows, permissions, event adapters, memory/context providers, artifact types and runtime contracts.
- `scripts/generate-crm-plan.mjs` emits a deterministic Forge-compatible planning result for CRM system creation.
- `runtime/crm-worker.mjs` exposes planner, executor, validator and handoff contracts over a local Forge `external_api` worker.
- `scripts/crm-workflow-pack-lib.mjs` generates a workflow-backed CRM tenant pack covering installation authorization, relationship lifecycle packaging, relationship profile enrichment, commercial follow-up, goal and commission settlement, executive reporting, support, marketing, operations, internal collaboration, cross-domain work queues, subworkflow orchestration, workflow automation design and execution trace, user experience/design system, AI automation, observability, enterprise readiness and end-to-end customer journey acceptance.
- `scripts/generate-crm-operating-model.mjs` emits the Forge-owned operating model for pipeline, support, marketing, documents, cross-domain work queue, design system, commercial command and AI workbench surfaces.
- `scripts/generate-crm-web-snapshot.mjs` emits the static web app snapshot derived from the operating model, including Forge-owned action invocation plans, installation authorization readiness, benchmark evidence, design-system artifacts, subworkflow orchestration, workflow automation design and dispatch trace, executive reporting, goal and commission settlement, daily operating cycle and operational workflow cadences for schedules, waits and triggers.
- `scripts/audit-crm-enterprise-readiness.mjs` emits a deterministic readiness audit that maps the strategic objective, Forge v0.5/v0.6/v0.7 benchmark tracks, public AddOn posture, user-facing deliverables and Core requirements to current Forge-owned evidence.
- `scripts/audit-crm-strategic-objective.mjs` emits a requirement-by-requirement audit for the original CRM-on-Forge objective, including support channel coverage, memory scopes, artifacts, observability and hybrid UI evidence.
- `web/` contains a no-build business CRM web surface that renders workflows, knowledge relationships, document queues, benchmark evidence and Forge actions from `web/data/operating-snapshot.json`.
- `crm.operational-cockpit` exposes a Forge TUI dashboard view with permission-gated CRM actions in parity with the web CRM command contracts: installation authorization preparation, tenant bootstrap, operating snapshot refresh, observability inspection, automatic lead classification, relationship lifecycle packaging, relationship timeline/profile operations, pipeline stage movement, commercial account/customer-success/contract/forecast/commission flows, proposals, documents, approvals, memory promotion, Forge memory search context packaging, omnichannel support, marketing, cross-domain queues, daily operating cycle, subworkflows, workflow automation, design system, copilots, enterprise journey execution and readiness packaging.
- `crm.ops-console` exposes the CRM inside `forge ops snapshot` as an `ops_console` projection with Forge operational digital twin, Addon observability, memory governance and safe renderer bindings. High-risk CRM actions remain visible but disabled until Forge permission policy records human authorization.
- `crm.factory.blueprint_export.executor` exports the CRM as a reusable Forge workflow-system blueprint with module templates, runtime contracts, portability gates and `forge-core` gap routing.
- `crm.workflow.evolution.executor` turns CRM observability bottlenecks into Forge `improve` experiments, benchmark reports, rollback plans and promotion decisions without unrestricted CRM self-modification.
- `scripts/smoke-forge-runtime.mjs` registers the worker in Forge and executes planner, installation authorization, tenant bootstrap, operating snapshot, factory blueprint export, relationship lifecycle packaging, relationship profile enrichment, relationship timeline, pipeline stage movement, operating copilot, specialized area copilots, cross-domain work queue orchestration, daily operating cycle, subworkflow orchestration, workflow automation design and execution trace, design-system generation, memory promotion preparation, Forge memory knowledge context search, observability inspection, executive reporting, operating readiness, enterprise customer journey acceptance, lead classification, proposal generation, commercial follow-up forecast, goal and commission settlement, account management, customer success planning, contract signature, document generation, document validation, document approval, document library versioning, marketing segment building, marketing campaign automation, marketing landing page publishing, marketing form capture, channel intake normalization, omnichannel message ingestion, unified omnichannel center execution, approval-gated support reply composition, ticket SLA triage, project handoff planning, internal collaboration recording and omnichannel handoff contracts.
- `workflows/crm-system-template.json` maps installation authorization and the enterprise CRM domains into workflow-backed modules.
- `docs/` records the architecture boundary between `forge-core` and this Addon.

## Boundary

Implementation that evolves Forge itself belongs in `forge-core`: durable workflows, interrupt/resume, checkpoints, ownership, waiting states, approvals, subworkflows, schedules, triggers, graph execution, memory governance, artifact lineage and observability.

Implementation that is CRM-specific belongs here: relationship objects, commercial flows, support flows, marketing flows, operational handoffs, CRM views, CRM templates and CRM runtime adapters.

## Quick Start

```bash
npm test
forge addons validate --addon-dir addons --output json
forge addons catalog --addon-dir addons --output json
forge ops snapshot --project-root . --addon-dir addons --output json
node scripts/generate-crm-plan.mjs "Create a workflow-first CRM tenant"
node scripts/generate-crm-workflow-pack.mjs "acme"
node scripts/generate-crm-operating-model.mjs "acme"
npm run web:snapshot
npm run enterprise:audit -- demo
npm run strategic:audit -- demo
```

Run the runtime smoke against a Forge binary:

```bash
FORGE_BIN=/path/to/forge npm run smoke:forge
```

Before a tenant operation, `crm.installation.authorization.executor` can prepare Forge permission authorization commands for every CRM permission required by the Addon. The executor returns `crm_installation_authorization_plan`, `crm_permission_authorization_matrix` and `crm_install_readiness_report` artifacts, but it does not grant permissions automatically; the human authorization step remains a Forge Core permission-policy operation through `forge addons authorize-permission`.

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

The public GitHub Actions workflow checks out `cardozoarthur/forge-core`, builds the `forge` binary, runs `npm test`, validates the Forge CRM memory policy, validates the Ops snapshot projection, validates the Addon, loads the Addon catalog, packages the Addon and executes `npm run smoke:forge` with `FORGE_BIN` pointing at the built Forge binary. This keeps the repository-level signal tied to Forge runtime behavior rather than Node-only assertions.

Forge CRM includes `.forge/memory-governance.json`, generated by `forge memory configure`, so the Addon project has explicit Forge-owned memory defaults: `MEMORY_STANDARD`, `organization/project/processing` scopes, internal audience, private-by-default privacy and processing auto-archive retention. Validate it with:

```bash
forge memory policy --project-root . --output json
```

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
- cross-domain work queue;
- internal collaboration;
- design system;
- AI workbench.

The operating model is explicitly `forge_workflow_runtime` owned and declares `external_database_required=false`; CRM state is expected to come from Forge workflow artifacts, events, memory scopes and validation gates.

## Adaptive Workflow Evolution

Forge CRM includes `crm.workflow.evolution` as the product dogfooding loop for Forge v0.6 and v0.7. The loop consumes Forge observability evidence, proposes bounded workflow evolution candidates, emits an experiment artifact with changelog and rollback plan, prepares a benchmark command and records a promotion decision.

Promotion stays blocked until Forge benchmark and approval evidence exists. Missing workflow primitives, memory governance, artifact lineage or observability contracts are reported as `crm_core_gap_report` targeting `forge-core`, not hidden behind CRM-local automation.

## Forge TUI Surface

The Addon declares `crm.operational-cockpit` with `surface=tui`. The cockpit is the Forge operator entrypoint for CRM operations and exposes only Forge commands for the main flows:

- refresh the CRM operating snapshot;
- bootstrap a CRM tenant workflow pack and operating model;
- inspect audit, lineage, costs, metrics and logs;
- classify leads into Forge recommendation artifacts before pipeline routing;
- package lead, contact, company and opportunity lifecycles as Forge artifacts before conversion;
- record relationship timeline events;
- enrich contact and company relationship profiles;
- move opportunities across Forge-owned pipeline stages;
- review commercial follow-up, forecast, goals and commissions;
- manage accounts, customer success plans, contract signatures and project handoffs;
- record internal collaboration notes, decisions, mentions and follow-up tasks;
- normalize approved support channel intake;
- ingest omnichannel messages and unify the omnichannel center;
- triage support SLA;
- deliver approved omnichannel handoffs;
- build approval-gated marketing segments and audiences;
- automate campaigns and nurture;
- publish approval-gated landing pages and form schemas;
- capture landing-page form submissions into lead lifecycle workflows;
- generate approval-gated CRM proposals;
- generate governed CRM documents;
- validate document lineage and record approval decisions;
- manage document library files, versions and collection indexes;
- prepare governed memory promotion requests;
- package governed Forge memory search results into CRM workflow context;
- run cross-domain work queue orchestration;
- orchestrate CRM child subworkflows before parent journey promotion;
- design trigger-condition-action automations that compile to Forge workflows, schedules and event listeners;
- generate the Forge-owned design system;
- run the operating copilot;
- run specialized area copilots;
- generate executive reports and KPI dashboards from Forge workflow evidence;
- export a reusable workflow-system blueprint from CRM module, runtime contract and Core primitive evidence;
- generate the strategic objective audit from Forge workflow, runtime, artifact, event and view evidence;
- evolve a CRM workflow through a governed Forge improve experiment;
- run the enterprise customer journey acceptance package;
- generate the operating readiness package.

Each action declares its Addon permission, risk level, confirmation requirement, payload schema and CLI command template. The TUI surface remains diagnosable when human approval is missing; it does not introduce a CRM-local execution path.

## Forge Ops Console Projection

The Addon also declares `crm.ops-console` with `surface=ops_console`. This is the Forge Core operational projection, not a parallel CRM UI runtime. It binds to:

- `forge.ops.snapshot.operational_digital_twin`;
- `forge.ops.snapshot.addon_observability`;
- `forge.ops.snapshot.memory_context_governance`;
- `forge.ops.snapshot.addon_view_renderers`.

The projection exposes refresh, observability, operating copilot, readiness package and enterprise journey actions through Forge CLI command templates only. Because CRM declares high-risk workflow mutation permissions, a fresh Forge project shows the renderer as safe but `permission_status=missing_human_approval`, with mutating actions disabled until authorization is recorded.

## Web Surface

The first business user surface is a static Addon asset:

- workflow graph view for CRM process topology;
- relationship graph view for company, contact, lead, lifecycle package, enriched relationship profile, opportunity, ticket and artifact relationships;
- document queue view for proposals, contracts, approval waits, rework and versioned library records;
- work queue view for approvals, SLA risks, documents, campaigns, handoffs, internal collaboration threads and blocked waiting states;
- daily operating cycle workbench for Forge-generated command packages across sales, marketing, support, documents and handoffs;
- design system view for Penpot/Open Design-inspired tokens and UI component catalog artifacts;
- workflow cadence view for follow-ups, renewals, SLA clocks, campaign launches, nurture waits and project handoff reviews sourced from Forge schedule events;
- enterprise journey workbench for lead capture, opportunity, proposal, contract, account, support and handoff acceptance evidence;
- operating readiness workbench for domain coverage, user-facing outcomes, daily operations, readiness gates and rework paths backed by `crm.operating.readiness.executor`;
- workflow factory blueprint workbench for module templates, Core primitive mapping, portability gates and artifact export through `crm.factory.blueprint_export.executor`;
- strategic objective audit workbench for explicit requirement coverage, support-channel evidence and forge-core gap routing through `crm.strategic.objective_audit.executor`;
- subworkflow orchestration workbench for Forge child workflow bindings, lineage mapping and parent promotion gates;
- workflow automation designer workbench for Forge-owned trigger, condition and action graphs with activation gates plus a Forge dispatch trace surface;
- executive reporting workbench for KPI dashboards, business review artifacts and advisory recommendations from Forge workflow evidence;
- goal and commission settlement workbench for target attainment, revenue-event lineage, commission statements and payout approval gates;
- customer success planning surface for adoption scorecards, renewal risk, expansion playbooks and success milestone task plans;
- AI workbench knowledge context search for packaging `forge memory search` results into reusable CRM context packs without a CRM-local vector index;
- benchmark evidence matrix proving n8n-style workflow automation, Obsidian-style relationship knowledge, Paperclip-style document lineage and Penpot/Open Design-style tokens as Forge-owned surfaces with local engines blocked;
- Forge action list for runtime contracts such as operating snapshot refresh, tenant bootstrap, observability inspection, executive reporting, operating readiness package generation, strategic objective audit generation, enterprise customer journey execution, CRM child subworkflow orchestration, CRM workflow automation design, CRM workflow automation trace, relationship lifecycle packaging, relationship profile enrichment, relationship timeline recording, pipeline stage movement, operating copilot, specialized area copilots, Forge memory knowledge context search, cross-domain work queue orchestration, daily operating cycle, design-system generation, proposal generation, commercial follow-up forecast, goal and commission settlement, account management, customer success planning, contract signature management, document generation, document validation, document library management, marketing segment building, marketing campaign automation, landing page publishing, form submission capture, channel intake normalization, unified omnichannel center execution, omnichannel message ingestion, approval-gated support reply composition, ticket SLA triage, project handoff planning, internal collaboration recording and omnichannel handoff.
- Adaptive workflow evolution workbench for Forge improve candidates, benchmark queue and promotion gates.

The manifest declares this through `crm.system-map.props.web_app`, with `web/index.html` as the entrypoint and `web/data/operating-snapshot.json` as the generated data source.

## Success Direction

A company should be able to operate sales, marketing, support, documents, automation and internal collaboration through CRM workflows powered by Forge, without parallel automation outside the Forge runtime for the main flows.
