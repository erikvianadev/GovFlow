const workflowExecutionRecoveryService = require("../src/modules/workflow-processing/workflowExecutionRecovery.service");

async function recoverStaleWorkflowExecutions() {
  try {
    const result =
      await workflowExecutionRecoveryService.recoverStaleRunningExecutions();

    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (error) {
    console.error("Error recovering stale workflow executions:", error);
    process.exit(1);
  }
}

recoverStaleWorkflowExecutions();
