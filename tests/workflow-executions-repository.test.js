const assert = require("node:assert");
const test = require("node:test");

const {
  buildWorkflowExecutionsFiltersQuery,
} = require("../src/modules/workflow-executions/workflowExecutions.repository");

test("buildWorkflowExecutionsFiltersQuery builds no WHERE clause without filters", () => {
  const result = buildWorkflowExecutionsFiltersQuery({});

  assert.deepStrictEqual(result, {
    whereClause: "",
    values: [],
  });
});

test("buildWorkflowExecutionsFiltersQuery builds ordered parameterized filters", () => {
  const result = buildWorkflowExecutionsFiltersQuery({
    workflowId: "workflow-id",
    startedBy: "user-id",
    status: "PENDING",
  });

  assert.deepStrictEqual(result, {
    whereClause:
      "WHERE workflow_executions.workflow_id = $1 AND workflow_executions.started_by = $2 AND workflow_executions.status = $3",
    values: ["workflow-id", "user-id", "PENDING"],
  });
});
