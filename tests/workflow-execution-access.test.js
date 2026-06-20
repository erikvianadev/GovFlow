const assert = require("node:assert");
const path = require("node:path");
const test = require("node:test");

const accessPath = path.join(
  __dirname,
  "../src/modules/workflow-executions/workflowExecutionAccess.js"
);

const {
  canAccessExecution,
  assertCanAccessExecution,
  resolveListDepartmentScope,
} = require(accessPath);

const departmentA = "33333333-3333-4333-8333-333333333333";
const departmentB = "44444444-4444-4444-8444-444444444444";

test("ADMIN can access any execution regardless of department", () => {
  assert.strictEqual(
    canAccessExecution({ department_id: departmentA }, { role: "ADMIN" }),
    true
  );
  assert.strictEqual(
    canAccessExecution({ department_id: null }, { role: "ADMIN" }),
    true
  );
});

test("MANAGER can access executions only within their own department", () => {
  assert.strictEqual(
    canAccessExecution(
      { department_id: departmentA },
      { role: "MANAGER", department_id: departmentA }
    ),
    true
  );

  assert.strictEqual(
    canAccessExecution(
      { department_id: departmentA },
      { role: "MANAGER", department_id: departmentB }
    ),
    false
  );
});

test("MANAGER without a department is denied (fail closed)", () => {
  assert.strictEqual(
    canAccessExecution(
      { department_id: departmentA },
      { role: "MANAGER", department_id: null }
    ),
    false
  );

  // A null/null match must never be treated as access.
  assert.strictEqual(
    canAccessExecution(
      { department_id: null },
      { role: "MANAGER", department_id: null }
    ),
    false
  );
});

test("missing requester or unknown role is denied", () => {
  assert.strictEqual(
    canAccessExecution({ department_id: departmentA }, undefined),
    false
  );
  assert.strictEqual(
    canAccessExecution(
      { department_id: departmentA },
      { role: "OPERATOR", department_id: departmentA }
    ),
    false
  );
});

test("assertCanAccessExecution throws 404 (not 403) on denial to avoid enumeration", () => {
  assert.throws(
    () =>
      assertCanAccessExecution(
        { department_id: departmentA },
        { role: "MANAGER", department_id: departmentB }
      ),
    (error) =>
      error.statusCode === 404 &&
      error.message === "Workflow execution not found"
  );
});

test("assertCanAccessExecution passes for an authorized requester", () => {
  assert.doesNotThrow(() =>
    assertCanAccessExecution(
      { department_id: departmentA },
      { role: "MANAGER", department_id: departmentA }
    )
  );
});

test("resolveListDepartmentScope is unscoped for ADMIN", () => {
  assert.deepStrictEqual(resolveListDepartmentScope({ role: "ADMIN" }), {
    scoped: false,
    departmentId: null,
  });
});

test("resolveListDepartmentScope restricts MANAGER to their department", () => {
  assert.deepStrictEqual(
    resolveListDepartmentScope({ role: "MANAGER", department_id: departmentA }),
    { scoped: true, departmentId: departmentA }
  );
});

test("resolveListDepartmentScope yields a null (deny-all) scope for MANAGER without a department", () => {
  assert.deepStrictEqual(
    resolveListDepartmentScope({ role: "MANAGER", department_id: null }),
    { scoped: true, departmentId: null }
  );
});

test("resolveListDepartmentScope denies an absent requester", () => {
  assert.deepStrictEqual(resolveListDepartmentScope(undefined), {
    scoped: true,
    departmentId: null,
  });
});
