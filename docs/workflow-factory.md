# Workflow Factory Model

Forge CRM treats the CRM as a generated workflow system:

1. A business goal enters Forge.
2. The CRM Addon resolves relevant CRM capabilities.
3. Forge selects approved runtime contracts.
4. The planner emits workflow-backed CRM modules.
5. The tenant bootstrap executor emits a CRM workflow pack with explicit states, transitions, artifacts, events, permissions and validation gates.
6. Forge validates the graph, permissions and artifact plan.
7. CRM workers execute bounded tasks.
8. Forge owns checkpoints, approvals, memory, artifacts and observability.
9. Core gaps are sent back to `forge-core` before CRM-specific workarounds are accepted.
10. CRM web and TUI surfaces render Forge workflow snapshots and expose Forge command templates instead of owning CRM automation state.

This model is the product benchmark for Forge v0.5, v0.6 and v0.7.
