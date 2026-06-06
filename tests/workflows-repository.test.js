const assert = require("node:assert");
const test = require("node:test");

const {
  buildWorkflowsFiltersQuery,
} = require("../src/modules/workflows/workflows.repository");

test("buildWorkflowsFiltersQuery builds no WHERE clause without filters", () => {
  const result = buildWorkflowsFiltersQuery({});

  assert.deepStrictEqual(result, {
    whereClause: "",
    values: [],
  });
});

test("buildWorkflowsFiltersQuery builds ordered parameterized filters", () => {
  const result = buildWorkflowsFiltersQuery({
    departmentId: "department-id",
    createdBy: "user-id",
    isActive: true,
  });

  assert.deepStrictEqual(result, {
    whereClause:
      "WHERE workflows.department_id = $1 AND workflows.created_by = $2 AND workflows.is_active = $3",
    values: ["department-id", "user-id", true],
  });
});
