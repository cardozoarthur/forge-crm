# Adaptive Workflow Evolution

Forge CRM uses `crm.workflow.evolution` as the product-level dogfooding loop for Forge v0.6 and v0.7.

The CRM does not self-modify. It produces Forge-owned evidence:

- `crm_workflow_evolution_plan` for the observed bottleneck and candidate list;
- `crm_evolution_experiment` for the changelog and rollback plan;
- `crm_benchmark_report` for benchmark command and metric evidence;
- `crm_promotion_decision` for the blocked or approved promotion state;
- `crm_core_gap_report` when the CRM requires a missing Forge Core primitive.

The runtime contract is `crm.workflow.evolution.executor`, exposed through the web snapshot and TUI action registry. It prepares `forge improve`, `forge improve benchmark-event-policy` and `forge improve promote-event-policy` commands, but promotion remains blocked until benchmark evidence and explicit approval exist.

Core limitations discovered by this loop belong in `forge-core`. CRM-specific scoring, templates, dashboards and domain workflow definitions remain in `forge-crm`.
