# Forge CRM

Forge CRM is the first reference product for Forge as a factory/framework for agentic workflow systems.

The CRM is not a separate system that merely calls Forge. It is a Forge Addon and application surface built on Forge workflows, memory, artifacts, agents, approvals, queues, context routing and runtime contracts.

## Current Scope

This repository starts the CRM as a verifiable Forge Addon:

- `addons/forge-crm.json` declares CRM capabilities, workflows, permissions, event adapters, memory/context providers, artifact types and runtime contracts.
- `scripts/generate-crm-plan.mjs` emits a deterministic Forge-compatible planning result for CRM system creation.
- `runtime/crm-worker.mjs` exposes planner, executor, validator and handoff contracts over a local Forge `external_api` worker.
- `scripts/crm-workflow-pack-lib.mjs` generates a workflow-backed CRM tenant pack covering relationship, commercial, support, marketing, operations and AI automation.
- `scripts/smoke-forge-runtime.mjs` registers the worker in Forge and executes planner, tenant bootstrap, lead classification, proposal generation, document validation and omnichannel handoff contracts.
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
  --package-path /tmp/forge-crm.package.json \
  --output json
```

Run the local CRM runtime worker:

```bash
PORT=8787 npm run worker
```

`runtime/crm-planner-worker.mjs` remains as a compatibility wrapper around the multi-contract worker.

## Success Direction

A company should be able to operate sales, marketing, support, documents, automation and internal collaboration through CRM workflows powered by Forge, without parallel automation outside the Forge runtime for the main flows.
