const AppError = require("../../errors/AppError");
const workflowExecutionsRepository = require("../workflow-executions/workflowExecutions.repository");
const workflowExecutionStepsRepository = require("../workflow-execution-steps/workflowExecutionSteps.repository");
const { safeRegisterAuditLog } = require("../../utils/safeAuditLog");
const workflowStepHandlers = require("./workflowStepHandlers");
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

  if (!["PENDING", "RUNNING"].includes(execution.status)) {
    throw new AppError(
      "Only PENDING or RUNNING workflow executions can be processed",
      409
    );
  }

  const steps = await workflowExecutionStepsRepository.findByExecutionId(
    executionId
  );

  if (steps.length === 0) {
    throw new AppError("Workflow execution has no steps to process", 409);
  }

  // Atomically transition PENDING -> RUNNING. Retries from the same BullMQ job
  // can re-enter while the execution is already RUNNING after a retryable
  // technical failure.
  const claimedExecution =
    execution.status === "PENDING"
      ? await workflowExecutionsRepository.claimPendingExecution({
          id: executionId,
        })
      : execution;

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
      const handlerResult = await workflowStepHandlers.handleWorkflowStepWithContext({
        step,
        execution,
      });

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

      if (error.isRetryable === true) {
        await safeRegisterAuditLog({
          action: "WORKFLOW_EXECUTION_PROCESS_TECHNICAL_FAILURE",
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

        throw error;
      }

      // Finalize only while still RUNNING. If the execution was already
      // finalized concurrently (e.g. recovered as FAILED while this worker was
      // still alive), respect the existing terminal state instead of
      // overwriting it.
      const failedExecution =
        await workflowExecutionsRepository.finalizeRunningExecution({
          id: executionId,
          status: "FAILED",
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

      if (!failedExecution) {
        return finalizeConcurrentlyClaimedExecution({
          executionId,
          workflowId: execution.workflow_id,
          processedBy,
        });
      }

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

  const completedExecution =
    await workflowExecutionsRepository.finalizeRunningExecution({
      id: executionId,
      status: "COMPLETED",
      result: {
        processedBy,
        stepsProcessed: stepOutputs.length,
        steps: stepOutputs,
      },
    });

  if (!completedExecution) {
    return finalizeConcurrentlyClaimedExecution({
      executionId,
      workflowId: execution.workflow_id,
      processedBy,
    });
  }

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

// Handle the case where a finalize update matched no rows because the
// execution left RUNNING in the meantime (most likely the stale-running
// recovery already failed it). We do not overwrite the terminal state; we
// surface whatever state currently exists so the worker reports it faithfully.
async function finalizeConcurrentlyClaimedExecution({
  executionId,
  workflowId,
  processedBy,
}) {
  const currentExecution = await workflowExecutionsRepository.findById(
    executionId
  );

  await safeRegisterAuditLog({
    action: "WORKFLOW_EXECUTION_PROCESS_SKIPPED",
    entity: "workflow_execution",
    entityId: executionId,
    actorId: processedBy,
    metadata: {
      workflowId,
      reason: "Execution was already finalized before processing completed",
      currentStatus: currentExecution ? currentExecution.status : null,
    },
  });

  return currentExecution;
}

module.exports = {
  processWorkflowExecution,
};
