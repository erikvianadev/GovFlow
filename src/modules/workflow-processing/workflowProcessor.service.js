const database = require("../../config/database");
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

  let processingError = null;

  const result = await database.transaction(async (trx) => {
    await workflowExecutionsRepository.updateStatus(
      {
        id: executionId,
        status: "RUNNING",
        startedAt: new Date(),
      },
      trx
    );

    const stepOutputs = [];

    for (const step of steps) {
      await workflowExecutionStepsRepository.updateStatus(
        {
          id: step.id,
          status: "RUNNING",
          startedAt: new Date(),
          errorMessage: null,
        },
        trx
      );

      try {
        const handlerResult = await handleWorkflowStep(step);

        await workflowExecutionStepsRepository.updateStatus(
          {
            id: step.id,
            status: "COMPLETED",
            completedAt: new Date(),
            errorMessage: null,
          },
          trx
        );

        stepOutputs.push({
          executionStepId: step.id,
          stepId: step.step_id,
          stepOrder: step.step_order,
          actionType: step.action_type,
          output: handlerResult.output,
        });
      } catch (error) {
        processingError = error;

        await workflowExecutionStepsRepository.updateStatus(
          {
            id: step.id,
            status: "FAILED",
            completedAt: new Date(),
            errorMessage: error.message,
          },
          trx
        );

        return workflowExecutionsRepository.updateStatus(
          {
            id: executionId,
            status: "FAILED",
            completedAt: new Date(),
            result: {
              error: error.message,
              processedBy,
              stepsProcessed: stepOutputs.length,
              failedStep: {
                executionStepId: step.id,
                stepId: step.step_id,
                stepOrder: step.step_order,
                actionType: step.action_type,
              },
              steps: stepOutputs,
            },
          },
          trx
        );
      }
    }

    return workflowExecutionsRepository.updateStatus(
      {
        id: executionId,
        status: "COMPLETED",
        completedAt: new Date(),
        result: {
          processedBy,
          stepsProcessed: stepOutputs.length,
          steps: stepOutputs,
        },
      },
      trx
    );
  });

  if (processingError) {
    await safeRegisterAuditLog({
      action: "WORKFLOW_EXECUTION_PROCESS_FAILED",
      entity: "workflow_execution",
      entityId: executionId,
      actorId: processedBy,
      metadata: {
        workflowId: result.workflow_id,
        status: result.status,
        error: processingError.message,
      },
    });

    throw processingError;
  }

  await safeRegisterAuditLog({
    action: "WORKFLOW_EXECUTION_PROCESS_COMPLETED",
    entity: "workflow_execution",
    entityId: executionId,
    actorId: processedBy,
    metadata: {
      workflowId: result.workflow_id,
      status: result.status,
    },
  });

  return result;
}

module.exports = {
  processWorkflowExecution,
};
