const AppError = require("../../errors/AppError");

// Object-level (BOLA/IDOR) authorization for workflow executions.
//
// Access rules:
//   - ADMIN   : may access every execution.
//   - MANAGER : may access only executions whose workflow belongs to their own
//               department. A MANAGER without a department_id sees nothing
//               (fail closed) instead of leaking other departments' data.
//   - anyone else (or a missing requester): denied.
//
// `execution` is expected to carry `department_id` (resolved from the related
// workflow by the repository). When it is absent, access is denied.
function canAccessExecution(execution, requester) {
  if (!execution || !requester) {
    return false;
  }

  if (requester.role === "ADMIN") {
    return true;
  }

  if (requester.role === "MANAGER") {
    return (
      Boolean(requester.department_id) &&
      execution.department_id === requester.department_id
    );
  }

  return false;
}

// Enforce object-level access, throwing 404 (never 403) on denial.
//
// Returning 404 for "exists but belongs to another department" makes it
// indistinguishable from "does not exist", so a MANAGER cannot probe for the
// existence of executions outside their department (no cross-department
// enumeration).
function assertCanAccessExecution(execution, requester) {
  if (!canAccessExecution(execution, requester)) {
    throw new AppError("Workflow execution not found", 404);
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
  canAccessExecution,
  assertCanAccessExecution,
  resolveListDepartmentScope,
};
