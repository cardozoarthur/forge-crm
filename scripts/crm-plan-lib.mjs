const moduleTasks = [
  {
    id: "task-001",
    title: "Confirm Forge CRM tenant policy and Addon authorization",
    dependencies: [],
    executor: "command",
    context_requirements: ["tenant policy", "Addon permission gates", "operator approval"],
    expected_output: "Authorized CRM tenant bootstrap plan",
    validation_rules: [
      { kind: "permission", expected: "crm.workflow.mutate approval is present before mutating workflows" },
      { kind: "audit", expected: "tenant, operator and source Addon are recorded" }
    ]
  },
  {
    id: "task-002",
    title: "Model CRM entities as workflow-backed records",
    dependencies: ["task-001"],
    executor: "mixed",
    context_requirements: ["relationship scope", "commercial scope", "support scope", "marketing scope"],
    expected_output: "Workflow-backed CRM entity graph",
    validation_rules: [
      { kind: "schema", expected: "lead, contact, company, opportunity, ticket, document and campaign entities map to workflow ids" },
      { kind: "lineage", expected: "state changes are audit-visible as Forge events" }
    ]
  },
  {
    id: "task-003",
    title: "Create relationship and pipeline workflows",
    dependencies: ["task-002"],
    executor: "mixed",
    context_requirements: ["pipeline stages", "funnel definitions", "ownership rules"],
    expected_output: "Relationship workflows and Kanban pipeline views",
    validation_rules: [
      { kind: "workflow", expected: "opportunity movement is represented as workflow state transitions" },
      { kind: "memory", expected: "timeline uses scoped organization/project memory" }
    ]
  },
  {
    id: "task-004",
    title: "Create commercial document workflows",
    dependencies: ["task-003"],
    executor: "mixed",
    context_requirements: ["offer terms", "approval policy", "artifact templates"],
    expected_output: "Proposal, contract, signature and follow-up workflow chain",
    validation_rules: [
      { kind: "artifact", expected: "proposal and contract outputs are Forge artifacts" },
      { kind: "approval", expected: "external delivery is blocked until approval passes" }
    ]
  },
  {
    id: "task-005",
    title: "Create omnichannel support and SLA workflows",
    dependencies: ["task-002"],
    executor: "mixed",
    context_requirements: ["channel policy", "SLA definitions", "support ownership"],
    expected_output: "Ticket, SLA and omnichannel queue workflows",
    validation_rules: [
      { kind: "event", expected: "email, WhatsApp, Telegram and chat events enter through Forge inbox adapters" },
      { kind: "waiting_state", expected: "SLA waits and escalations are explicit workflow states" }
    ]
  },
  {
    id: "task-006",
    title: "Create marketing campaign workflows",
    dependencies: ["task-002"],
    executor: "mixed",
    context_requirements: ["segment rules", "campaign calendar", "lead nurture policy"],
    expected_output: "Campaign, segmentation, landing page, form and nurture workflows",
    validation_rules: [
      { kind: "schedule", expected: "nurture steps use Forge schedules or wait nodes" },
      { kind: "artifact", expected: "campaign emails and landing pages are attached artifacts" }
    ]
  },
  {
    id: "task-007",
    title: "Create operations, project and handoff workflows",
    dependencies: ["task-004", "task-005"],
    executor: "mixed",
    context_requirements: ["handoff rules", "project templates", "approval queues"],
    expected_output: "Internal operations workflow pack",
    validation_rules: [
      { kind: "ownership", expected: "handoffs expose owner, waiting reason and next action" },
      { kind: "approval", expected: "document and task approvals are revisioned" }
    ]
  },
  {
    id: "task-008",
    title: "Wire CRM AI copilots through bounded Forge runtime contracts",
    dependencies: ["task-003", "task-004", "task-005", "task-006"],
    executor: "ai",
    context_requirements: ["lead evidence", "opportunity context", "document artifacts", "risk policy"],
    expected_output: "Lead classifier, opportunity prioritizer and next-step recommender contracts",
    validation_rules: [
      { kind: "executor_policy", expected: "AI recommendations do not mutate CRM state without workflow approval" },
      { kind: "observability", expected: "cost, confidence and evidence are inspectable" }
    ]
  },
  {
    id: "task-009",
    title: "Expose hybrid Forge TUI and CRM web views",
    dependencies: ["task-007", "task-008"],
    executor: "mixed",
    context_requirements: ["Addon views", "design system tokens", "workflow graph state"],
    expected_output: "TUI panels and web views for CRM workflows",
    validation_rules: [
      { kind: "ui", expected: "workflow graph and CRM board state remain inspectable" },
      { kind: "permission", expected: "view actions respect Addon permission gates" }
    ]
  },
  {
    id: "task-010",
    title: "Package validation evidence and Forge Core gap report",
    dependencies: ["task-009"],
    executor: "command",
    context_requirements: ["validation output", "Core capability gaps", "artifact manifest"],
    expected_output: "CRM validation package and forge-core backlog artifact",
    validation_rules: [
      { kind: "validation", expected: "Addon catalog validation passes" },
      { kind: "core_boundary", expected: "runtime limitations are filed for forge-core instead of patched around inside CRM" }
    ]
  }
];

export function buildCrmPlan(goal = "Create a workflow-first enterprise CRM on Forge") {
  return {
    schema_version: "forge.addon_planning_strategy_result.v1",
    status: "planned",
    planner: {
      addon_id: "forge.addon.crm",
      contract_id: "crm.factory.planning",
      entrypoint: "forge_crm.plan_system"
    },
    goal,
    principle: "Forge is a factory/framework for agentic workflow systems.",
    plan: {
      title: "Forge CRM system bootstrap",
      workflow_extension_id: "crm_workflow_factory_system_bootstrap",
      tasks: moduleTasks
    },
    tasks: moduleTasks,
    artifacts: [
      {
        kind: "crm_system_blueprint",
        path: "workflows/crm-system-template.json",
        description: "CRM domain modules mapped to Forge workflow contracts."
      },
      {
        kind: "crm_core_gap_report",
        path: "docs/forge-core-gap-policy.md",
        description: "Policy for promoting Forge Core limitations found during CRM implementation."
      }
    ],
    core_gap_policy: {
      repository: "forge-core",
      rule: "If the gap belongs to workflow runtime, memory, artifacts, observability, approvals, schedules, triggers or executor policy, implement it in forge-core first."
    }
  };
}
