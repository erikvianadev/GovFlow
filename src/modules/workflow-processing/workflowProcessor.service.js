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
    // Atomically claim the step (PENDING -> RUNNING). A claim that matches no
    // rows means the step is no longer PENDING, so we must not re-run its
    // handler (and therefore never duplicate an external Jira side effect on a
    // BullMQ retry). How we react depends on the step's current state.
    const claimedStep = await workflowExecutionStepsRepository.claimPendingStep({
      id: step.id,
    });

    if (!claimedStep) {
      // A previously COMPLETED step is the expected retry case: skip it
      // idempotently and keep it in the aggregated result so the execution
      // result preserves step count and ordering. Reuse the per-step output
      // persisted on the first run; fall back to a placeholder only for legacy
      // steps completed before the output column existed.
      if (step.status === "COMPLETED") {
        await safeRegisterAuditLog({
          action: "WORKFLOW_EXECUTION_STEP_SKIPPED",
          entity: "workflow_execution_step",
          entityId: step.id,
          actorId: processedBy,
          metadata: {
            workflowId: execution.workflow_id,
            stepId: step.step_id,
            stepOrder: step.step_order,
            reason: "already_completed",
          },
        });

        stepOutputs.push({
          executionStepId: step.id,
          stepId: step.step_id,
          stepOrder: step.step_order,
          actionType: step.action_type,
          output: step.output ?? { skipped: true, reason: "already_completed" },
        });

        continue;
      }

      // A previously FAILED step is a terminal/business failure already recorded
      // on an earlier attempt. Do not re-run the handler or throw a retryable
      // error (which would burn BullMQ attempts and leave the execution RUNNING
      // until stale recovery). Finalize the execution as FAILED right away,
      // reusing the same guarded finalize as a fresh business failure.
      if (step.status === "FAILED") {
        const failedStepError =
          step.error_message || "Workflow execution step already failed";

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
                error: failedStepError,
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
            error: failedStepError,
          },
        });

        return failedExecution;
      }

      // Any other non-claimable state (RUNNING left by a crashed attempt, or a
      // PENDING snapshot lost to a concurrent claim) is unresolvable here: we
      // cannot confirm completion, so we must not call the handler nor finalize
      // the execution as COMPLETED. Raise a controlled retryable error so BullMQ
      // retries; the step is left untouched for the next attempt (or the
      // stale-running recovery) to resolve.
      const reason =
        step.status === "RUNNING" ? "running_unresolved" : "claim_failed";

      await safeRegisterAuditLog({
        action: "WORKFLOW_EXECUTION_STEP_SKIPPED",
        entity: "workflow_execution_step",
        entityId: step.id,
        actorId: processedBy,
        metadata: {
          workflowId: execution.workflow_id,
          stepId: step.step_id,
          stepOrder: step.step_order,
          currentStatus: step.status || null,
          reason,
        },
      });

      const claimError = new Error(
        `Workflow execution step ${step.id} could not be claimed (status: ${
          step.status || "unknown"
        })`
      );
      claimError.isRetryable = true;

      throw claimError;
    }

    // Local, persisted-output dedup (defense in depth): if the claimed step
    // already carries output proving its Jira operation was applied (a created
    // comment or an applied transition), do not call the handler (and therefore
    // never call Jira again); reuse the persisted output instead. This is purely
    // local dedup based on persisted output: it does NOT cover a hard crash
    // between the Jira response and persisting the output, which remains a known
    // residual risk for a future phase.
    const dedupReason = getExternalOperationDedupReason(step.output);

    if (dedupReason) {
      await safeRegisterAuditLog({
        action: "WORKFLOW_EXECUTION_STEP_SKIPPED",
        entity: "workflow_execution_step",
        entityId: step.id,
        actorId: processedBy,
        metadata: {
          workflowId: execution.workflow_id,
          stepId: step.step_id,
          stepOrder: step.step_order,
          reason: dedupReason,
        },
      });

      await workflowExecutionStepsRepository.updateStatus({
        id: step.id,
        status: "COMPLETED",
        completedAt: new Date(),
        errorMessage: null,
        output: step.output,
      });

      stepOutputs.push({
        executionStepId: step.id,
        stepId: step.step_id,
        stepOrder: step.step_order,
        actionType: step.action_type,
        output: step.output,
      });

      continue;
    }

    try {
      const handlerResult = await workflowStepHandlers.handleWorkflowStepWithContext({
        step,
        execution,
      });

      // Stamp the idempotency key and persist the external operation metadata on
      // the step itself, so a future retry can observe what already happened.
      // The exact same enriched output feeds the aggregated execution result.
      const enrichedOutput = enrichStepOutput({
        step,
        output: handlerResult.output,
      });

      await workflowExecutionStepsRepository.updateStatus(
        {
          id: step.id,
          status: "COMPLETED",
          completedAt: new Date(),
          errorMessage: null,
          output: enrichedOutput,
        }
      );

      stepOutputs.push({
        executionStepId: step.id,
        stepId: step.step_id,
        stepOrder: step.step_order,
        actionType: step.action_type,
        output: enrichedOutput,
      });
    } catch (error) {
      if (error.isRetryable === true) {
        // Revert the claimed step back to PENDING so the BullMQ retry can
        // re-claim only this step. FAILED is reserved for terminal/business
        // failures; leaving a retryable failure as FAILED would make the guard
        // skip the very step that must be retried.
        await workflowExecutionStepsRepository.updateStatus({
          id: step.id,
          status: "PENDING",
          completedAt: null,
          errorMessage: error.message,
        });

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

      // Terminal/business failure: mark the step FAILED and finalize the
      // execution below.
      await workflowExecutionStepsRepository.updateStatus({
        id: step.id,
        status: "FAILED",
        completedAt: new Date(),
        errorMessage: error.message,
      });

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

// Enrich a step handler's output with a deterministic idempotency key derived
// from the workflow_execution_step id (not the workflow_steps template id). The
// key travels with the persisted output so a later sub-block can use it to
// detect and skip already-applied external operations.
function enrichStepOutput({ step, output }) {
  return {
    ...(output || {}),
    idempotencyKey: `workflowExecutionStep:${step.id}`,
  };
}

// Inspect a step's persisted output to decide whether its external operation
// was already applied on a previous run, returning the audit reason for the
// matching operation (or null). The strong signal is the external id
// (commentId / transitionId): its presence means the side effect happened, so
// we must not run the handler (and therefore the Jira call) again. This is
// purely local dedup based on persisted output; it does NOT cover a hard crash
// between the Jira response and persisting the output (known residual risk).
function getExternalOperationDedupReason(output) {
  if (output?.provider === "jira" && output?.operation === "comment" && output?.commentId) {
    return "comment_already_created";
  }

  if (
    output?.provider === "jira" &&
    output?.operation === "transition" &&
    output?.transitionId
  ) {
    return "transition_already_applied";
  }

  return null;
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
