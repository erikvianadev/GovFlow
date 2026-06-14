const { Queue } = require("bullmq");

const { bullMQConnection } = require("../config/bullmq");

const WORKFLOW_PROCESSING_QUEUE_NAME = "workflow-processing";

const workflowProcessingQueue = new Queue(WORKFLOW_PROCESSING_QUEUE_NAME, {
  connection: bullMQConnection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false,
  },
});

module.exports = {
  WORKFLOW_PROCESSING_QUEUE_NAME,
  workflowProcessingQueue,
};
