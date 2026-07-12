const assert = require("node:assert");
const test = require("node:test");

const {
  validateExecutionId,
} = require("../../src/validators/workflowExecutionSteps.validator");

const validUuid = "11111111-1111-4111-8111-111111111111";

test("validateExecutionId accepts valid execution IDs", () => {
  assert.deepStrictEqual(validateExecutionId(validUuid), []);
});

test("validateExecutionId accepts nil UUIDs for not found lookups", () => {
  assert.deepStrictEqual(
    validateExecutionId("00000000-0000-0000-0000-000000000000"),
    []
  );
});

test("validateExecutionId requires an execution ID", () => {
  assert.deepStrictEqual(validateExecutionId(undefined), [
    {
      field: "executionId",
      message: "Workflow execution ID is required",
    },
  ]);
});

test("validateExecutionId rejects non-string execution IDs", () => {
  assert.deepStrictEqual(validateExecutionId(123), [
    {
      field: "executionId",
      message: "Workflow execution ID must be a string",
    },
  ]);
});

test("validateExecutionId rejects invalid execution IDs", () => {
  assert.deepStrictEqual(validateExecutionId("not-a-uuid"), [
    {
      field: "executionId",
      message: "Workflow execution ID must be a valid UUID",
    },
  ]);
});
