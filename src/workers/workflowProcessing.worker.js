const { Worker } = require("bullmq");

const { bullMQConnection } = require("../config/bullmq");
const {
  WORKFLOW_PROCESSING_QUEUE_NAME,
} = require("../queues/workflowProcessing.queue");
const workflowProcessorService = require("../modules/workflow-processing/workflowProcessor.service");

function createWorkflowProcessingWorker() {
  const worker = new Worker(
    WORKFLOW_PROCESSING_QUEUE_NAME,
    async (job) => {
      const { executionId, processedBy } = job.data;

      console.log("Workflow processing job started:", {
        jobId: job.id,
        executionId,
        processedBy,
      });

      if (!executionId) {
        throw new Error("Job data must include executionId");
      }

      if (!processedBy) {
        throw new Error("Job data must include processedBy");
      }

      const result = await workflowProcessorService.processWorkflowExecution({
        executionId,
        processedBy,
      });

      return {
        executionId,
        status: result.status,
      };
    },
    {
      connection: bullMQConnection,
      concurrency: 1,
    }
  );

  worker.on("completed", (job, result) => {
    console.log("Workflow processing job completed:", {
      jobId: job.id,
      result,
    });
  });

  worker.on("failed", (job, error) => {
    console.error("Workflow processing job failed:", {
      jobId: job?.id,
      executionId: job?.data?.executionId,
      error: error.message,
    });
  });

  worker.on("error", (error) => {
    console.error("Workflow processing worker error:", error);
  });

  return worker;
}

module.exports = {
  createWorkflowProcessingWorker,
};
