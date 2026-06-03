const AppError = require("../../errors/AppError");
const workflowsRepository = require("../workflows/workflows.repository");
const workflowStepsRepository = require("./workflowSteps.repository");
const { safeRegisterAuditLog } = require("../../utils/safeAuditLog");
const {
  validateCreateWorkflowStep,
  validateWorkflowId,
} = require("../../validators/workflowSteps.validator");

async function listWorkflowSteps({ workflowId }) {
  const workflowIdErrors = validateWorkflowId(workflowId);

  if (workflowIdErrors.length > 0) {
    throw new AppError("Validation failed", 400, workflowIdErrors);
  }

  const workflow = await workflowsRepository.findById(workflowId);

  if (!workflow) {
    throw new AppError("Workflow not found", 404);
  }

  const items = await workflowStepsRepository.findByWorkflowId(workflowId);

  return {
    items,
  };
}

async function createWorkflowStep({
  workflowId,
  name,
  description = null,
  stepOrder,
  actionType,
  configuration = null,
  createdBy,
}) {
  const workflowIdErrors = validateWorkflowId(workflowId);

  if (workflowIdErrors.length > 0) {
    throw new AppError("Validation failed", 400, workflowIdErrors);
  }

  const validationErrors = validateCreateWorkflowStep({
    name,
    description,
    stepOrder,
    actionType,
    configuration,
  });

  if (validationErrors.length > 0) {
    throw new AppError("Validation failed", 400, validationErrors);
  }

  const workflow = await workflowsRepository.findById(workflowId);

  if (!workflow) {
    throw new AppError("Workflow not found", 404);
  }

  const existingStepOrder =
    await workflowStepsRepository.findByWorkflowIdAndStepOrder(
      workflowId,
      stepOrder
    );

  if (existingStepOrder) {
    throw new AppError("Workflow step order already exists for this workflow", 409);
  }

  const normalizedName = name.trim();
  const normalizedDescription =
    description === undefined || description === null ? null : description.trim();

  try {
    const createdStep = await workflowStepsRepository.create({
      workflowId,
      name: normalizedName,
      description: normalizedDescription,
      stepOrder,
      actionType,
      configuration,
    });

    await safeRegisterAuditLog({
      action: "WORKFLOW_STEP_CREATED",
      entity: "workflow_step",
      entityId: createdStep.id,
      actorId: createdBy,
      metadata: {
        workflowId: createdStep.workflow_id,
        name: createdStep.name,
        stepOrder: createdStep.step_order,
        actionType: createdStep.action_type,
      },
    });

    return createdStep;
  } catch (error) {
    if (error.code === "23505") {
      throw new AppError(
        "Workflow step order already exists for this workflow",
        409
      );
    }

    if (error.code === "23503") {
      throw new AppError("Workflow not found", 404);
    }

    throw error;
  }
}

module.exports = {
  listWorkflowSteps,
  createWorkflowStep,
};
