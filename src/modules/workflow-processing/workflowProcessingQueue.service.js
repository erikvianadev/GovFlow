const AppError = require("../../errors/AppError");
const workflowExecutionsRepository = require("../workflow-executions/workflowExecutions.repository");
const {
  assertCanAccessExecution,
} = require("../workflow-executions/workflowExecutionAccess");
const {
  buildWorkflowProcessingJobId,
  workflowProcessingQueue,
} = require("../../queues/workflowProcessing.queue");
const {
  validateWorkflowExecutionId,
} = require("../../validators/workflowExecutions.validator");

async function enqueueWorkflowExecutionProcessing({
  executionId,
  processedBy,
  requester,
}) {
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

  // Enforce department scope (throws 404 on cross-department access) before
  // allowing the requester to trigger external Jira side effects.
  assertCanAccessExecution(execution, requester);

  if (execution.status !== "PENDING") {
    throw new AppError("Only PENDING workflow executions can be queued", 409);
  }

  const job = await workflowProcessingQueue.add(
    "process-workflow-execution",
    {
      executionId,
      processedBy,
    },
    {
      jobId: buildWorkflowProcessingJobId(executionId),
    }
  );

  return {
    jobId: job.id,
    queueName: job.queueName,
    executionId,
    status: "QUEUED",
  };
}

module.exports = {
  enqueueWorkflowExecutionProcessing,
};
