const { Queue } = require("bullmq");

const { bullMQConnection } = require("../config/bullmq");

const WORKFLOW_PROCESSING_QUEUE_NAME = "workflow-processing";

function buildWorkflowProcessingJobId(executionId) {
  return `workflow-execution-${executionId}`;
}

const workflowProcessingQueue = new Queue(WORKFLOW_PROCESSING_QUEUE_NAME, {
  connection: bullMQConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 3000,
    },
    removeOnComplete: false,
    removeOnFail: false,
  },
});

module.exports = {
  buildWorkflowProcessingJobId,
  WORKFLOW_PROCESSING_QUEUE_NAME,
  workflowProcessingQueue,
};
