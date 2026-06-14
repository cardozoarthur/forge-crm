# Forge CRM

Forge CRM is the first reference product for Forge as a factory/framework for agentic workflow systems.

The CRM is not a separate system that merely calls Forge. It is a Forge Addon and application surface built on Forge workflows, memory, artifacts, agents, approvals, queues, context routing and runtime contracts.

## Current Scope

This repository starts the CRM as a verifiable Forge Addon:

- `addons/forge-crm.json` declares CRM capabilities, workflows, permissions, event adapters, memory/context providers, artifact types and runtime contracts.
- `scripts/generate-crm-plan.mjs` emits a deterministic Forge-compatible planning result for CRM system creation.
- `runtime/crm-planner-worker.mjs` exposes the same planner over a local HTTP worker shape for Forge external runtime experiments.
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

Run the local planner worker:

```bash
PORT=8787 node runtime/crm-planner-worker.mjs
```

## Success Direction

A company should be able to operate sales, marketing, support, documents, automation and internal collaboration through CRM workflows powered by Forge, without parallel automation outside the Forge runtime for the main flows.

