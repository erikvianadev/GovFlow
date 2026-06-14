const AppError = require("../../errors/AppError");
const database = require("../../config/database");
const env = require("../../config/env");
const workflowExecutionsRepository = require("../workflow-executions/workflowExecutions.repository");
const workflowExecutionStepsRepository = require("../workflow-execution-steps/workflowExecutionSteps.repository");
const { safeRegisterAuditLog } = require("../../utils/safeAuditLog");
const {
  validateRecoverStaleRunning,
  MAX_RECOVERY_LIMIT,
} = require("../../validators/workflowExecutions.validator");

const DEFAULT_RECOVERY_LIMIT = MAX_RECOVERY_LIMIT;
const RECOVERY_REASON = "Execution timed out while running";

// Thrown inside the recovery transaction when the execution is no longer stale
// RUNNING (another recovery run or a worker finalized it first). Throwing rolls
// back the step failures we may have already applied in the same transaction,
// so we never leave steps FAILED under an execution we did not finalize.
class StaleRecoveryRaceLost extends Error {}

function resolveTimeoutMinutes(timeoutMinutes) {
  const parsedValue = Number(timeoutMinutes);

  if (Number.isFinite(parsedValue) && parsedValue > 0) {
    return parsedValue;
  }

  return env.workflowExecution.runningTimeoutMinutes;
}

function resolveLimit(limit) {
  const parsedValue = Number(limit);

  if (Number.isInteger(parsedValue) && parsedValue > 0) {
    return Math.min(parsedValue, MAX_RECOVERY_LIMIT);
  }

  return DEFAULT_RECOVERY_LIMIT;
}

async function recoverStaleRunningExecutions({
  recoveredBy = null,
  timeoutMinutes,
  limit,
} = {}) {
  const validationErrors = validateRecoverStaleRunning({ timeoutMinutes, limit });

  if (validationErrors.length > 0) {
    throw new AppError("Validation failed", 400, validationErrors);
  }

  const resolvedTimeoutMinutes = resolveTimeoutMinutes(timeoutMinutes);
  const resolvedLimit = resolveLimit(limit);
  const staleExecutions = await workflowExecutionsRepository.findStaleRunning({
    timeoutMinutes: resolvedTimeoutMinutes,
    limit: resolvedLimit,
  });

  const recoveredExecutions = [];

  for (const execution of staleExecutions) {
    let recoveryResult;

    try {
      recoveryResult = await database.transaction(async (trx) => {
        // Fail the RUNNING steps first so the complete recovery result can be
        // written in a single guarded execution update below.
        const failedSteps =
          await workflowExecutionStepsRepository.failRunningByExecutionId(
            {
              executionId: execution.id,
              errorMessage: RECOVERY_REASON,
            },
            trx
          );

        const result = {
          ...(execution.result || {}),
          recoveryReason: RECOVERY_REASON,
          recoveredBy,
          recoveredAt: new Date().toISOString(),
          timeoutMinutes: resolvedTimeoutMinutes,
          previousStatus: execution.status,
          failedRunningSteps: failedSteps.map((step) => ({
            executionStepId: step.id,
            stepId: step.step_id,
            error: RECOVERY_REASON,
          })),
        };

        // Single guarded write: only fails the execution while it is still a
        // stale RUNNING row. If it matches nothing, another actor finalized it
        // first, so we roll back the step failures applied above.
        const recoveredExecution =
          await workflowExecutionsRepository.failStaleRunning(
            {
              id: execution.id,
              timeoutMinutes: resolvedTimeoutMinutes,
              result,
            },
            trx
          );

        if (!recoveredExecution) {
          throw new StaleRecoveryRaceLost();
        }

        return {
          execution: recoveredExecution,
          failedSteps,
        };
      });
    } catch (error) {
      if (error instanceof StaleRecoveryRaceLost) {
        continue;
      }

      throw error;
    }

    await safeRegisterAuditLog({
      action: "WORKFLOW_EXECUTION_RECOVERY_FAILED",
      entity: "workflow_execution",
      entityId: recoveryResult.execution.id,
      actorId: recoveredBy,
      metadata: {
        workflowId: recoveryResult.execution.workflow_id,
        recoveryReason: RECOVERY_REASON,
        timeoutMinutes: resolvedTimeoutMinutes,
        failedRunningStepsCount: recoveryResult.failedSteps.length,
      },
    });

    recoveredExecutions.push({
      id: recoveryResult.execution.id,
      workflowId: recoveryResult.execution.workflow_id,
      status: recoveryResult.execution.status,
      startedAt: recoveryResult.execution.started_at,
      completedAt: recoveryResult.execution.completed_at,
      failedRunningStepsCount: recoveryResult.failedSteps.length,
      recoveryReason: RECOVERY_REASON,
    });
  }

  return {
    timeoutMinutes: resolvedTimeoutMinutes,
    scannedCount: staleExecutions.length,
    recoveredCount: recoveredExecutions.length,
    recoveredExecutions,
  };
}

module.exports = {
  recoverStaleRunningExecutions,
  RECOVERY_REASON,
};
