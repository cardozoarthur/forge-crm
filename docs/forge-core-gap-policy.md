# Forge Core Gap Policy

Forge CRM is allowed to expose Forge Core gaps. It is not allowed to hide them behind parallel CRM infrastructure.

## Core Gaps

Implement in `forge-core` when the limitation is about:

- workflow durability;
- interrupt/resume;
- checkpoints;
- ownership;
- waiting states;
- approvals;
- subworkflows;
- schedules;
- triggers;
- graph execution;
- global, organizational, project or processing memory;
- semantic search and governed memory promotion;
- artifact identity, lineage or listing;
- audit, logs, events, costs and metrics;
- executor policy and local authorization;
- TUI or universal workflow visualization.

## CRM Gaps

Implement in `forge-crm` when the limitation is domain-specific:

- lead fields and scoring rules;
- CRM pipeline stage templates;
- proposal and contract templates;
- support SLA defaults;
- marketing campaign templates;
- CRM views and dashboards;
- CRM-specific external channel adapters after Forge authorizes them.

## Evidence

Every gap report should include:

- triggering CRM workflow;
- missing Forge contract;
- temporary impact;
- proposed `forge-core` file or module;
- validation evidence required before the CRM can consume it.

