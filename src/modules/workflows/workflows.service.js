const AppError = require("../../errors/AppError");
const workflowsRepository = require("./workflows.repository");
const departmentsRepository = require("../departments/departments.repository");
const { safeRegisterAuditLog } = require("../../utils/safeAuditLog");
const {
  validateCreateWorkflow,
  validateListWorkflowsFilters,
  validateWorkflowId,
} = require("../../validators/workflows.validator");

async function listWorkflows({
  page = 1,
  limit = 20,
  departmentId,
  createdBy,
  isActive,
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

async function getWorkflowById(id) {
  const validationErrors = validateWorkflowId(id);

  if (validationErrors.length > 0) {
    throw new AppError("Invalid workflow ID", 400, validationErrors);
  }

  const workflow = await workflowsRepository.findById(id);

  if (!workflow) {
    throw new AppError("Workflow not found", 404);
  }

  return workflow;
}

async function createWorkflow({
  name,
  description = null,
  departmentId = null,
  createdBy,
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

module.exports = {
  listWorkflows,
  getWorkflowById,
  createWorkflow,
};
