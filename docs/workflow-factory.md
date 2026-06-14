# Workflow Factory Model

Forge CRM treats the CRM as a generated workflow system:

1. A business goal enters Forge.
2. The CRM Addon resolves relevant CRM capabilities.
3. Forge selects approved runtime contracts.
4. The planner emits workflow-backed CRM modules.
5. Forge validates the graph, permissions and artifact plan.
6. CRM workers execute bounded tasks.
7. Forge owns checkpoints, approvals, memory, artifacts and observability.
8. Core gaps are sent back to `forge-core` before CRM-specific workarounds are accepted.

This model is the product benchmark for Forge v0.5, v0.6 and v0.7.

