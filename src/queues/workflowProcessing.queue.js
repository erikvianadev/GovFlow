const { Queue } = require("bullmq");

const { bullMQConnection } = require("../config/bullmq");

const WORKFLOW_PROCESSING_QUEUE_NAME = "workflow-processing";

const workflowProcessingQueue = new Queue(WORKFLOW_PROCESSING_QUEUE_NAME, {
  connection: bullMQConnection,
  defaultJobOptions: {
    removeOnComplete: { count: 100 }, // Keep the last 100 completed jobs, remove older ones
    removeOnFail: { count: 50 }, // Keep the last 50 failed jobs, remove older ones
  },
});

module.exports = {
  WORKFLOW_PROCESSING_QUEUE_NAME,
  workflowProcessingQueue,
};
