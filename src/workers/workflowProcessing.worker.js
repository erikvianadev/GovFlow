const { Worker, UnrecoverableError } = require("bullmq");

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
        attemptsMade: job.attemptsMade,
      });

      if (!executionId) {
        throw new UnrecoverableError("Job data must include executionId");
      }

      if (!processedBy) {
        throw new UnrecoverableError("Job data must include processedBy");
      }

      if (
        process.env.NODE_ENV !== "production" &&
        job.data.simulateTechnicalFailure === true
      ) {
        throw new Error("Simulated technical failure");
      }

      const result = await workflowProcessorService.processWorkflowExecution({
        executionId,
        processedBy,
      });

      if (result.status === "FAILED") {
        throw new UnrecoverableError(
          result.result?.failedStep?.error ||
            "Workflow execution failed by business rule"
        );
      }

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
      attemptsMade: job?.attemptsMade,
      attemptsStarted: job?.attemptsStarted,
      failedReason: error.message,
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
