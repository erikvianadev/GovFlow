const assert = require("node:assert");
const path = require("node:path");
const test = require("node:test");

const accessPath = path.join(
  __dirname,
  "../src/modules/workflows/workflowsAccess.js"
);

const {
  canAccessWorkflow,
  assertCanAccessWorkflow,
  assertCanCreateInDepartment,
  resolveListDepartmentScope,
} = require(accessPath);

const departmentA = "33333333-3333-4333-8333-333333333333";
const departmentB = "44444444-4444-4444-8444-444444444444";

test("ADMIN can access any workflow regardless of department", () => {
  assert.strictEqual(
    canAccessWorkflow({ department_id: departmentA }, { role: "ADMIN" }),
    true
  );
  assert.strictEqual(
    canAccessWorkflow({ department_id: null }, { role: "ADMIN" }),
    true
  );
});

test("MANAGER can access workflows only within their own department", () => {
  assert.strictEqual(
    canAccessWorkflow(
      { department_id: departmentA },
      { role: "MANAGER", department_id: departmentA }
    ),
    true
  );

  assert.strictEqual(
    canAccessWorkflow(
      { department_id: departmentA },
      { role: "MANAGER", department_id: departmentB }
    ),
    false
  );
});

test("MANAGER without a department is denied (fail closed)", () => {
  assert.strictEqual(
    canAccessWorkflow(
      { department_id: departmentA },
      { role: "MANAGER", department_id: null }
    ),
    false
  );

  // A null/null match must never be treated as access.
  assert.strictEqual(
    canAccessWorkflow(
      { department_id: null },
      { role: "MANAGER", department_id: null }
    ),
    false
  );
});

test("missing requester or unknown role is denied", () => {
  assert.strictEqual(
    canAccessWorkflow({ department_id: departmentA }, undefined),
    false
  );
  assert.strictEqual(
    canAccessWorkflow(
      { department_id: departmentA },
      { role: "OPERATOR", department_id: departmentA }
    ),
    false
  );
});

test("assertCanAccessWorkflow throws 404 (not 403) on denial to avoid enumeration", () => {
  assert.throws(
    () =>
      assertCanAccessWorkflow(
        { department_id: departmentA },
        { role: "MANAGER", department_id: departmentB }
      ),
    (error) => error.statusCode === 404 && error.message === "Workflow not found"
  );
});

test("assertCanAccessWorkflow passes for an authorized requester", () => {
  assert.doesNotThrow(() =>
    assertCanAccessWorkflow(
      { department_id: departmentA },
      { role: "MANAGER", department_id: departmentA }
    )
  );
});

test("assertCanCreateInDepartment allows ADMIN to target any department, including none", () => {
  assert.doesNotThrow(() =>
    assertCanCreateInDepartment(departmentA, { role: "ADMIN" })
  );
  assert.doesNotThrow(() =>
    assertCanCreateInDepartment(null, { role: "ADMIN" })
  );
});

test("assertCanCreateInDepartment allows MANAGER to target only their own department", () => {
  assert.doesNotThrow(() =>
    assertCanCreateInDepartment(departmentA, {
      role: "MANAGER",
      department_id: departmentA,
    })
  );
});

test("assertCanCreateInDepartment throws 404 for MANAGER targeting another department", () => {
  assert.throws(
    () =>
      assertCanCreateInDepartment(departmentB, {
        role: "MANAGER",
        department_id: departmentA,
      }),
    (error) =>
      error.statusCode === 404 && error.message === "Department not found"
  );
});

test("assertCanCreateInDepartment throws 404 for MANAGER targeting no department (fail closed)", () => {
  assert.throws(
    () =>
      assertCanCreateInDepartment(null, {
        role: "MANAGER",
        department_id: departmentA,
      }),
    (error) =>
      error.statusCode === 404 && error.message === "Department not found"
  );
});

test("assertCanCreateInDepartment throws 404 for MANAGER without a department (fail closed)", () => {
  assert.throws(
    () =>
      assertCanCreateInDepartment(departmentA, {
        role: "MANAGER",
        department_id: null,
      }),
    (error) =>
      error.statusCode === 404 && error.message === "Department not found"
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
