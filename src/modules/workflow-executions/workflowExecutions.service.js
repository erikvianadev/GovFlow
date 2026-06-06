const AppError = require("../../errors/AppError");
const workflowsRepository = require("../workflows/workflows.repository");
const workflowExecutionsRepository = require("./workflowExecutions.repository");
const { safeRegisterAuditLog } = require("../../utils/safeAuditLog");
const {
  validateCreateWorkflowExecution,
  validateWorkflowId,
  validateWorkflowExecutionId,
  validateListWorkflowExecutionsFilters,
} = require("../../validators/workflowExecutions.validator");

async function listWorkflowExecutions({
  page = 1,
  limit = 20,
  workflowId,
  startedBy,
  status,
}) {
  const validationErrors = validateListWorkflowExecutionsFilters({
    workflowId,
    startedBy,
    status,
  });

  if (validationErrors.length > 0) {
    throw new AppError("Validation failed", 400, validationErrors);
  }

  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const offset = (safePage - 1) * safeLimit;

  const normalizedFilters = {
    workflowId: workflowId || null,
    startedBy: startedBy || null,
    status: status || null,
  };

  const [items, total] = await Promise.all([
    workflowExecutionsRepository.findAll({
      limit: safeLimit,
      offset,
      filters: normalizedFilters,
    }),
    workflowExecutionsRepository.countAll({
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

async function getWorkflowExecutionById(id) {
  const validationErrors = validateWorkflowExecutionId(id);

  if (validationErrors.length > 0) {
    throw new AppError("Validation failed", 400, validationErrors);
  }

  const execution = await workflowExecutionsRepository.findById(id);

  if (!execution) {
    throw new AppError("Workflow execution not found", 404);
  }

  return execution;
}

async function createWorkflowExecution({ workflowId, input = null, startedBy }) {
  const workflowIdErrors = validateWorkflowId(workflowId);

  if (workflowIdErrors.length > 0) {
    throw new AppError("Validation failed", 400, workflowIdErrors);
  }

  const validationErrors = validateCreateWorkflowExecution({
    input,
  });

  if (validationErrors.length > 0) {
    throw new AppError("Validation failed", 400, validationErrors);
  }

  if (!startedBy) {
    throw new AppError("Authenticated user is required", 401);
  }

  const workflow = await workflowsRepository.findById(workflowId);

  if (!workflow) {
    throw new AppError("Workflow not found", 404);
  }

  if (!workflow.is_active) {
    throw new AppError("Workflow is inactive", 409);
  }

  const execution = await workflowExecutionsRepository.create({
    workflowId,
    startedBy,
    input,
  });

  await safeRegisterAuditLog({
    action: "WORKFLOW_EXECUTION_CREATED",
    entity: "workflow_execution",
    entityId: execution.id,
    actorId: startedBy,
    metadata: {
      workflowId: execution.workflow_id,
      status: execution.status,
    },
  });

  return execution;
}

module.exports = {
  listWorkflowExecutions,
  getWorkflowExecutionById,
  createWorkflowExecution,
};
