const { createWorkflowProcessingWorker } = require("./workflowProcessing.worker");

async function start() {
  console.log("Starting workflow processing worker...");

  const worker = createWorkflowProcessingWorker();

  console.log("Workflow processing worker started.");

  async function shutdown(signal) {
    console.log(`Received ${signal}. Closing workflow processing worker...`);

    await worker.close();

    console.log("Workflow processing worker closed.");
    process.exit(0);
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch((error) => {
  console.error("Failed to start workflow processing worker:", error);
  process.exit(1);
});
