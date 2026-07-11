const AppError = require("../../errors/AppError");

// Object-level (BOLA/IDOR) authorization for workflows.
//
// Access rules:
//   - ADMIN   : may access/mutate every workflow, in any department
//               (including department-less/global workflows).
//   - MANAGER : may access/mutate only workflows that belong to their own
//               department. A MANAGER without a department_id sees/creates
//               nothing (fail closed) instead of leaking other departments'
//               data.
//   - anyone else (or a missing requester): denied.
//
// `workflow` is expected to carry `department_id` directly — workflows own
// this column, so (unlike workflow executions) no join is required to
// resolve it.
function canAccessWorkflow(workflow, requester) {
  if (!workflow || !requester) {
    return false;
  }

  if (requester.role === "ADMIN") {
    return true;
  }

  if (requester.role === "MANAGER") {
    return (
      Boolean(requester.department_id) &&
      workflow.department_id === requester.department_id
    );
  }

  return false;
}

// Enforce object-level access, throwing 404 (never 403) on denial.
//
// Returning 404 for "exists but belongs to another department" makes it
// indistinguishable from "does not exist", so a MANAGER cannot probe for the
// existence of workflows outside their department (no cross-department
// enumeration).
function assertCanAccessWorkflow(workflow, requester) {
  if (!canAccessWorkflow(workflow, requester)) {
    throw new AppError("Workflow not found", 404);
  }
}

// Enforce that a requester may create a workflow targeting `departmentId`.
//
// Reuses the same department-match rule as read access: ADMIN may target any
// department (including none/null). MANAGER may only target their own
// department — a null or mismatched target department is denied exactly
// like an unknown one (404 "Department not found"), so a MANAGER attempting
// to create a workflow in another department cannot distinguish "that
// department is not mine" from "that department does not exist".
function assertCanCreateInDepartment(departmentId, requester) {
  if (!canAccessWorkflow({ department_id: departmentId || null }, requester)) {
    throw new AppError("Department not found", 404);
  }
}

// Resolve the department scope to apply to a list query for a given requester.
//
// Returns:
//   - { scoped: false }                       → no department restriction (ADMIN)
//   - { scoped: true, departmentId }          → restrict to this department
//   - { scoped: true, departmentId: null }    → requester can see nothing
function resolveListDepartmentScope(requester) {
  if (requester && requester.role === "ADMIN") {
    return { scoped: false, departmentId: null };
  }

  if (requester && requester.role === "MANAGER") {
    return { scoped: true, departmentId: requester.department_id || null };
  }

  // Unknown/absent requester: deny everything by scoping to an impossible value.
  return { scoped: true, departmentId: null };
}

module.exports = {
  canAccessWorkflow,
  assertCanAccessWorkflow,
  assertCanCreateInDepartment,
  resolveListDepartmentScope,
};
