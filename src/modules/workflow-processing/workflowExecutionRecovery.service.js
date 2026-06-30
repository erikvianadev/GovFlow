const AppError = require("../../errors/AppError");
const database = require("../../config/database");
const env = require("../../config/env");
const logger = require("../../config/logger");
const workflowExecutionsRepository = require("../workflow-executions/workflowExecutions.repository");
const workflowExecutionStepsRepository = require("../workflow-execution-steps/workflowExecutionSteps.repository");
const jiraService = require("../jira/jira.service");
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

// Remote-assisted dedup (Sprint 6.4.3), read-only and best-effort. Runs
// BEFORE the recovery transaction so a slow/unreachable Jira never holds a
// database transaction open. Only JIRA_COMMENT steps are covered: GovFlow
// already embeds a stable marker in every comment it creates (see
// jiraService.buildExecutionStepMarker), so an existing comment is strong
// evidence the side effect already happened. JIRA_TRANSITION has no
// equivalent free-text marker and remains a documented residual risk,
// unchanged by this sprint.
//
// Returns a Map keyed by execution_step_id -> recovered output, for steps
// whose Jira comment was found. A step not present in the map (lookup
// disabled, not a JIRA_COMMENT step, or no matching comment found) keeps the
// existing, safe default: it is recorded FAILED by the recovery transaction.
async function findRemoteRecoveredStepOutputsById(executionId) {
  const steps = await workflowExecutionStepsRepository.findByExecutionId(
    executionId
  );

  const recoveredById = new Map();

  const runningJiraCommentSteps = steps.filter(
    (step) =>
      step.status === "RUNNING" &&
      step.action_type === "JIRA_COMMENT" &&
      Boolean(step.configuration?.issueKey)
  );

  for (const step of runningJiraCommentSteps) {
    const found = await jiraService.findCommentByExecutionStepMarker({
      issueKey: step.configuration.issueKey.trim(),
      executionStepId: step.id,
    });

    if (found) {
      recoveredById.set(step.id, {
        executionStepId: step.id,
        stepId: step.step_id,
        output: {
          provider: "jira",
          operation: "comment",
          issueKey: found.issueKey,
          commentId: found.commentId,
          status: "completed",
          idempotencyKey: `workflowExecutionStep:${step.id}`,
          recoveredViaRemoteLookup: true,
        },
      });
    }
  }

  return recoveredById;
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

  logger.info(
    {
      scannedCount: staleExecutions.length,
      timeoutMinutes: resolvedTimeoutMinutes,
    },
    "Stale-running recovery scan started"
  );

  const recoveredExecutions = [];

  for (const execution of staleExecutions) {
    let recoveryResult;

    // Read-only, outside any transaction: never hold a DB transaction open
    // while waiting on the Jira API.
    const recoveredStepOutputsById = await findRemoteRecoveredStepOutputsById(
      execution.id
    );

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

        // Steps confirmed via remote lookup were just exclusively locked by
        // the bulk fail update above (still within this same transaction), so
        // correcting them to COMPLETED here is safe: no other actor can have
        // touched the row between the two statements.
        const recoveredSteps = [];
        const remainingFailedSteps = [];

        for (const failedStep of failedSteps) {
          const recovered = recoveredStepOutputsById.get(failedStep.id);

          if (!recovered) {
            remainingFailedSteps.push(failedStep);
            continue;
          }

          const completedStep = await workflowExecutionStepsRepository.updateStatus(
            {
              id: failedStep.id,
              status: "COMPLETED",
              completedAt: new Date(),
              errorMessage: null,
              output: recovered.output,
            },
            trx
          );

          recoveredSteps.push({
            executionStepId: completedStep.id,
            stepId: completedStep.step_id,
            output: recovered.output,
          });
        }

        const result = {
          ...(execution.result || {}),
          recoveryReason: RECOVERY_REASON,
          recoveredBy,
          recoveredAt: new Date().toISOString(),
          timeoutMinutes: resolvedTimeoutMinutes,
          previousStatus: execution.status,
          failedRunningSteps: remainingFailedSteps.map((step) => ({
            executionStepId: step.id,
            stepId: step.step_id,
            error: RECOVERY_REASON,
          })),
          recoveredRunningSteps: recoveredSteps.map((step) => ({
            executionStepId: step.executionStepId,
            stepId: step.stepId,
            recoveredViaRemoteLookup: true,
          })),
        };

        // Single guarded write: only fails the execution while it is still a
        // stale RUNNING row. If it matches nothing, another actor finalized it
        // first, so we roll back the step failures (and any recovery
        // corrections) applied above.
        //
        // Note: the execution itself is always finalized FAILED here, even if
        // every RUNNING step turned out to be remotely confirmed COMPLETED.
        // The worker genuinely timed out; resurrecting the execution as
        // COMPLETED from a recovery pass is a separate, bigger decision this
        // sprint does not make. This sprint only corrects step-level truth so
        // a future retry/admin-reprocess never duplicates the Jira comment.
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
          failedSteps: remainingFailedSteps,
          recoveredSteps,
        };
      });
    } catch (error) {
      if (error instanceof StaleRecoveryRaceLost) {
        continue;
      }

      throw error;
    }

    logger.info(
      {
        executionId: recoveryResult.execution.id,
        failedRunningStepsCount: recoveryResult.failedSteps.length,
        recoveredRunningStepsCount: recoveryResult.recoveredSteps.length,
      },
      "Stale-running execution recovered"
    );

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
        recoveredRunningStepsCount: recoveryResult.recoveredSteps.length,
      },
    });

    for (const recoveredStep of recoveryResult.recoveredSteps) {
      await safeRegisterAuditLog({
        action: "WORKFLOW_EXECUTION_STEP_RECOVERED_VIA_JIRA_LOOKUP",
        entity: "workflow_execution_step",
        entityId: recoveredStep.executionStepId,
        actorId: recoveredBy,
        metadata: {
          workflowId: recoveryResult.execution.workflow_id,
          stepId: recoveredStep.stepId,
          output: recoveredStep.output,
        },
      });
    }

    recoveredExecutions.push({
      id: recoveryResult.execution.id,
      workflowId: recoveryResult.execution.workflow_id,
      status: recoveryResult.execution.status,
      startedAt: recoveryResult.execution.started_at,
      completedAt: recoveryResult.execution.completed_at,
      failedRunningStepsCount: recoveryResult.failedSteps.length,
      recoveredRunningStepsCount: recoveryResult.recoveredSteps.length,
      recoveryReason: RECOVERY_REASON,
    });
  }

  logger.info(
    {
      scannedCount: staleExecutions.length,
      recoveredCount: recoveredExecutions.length,
    },
    "Stale-running recovery scan finished"
  );

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
