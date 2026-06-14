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
- CRM event adapters and planner contracts;
- CRM-specific workers that produce bounded outputs for Forge.

## Runtime Rule

No important CRM automation should bypass Forge. External tools may execute bounded work, but Forge owns the workflow, state transitions, approvals, memory scope, artifact attachment, event history and validation gates.

## Dogfooding Rule

When CRM implementation exposes a missing Forge capability, the fix belongs in `forge-core` first. The CRM repository may record the gap and consume the resulting contract after it exists.

