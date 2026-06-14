# Forge CRM Agent Guide

Forge CRM is not a standalone CRM beside Forge. It is a reference product built as a Forge Addon to prove Forge as a factory/framework for agentic workflow systems.

## Product Rules

- Treat every CRM object with operational impact as workflow-backed state.
- Leads, contacts, companies, opportunities, tickets, proposals, contracts, campaigns, documents and internal handoffs must be modeled as Forge workflows or workflow artifacts.
- Do not create important automation outside Forge runtime contracts.
- If a limitation belongs to workflow durability, checkpoints, memory, artifact lineage, approvals, schedules, triggers, observability or executor policy, implement the evolution in `forge-core`, not in this repository.
- Keep CRM domain implementation, templates, views and Addon contracts in this repository.
- Preserve Forge as orchestration authority. CRM workers are bounded execution adapters.
- Human approvals and tenant permission gates are product features, not optional decoration.

## Validation

Run before claiming a CRM Addon change is ready:

```bash
npm test
forge addons validate --addon-dir addons --output json
forge addons catalog --addon-dir addons --output json
forge addons package --manifest addons/forge-crm.json --repository https://github.com/cardozoarthur/forge-crm --channel stable --package-path /tmp/forge-crm.package.json --output json
FORGE_BIN=/path/to/forge npm run smoke:forge
```
