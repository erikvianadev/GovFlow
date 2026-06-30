const { Worker, UnrecoverableError } = require("bullmq");

const { bullMQConnection } = require("../config/bullmq");
const {
  WORKFLOW_PROCESSING_QUEUE_NAME,
} = require("../queues/workflowProcessing.queue");
const workflowProcessorService = require("../modules/workflow-processing/workflowProcessor.service");
const logger = require("../config/logger");

function createWorkflowProcessingWorker() {
  const worker = new Worker(
    WORKFLOW_PROCESSING_QUEUE_NAME,
    async (job) => {
      const { executionId, processedBy } = job.data;

      // Correlate every log line for this job (start, downstream Jira calls,
      // completion) with the same executionId/jobId.
      const log = logger.child({ executionId, jobId: job.id });

      log.info(
        {
          processedBy,
          attemptsMade: job.attemptsMade,
        },
        "Workflow processing job started"
      );

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
    logger.info(
      {
        jobId: job.id,
        executionId: job?.data?.executionId,
        result,
      },
      "Workflow processing job completed"
    );
  });

  worker.on("failed", (job, error) => {
    logger.error(
      {
        jobId: job?.id,
        executionId: job?.data?.executionId,
        attemptsMade: job?.attemptsMade,
        attemptsStarted: job?.attemptsStarted,
        failedReason: error.message,
      },
      "Workflow processing job failed"
    );
  });

  worker.on("error", (error) => {
    logger.error({ err: error }, "Workflow processing worker error");
  });

  return worker;
}

module.exports = {
  createWorkflowProcessingWorker,
};
