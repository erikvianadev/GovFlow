const AppError = require("../../errors/AppError");
const workflowExecutionsRepository = require("../workflow-executions/workflowExecutions.repository");
const {
  workflowProcessingQueue,
} = require("../../queues/workflowProcessing.queue");
const {
  validateWorkflowExecutionId,
} = require("../../validators/workflowExecutions.validator");

async function enqueueWorkflowExecutionProcessing({ executionId, processedBy }) {
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
    throw new AppError("Only PENDING workflow executions can be queued", 409);
  }

  const job = await workflowProcessingQueue.add(
    "process-workflow-execution",
    {
      executionId,
      processedBy,
    },
    {
      jobId: `workflow-execution-${executionId}`,
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
