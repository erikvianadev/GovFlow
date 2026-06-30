const { createWorkflowProcessingWorker } = require("./workflowProcessing.worker");
const logger = require("../config/logger");

async function start() {
  logger.info("Starting workflow processing worker...");

  const worker = createWorkflowProcessingWorker();

  logger.info("Workflow processing worker started.");

  async function shutdown(signal) {
    logger.info({ signal }, "Closing workflow processing worker");

    await worker.close();

    logger.info("Workflow processing worker closed.");
    process.exit(0);
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch((error) => {
  logger.error({ err: error }, "Failed to start workflow processing worker");
  process.exit(1);
});
