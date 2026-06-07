const assert = require("node:assert");
const test = require("node:test");

const {
  validateCreateWorkflowExecution,
  validateWorkflowId,
  validateWorkflowExecutionId,
  validateListWorkflowExecutionsFilters,
} = require("../src/validators/workflowExecutions.validator");

const validUuid = "11111111-1111-4111-8111-111111111111";

test("validateCreateWorkflowExecution accepts empty or object input", () => {
  assert.deepStrictEqual(validateCreateWorkflowExecution({}), []);
  assert.deepStrictEqual(
    validateCreateWorkflowExecution({
      input: {
        requestId: "REQ-001",
        priority: "high",
      },
    }),
    []
  );
});

test("validateCreateWorkflowExecution rejects non-object input", () => {
  assert.deepStrictEqual(validateCreateWorkflowExecution({ input: [] }), [
    {
      field: "input",
      message: "Input must be an object",
    },
  ]);

  assert.deepStrictEqual(validateCreateWorkflowExecution({ input: "invalid" }), [
    {
      field: "input",
      message: "Input must be an object",
    },
  ]);
});

test("validateWorkflowId validates nested route workflowId", () => {
  assert.deepStrictEqual(validateWorkflowId(validUuid), []);
  assert.deepStrictEqual(validateWorkflowId("not-a-uuid"), [
    {
      field: "workflowId",
      message: "Workflow ID must be a valid UUID",
    },
  ]);
});

test("validateWorkflowExecutionId validates route IDs", () => {
  assert.deepStrictEqual(validateWorkflowExecutionId(validUuid), []);
  assert.deepStrictEqual(
    validateWorkflowExecutionId("00000000-0000-0000-0000-000000000000"),
    []
  );
  assert.deepStrictEqual(validateWorkflowExecutionId("not-a-uuid"), [
    {
      field: "id",
      message: "Workflow execution ID must be a valid UUID",
    },
  ]);
});

test("validateListWorkflowExecutionsFilters accepts valid filters", () => {
  const errors = validateListWorkflowExecutionsFilters({
    workflowId: validUuid,
    startedBy: validUuid,
    status: "PENDING",
  });

  assert.deepStrictEqual(errors, []);
});

test("validateListWorkflowExecutionsFilters rejects invalid filters", () => {
  const errors = validateListWorkflowExecutionsFilters({
    workflowId: "invalid",
    startedBy: 123,
    status: "INVALID",
  });

  assert.deepStrictEqual(errors, [
    {
      field: "workflowId",
      message: "Workflow ID must be a valid UUID",
    },
    {
      field: "startedBy",
      message: "Started by must be a string",
    },
    {
      field: "status",
      message: "Status must be one of: PENDING, RUNNING, COMPLETED, FAILED, CANCELED",
    },
  ]);
});
