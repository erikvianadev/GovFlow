const AppError = require("../../errors/AppError");
const workflowExecutionsRepository = require("../workflow-executions/workflowExecutions.repository");
const {
  assertCanAccessExecution,
} = require("../workflow-executions/workflowExecutionAccess");
const {
  buildWorkflowProcessingJobId,
  WORKFLOW_PROCESSING_QUEUE_NAME,
  workflowProcessingQueue,
} = require("../../queues/workflowProcessing.queue");
const {
  validateWorkflowExecutionId,
} = require("../../validators/workflowExecutions.validator");

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return null;
  }

  return new Date(timestamp).toISOString();
}

async function getWorkflowExecutionProcessingJobStatus(executionId, requester) {
  const validationErrors = validateWorkflowExecutionId(executionId);

  if (validationErrors.length > 0) {
    throw new AppError("Validation failed", 400, validationErrors);
  }

  const execution = await workflowExecutionsRepository.findById(executionId);

  if (!execution) {
    throw new AppError("Workflow execution not found", 404);
  }

  // Enforce department scope (throws 404 on cross-department access).
  assertCanAccessExecution(execution, requester);

  const jobId = buildWorkflowProcessingJobId(executionId);
  const job = await workflowProcessingQueue.getJob(jobId);

  if (!job) {
    return {
      executionId,
      jobId,
      queueName: WORKFLOW_PROCESSING_QUEUE_NAME,
      state: "not_found",
      attemptsMade: 0,
      attemptsStarted: 0,
      maxAttempts: null,
      failedReason: null,
      processedOn: null,
      finishedOn: null,
    };
  }

  const state = await job.getState();

  return {
    executionId,
    jobId: job.id,
    queueName: job.queueName || WORKFLOW_PROCESSING_QUEUE_NAME,
    state,
    attemptsMade: job.attemptsMade ?? 0,
    attemptsStarted: job.attemptsStarted ?? job.attemptsMade ?? 0,
    maxAttempts: job.opts?.attempts ?? null,
    failedReason: job.failedReason || null,
    processedOn: formatTimestamp(job.processedOn),
    finishedOn: formatTimestamp(job.finishedOn),
  };
}

module.exports = {
  getWorkflowExecutionProcessingJobStatus,
};
