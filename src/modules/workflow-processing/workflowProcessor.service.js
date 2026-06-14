const AppError = require("../../errors/AppError");
const workflowExecutionsRepository = require("../workflow-executions/workflowExecutions.repository");
const workflowExecutionStepsRepository = require("../workflow-execution-steps/workflowExecutionSteps.repository");
const { safeRegisterAuditLog } = require("../../utils/safeAuditLog");
const { handleWorkflowStep } = require("./workflowStepHandlers");
const {
  validateWorkflowExecutionId,
} = require("../../validators/workflowExecutions.validator");

async function processWorkflowExecution({ executionId, processedBy }) {
  const validationErrors = validateWorkflowExecutionId(executionId);

  if (validationErrors.length > 0) {
    throw new AppError("Validation failed", 400, validationErrors);
  }

  if (!processedBy) {
    throw new AppError("Authenticated user is required", 401);
  }

  const execution = await workflowExecutionsRepository.findById(executionId);

  if (!execution) {
    throw new AppError("Workflow execution not found", 404);
  }

  if (execution.status !== "PENDING") {
    throw new AppError("Only PENDING workflow executions can be processed", 409);
  }

  const steps = await workflowExecutionStepsRepository.findByExecutionId(
    executionId
  );

  if (steps.length === 0) {
    throw new AppError("Workflow execution has no steps to process", 409);
  }

  // Atomically transition PENDING -> RUNNING. Only one caller can win this
  // claim, so concurrent worker and API processing requests cannot process the
  // same execution twice.
  const claimedExecution = await workflowExecutionsRepository.claimPendingExecution(
    {
      id: executionId,
    }
  );

  if (!claimedExecution) {
    throw new AppError(
      "Only PENDING workflow executions can be processed",
      409
    );
  }

  await safeRegisterAuditLog({
    action: "WORKFLOW_EXECUTION_PROCESS_STARTED",
    entity: "workflow_execution",
    entityId: executionId,
    actorId: processedBy,
    metadata: {
      workflowId: execution.workflow_id,
      stepsCount: steps.length,
    },
  });

  const stepOutputs = [];

  for (const step of steps) {
    await workflowExecutionStepsRepository.updateStatus({
      id: step.id,
      status: "RUNNING",
      startedAt: new Date(),
      errorMessage: null,
    });

    try {
      const handlerResult = await handleWorkflowStep(step);

      await workflowExecutionStepsRepository.updateStatus(
        {
          id: step.id,
          status: "COMPLETED",
          completedAt: new Date(),
          errorMessage: null,
        }
      );

      stepOutputs.push({
        executionStepId: step.id,
        stepId: step.step_id,
        stepOrder: step.step_order,
        actionType: step.action_type,
        output: handlerResult.output,
      });
    } catch (error) {
      await workflowExecutionStepsRepository.updateStatus({
        id: step.id,
        status: "FAILED",
        completedAt: new Date(),
        errorMessage: error.message,
      });

      const failedExecution = await workflowExecutionsRepository.updateStatus({
        id: executionId,
        status: "FAILED",
        completedAt: new Date(),
        result: {
          processedBy,
          stepsProcessed: stepOutputs.length,
          failedStep: {
            executionStepId: step.id,
            stepId: step.step_id,
            stepOrder: step.step_order,
            actionType: step.action_type,
            error: error.message,
          },
          steps: stepOutputs,
        },
      });

      await safeRegisterAuditLog({
        action: "WORKFLOW_EXECUTION_PROCESS_FAILED",
        entity: "workflow_execution",
        entityId: executionId,
        actorId: processedBy,
        metadata: {
          workflowId: execution.workflow_id,
          failedStepId: step.step_id,
          failedStepOrder: step.step_order,
          error: error.message,
        },
      });

      return failedExecution;
    }
  }

  const completedExecution = await workflowExecutionsRepository.updateStatus({
    id: executionId,
    status: "COMPLETED",
    completedAt: new Date(),
    result: {
      processedBy,
      stepsProcessed: stepOutputs.length,
      steps: stepOutputs,
    },
  });

  await safeRegisterAuditLog({
    action: "WORKFLOW_EXECUTION_PROCESS_COMPLETED",
    entity: "workflow_execution",
    entityId: executionId,
    actorId: processedBy,
    metadata: {
      workflowId: completedExecution.workflow_id,
      status: completedExecution.status,
      stepsProcessed: stepOutputs.length,
    },
  });

  return completedExecution;
}

module.exports = {
  processWorkflowExecution,
};
