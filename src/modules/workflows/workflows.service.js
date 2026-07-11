const AppError = require("../../errors/AppError");
const workflowsRepository = require("./workflows.repository");
const departmentsRepository = require("../departments/departments.repository");
const { safeRegisterAuditLog } = require("../../utils/safeAuditLog");
const {
  assertCanAccessWorkflow,
  assertCanCreateInDepartment,
  resolveListDepartmentScope,
} = require("./workflowsAccess");
const {
  validateCreateWorkflow,
  validateUpdateWorkflow,
  validateListWorkflowsFilters,
  validateWorkflowId,
} = require("../../validators/workflows.validator");

async function listWorkflows({
  page = 1,
  limit = 20,
  departmentId,
  createdBy,
  isActive,
  requester,
}) {
  const validationErrors = validateListWorkflowsFilters({
    departmentId,
    createdBy,
    isActive,
  });

  if (validationErrors.length > 0) {
    throw new AppError("Validation failed", 400, validationErrors);
  }

  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const offset = (safePage - 1) * safeLimit;

  const normalizedFilters = {
    departmentId: departmentId || null,
    createdBy: createdBy || null,
    isActive:
      isActive === undefined || isActive === null || isActive === ""
        ? null
        : isActive === "true",
  };

  // Object-level scoping: ADMIN lists everything; MANAGER is restricted to
  // workflows within their own department. A MANAGER without a department
  // resolves to a null scope and sees an empty result (fail closed). If the
  // caller also supplied an explicit `departmentId` filter that conflicts
  // with the requester's own department, the intersection is empty rather
  // than silently substituting the requester's department — this avoids
  // both leaking other departments' data and surprising overrides.
  const departmentScope = resolveListDepartmentScope(requester);

  if (departmentScope.scoped) {
    if (
      !departmentScope.departmentId ||
      (normalizedFilters.departmentId &&
        normalizedFilters.departmentId !== departmentScope.departmentId)
    ) {
      return {
        items: [],
        pagination: {
          page: safePage,
          limit: safeLimit,
          total: 0,
          totalPages: 0,
        },
      };
    }

    normalizedFilters.departmentId = departmentScope.departmentId;
  }

  const [items, total] = await Promise.all([
    workflowsRepository.findAll({
      limit: safeLimit,
      offset,
      filters: normalizedFilters,
    }),
    workflowsRepository.countAll({
      filters: normalizedFilters,
    }),
  ]);

  return {
    items,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
}

async function getWorkflowById(id, requester) {
  const validationErrors = validateWorkflowId(id);

  if (validationErrors.length > 0) {
    throw new AppError("Invalid workflow ID", 400, validationErrors);
  }

  const workflow = await workflowsRepository.findById(id);

  if (!workflow) {
    throw new AppError("Workflow not found", 404);
  }

  // Enforce department scope (throws 404 on cross-department access).
  assertCanAccessWorkflow(workflow, requester);

  return workflow;
}

async function createWorkflow({
  name,
  description = null,
  departmentId = null,
  createdBy,
  requester,
}) {
  const validationErrors = validateCreateWorkflow({
    name,
    description,
    departmentId,
  });

  if (validationErrors.length > 0) {
    throw new AppError("Validation failed", 400, validationErrors);
  }

  if (!createdBy) {
    throw new AppError("Authenticated user is required", 401);
  }

  // Object-level scoping: a MANAGER may only create workflows within their
  // own department; ADMIN may target any department (including none).
  // Denial is 404, matching the "Department not found" thrown below for a
  // genuinely nonexistent department, so a MANAGER cannot distinguish
  // "not mine" from "does not exist".
  assertCanCreateInDepartment(departmentId, requester);

  const normalizedName = name.trim();
  const normalizedDescription =
    description === undefined || description === null ? null : description.trim();

  if (departmentId) {
    const department = await departmentsRepository.findById(departmentId);

    if (!department) {
      throw new AppError("Department not found", 404);
    }
  }

  try {
    const createdWorkflow = await workflowsRepository.create({
      name: normalizedName,
      description: normalizedDescription,
      departmentId: departmentId || null,
      createdBy,
    });

    await safeRegisterAuditLog({
      action: "WORKFLOW_CREATED",
      entity: "workflow",
      entityId: createdWorkflow.id,
      actorId: createdBy,
      metadata: {
        name: createdWorkflow.name,
        departmentId: createdWorkflow.department_id,
      },
    });

    return createdWorkflow;
  } catch (error) {
    if (error.code === "23503") {
      throw new AppError("Department not found", 404);
    }

    throw error;
  }
}

async function updateWorkflow(id, { isActive }, requester) {
  const idValidationErrors = validateWorkflowId(id);

  if (idValidationErrors.length > 0) {
    throw new AppError("Invalid workflow ID", 400, idValidationErrors);
  }

  const validationErrors = validateUpdateWorkflow({ isActive });

  if (validationErrors.length > 0) {
    throw new AppError("Validation failed", 400, validationErrors);
  }

  const workflow = await workflowsRepository.findById(id);

  if (!workflow) {
    throw new AppError("Workflow not found", 404);
  }

  // Enforce object-level access before mutating (throws 404 on denial, never
  // 403 — reuses the same access module as read access, so a MANAGER cannot
  // distinguish "not yours" from "does not exist").
  assertCanAccessWorkflow(workflow, requester);

  const updatedWorkflow = await workflowsRepository.update({ id, isActive });

  await safeRegisterAuditLog({
    action: "WORKFLOW_UPDATED",
    entity: "workflow",
    entityId: updatedWorkflow.id,
    actorId: requester && requester.id,
    metadata: {
      isActive: updatedWorkflow.is_active,
    },
  });

  return updatedWorkflow;
}

module.exports = {
  listWorkflows,
  getWorkflowById,
  createWorkflow,
  updateWorkflow,
};
