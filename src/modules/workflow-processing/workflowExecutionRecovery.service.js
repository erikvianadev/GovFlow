const database = require("../../config/database");
const env = require("../../config/env");
const workflowExecutionsRepository = require("../workflow-executions/workflowExecutions.repository");
const workflowExecutionStepsRepository = require("../workflow-execution-steps/workflowExecutionSteps.repository");
const { safeRegisterAuditLog } = require("../../utils/safeAuditLog");

const DEFAULT_RECOVERY_LIMIT = 100;
const RECOVERY_REASON = "Execution timed out while running";

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
    return Math.min(parsedValue, DEFAULT_RECOVERY_LIMIT);
  }

  return DEFAULT_RECOVERY_LIMIT;
}

async function recoverStaleRunningExecutions({
  recoveredBy = null,
  timeoutMinutes,
  limit,
} = {}) {
  const resolvedTimeoutMinutes = resolveTimeoutMinutes(timeoutMinutes);
  const resolvedLimit = resolveLimit(limit);
  const staleExecutions = await workflowExecutionsRepository.findStaleRunning({
    timeoutMinutes: resolvedTimeoutMinutes,
    limit: resolvedLimit,
  });

  const recoveredExecutions = [];

  for (const execution of staleExecutions) {
    const recoveryResult = await database.transaction(async (trx) => {
      const recoveredAt = new Date().toISOString();
      const baseResult = {
        ...(execution.result || {}),
        recoveryReason: RECOVERY_REASON,
        recoveredBy,
        recoveredAt,
        timeoutMinutes: resolvedTimeoutMinutes,
        previousStatus: execution.status,
      };

      const recoveredExecution = await workflowExecutionsRepository.failStaleRunning(
        {
          id: execution.id,
          timeoutMinutes: resolvedTimeoutMinutes,
          result: baseResult,
        },
        trx
      );

      if (!recoveredExecution) {
        return null;
      }

      const failedSteps =
        await workflowExecutionStepsRepository.failRunningByExecutionId(
          {
            executionId: execution.id,
            errorMessage: RECOVERY_REASON,
          },
          trx
        );

      const finalResult = {
        ...baseResult,
        failedRunningSteps: failedSteps.map((step) => ({
          executionStepId: step.id,
          stepId: step.step_id,
          error: RECOVERY_REASON,
        })),
      };

      const finalizedExecution = await workflowExecutionsRepository.updateStatus(
        {
          id: execution.id,
          status: "FAILED",
          result: finalResult,
        },
        trx
      );

      return {
        execution: finalizedExecution,
        failedSteps,
      };
    });

    if (!recoveryResult) {
      continue;
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
