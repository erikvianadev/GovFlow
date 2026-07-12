const assert = require("node:assert");
const test = require("node:test");

const {
  validateCreateWorkflow,
  validateListWorkflowsFilters,
  validateWorkflowId,
} = require("../../src/validators/workflows.validator");

const validUuid = "11111111-1111-4111-8111-111111111111";

test("validateCreateWorkflow accepts a valid workflow payload", () => {
  const errors = validateCreateWorkflow({
    name: "Fluxo de Aprovação Técnica",
    description: "Workflow para validar solicitações técnicas.",
    departmentId: validUuid,
  });

  assert.deepStrictEqual(errors, []);
});

test("validateCreateWorkflow rejects invalid fields", () => {
  const errors = validateCreateWorkflow({
    name: "",
    description: 123,
    departmentId: "not-a-uuid",
  });

  assert.deepStrictEqual(errors, [
    {
      field: "name",
      message: "Name cannot be empty",
    },
    {
      field: "description",
      message: "Description must be a string",
    },
    {
      field: "departmentId",
      message: "Department ID must be a valid UUID",
    },
  ]);
});

test("validateListWorkflowsFilters accepts valid filters", () => {
  const errors = validateListWorkflowsFilters({
    departmentId: validUuid,
    createdBy: validUuid,
    isActive: "true",
  });

  assert.deepStrictEqual(errors, []);
});

test("validateListWorkflowsFilters rejects invalid filters", () => {
  const errors = validateListWorkflowsFilters({
    departmentId: "invalid",
    createdBy: 123,
    isActive: "yes",
  });

  assert.deepStrictEqual(errors, [
    {
      field: "departmentId",
      message: "Department ID must be a valid UUID",
    },
    {
      field: "createdBy",
      message: "Created by must be a string",
    },
    {
      field: "isActive",
      message: "isActive must be either true or false",
    },
  ]);
});

test("validateWorkflowId validates route IDs", () => {
  assert.deepStrictEqual(validateWorkflowId(validUuid), []);
  assert.deepStrictEqual(validateWorkflowId("not-a-uuid"), [
    {
      field: "id",
      message: "Id must be a valid UUID",
    },
  ]);
});
