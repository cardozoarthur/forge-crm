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

The current CRM worker exposes five Forge runtime entrypoints:

- `forge_crm.plan_system` for CRM system planning;
- `forge_crm.classify_lead` for recommendation-only lead scoring;
- `forge_crm.generate_proposal` for draft proposal artifacts;
- `forge_crm.validate_document` for approval and lineage checks;
- `forge_crm.deliver_handoff` for approved omnichannel handoff receipts.

The worker returns Forge Addon result schemas and does not persist CRM state directly. State changes remain Forge workflow mutations or artifacts.

## Dogfooding Rule

When CRM implementation exposes a missing Forge capability, the fix belongs in `forge-core` first. The CRM repository may record the gap and consume the resulting contract after it exists.
