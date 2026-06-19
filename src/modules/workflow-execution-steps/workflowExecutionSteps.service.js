const AppError = require("../../errors/AppError");
const workflowExecutionsRepository = require("../workflow-executions/workflowExecutions.repository");
const {
  assertCanAccessExecution,
} = require("../workflow-executions/workflowExecutionAccess");
const workflowExecutionStepsRepository = require("./workflowExecutionSteps.repository");
const {
  validateExecutionId,
} = require("../../validators/workflowExecutionSteps.validator");

async function listWorkflowExecutionSteps({ executionId, requester }) {
  const validationErrors = validateExecutionId(executionId);

  if (validationErrors.length > 0) {
    throw new AppError("Validation failed", 400, validationErrors);
  }

  const execution = await workflowExecutionsRepository.findById(executionId);

  if (!execution) {
    throw new AppError("Workflow execution not found", 404);
  }

  // Enforce department scope (throws 404 on cross-department access).
  assertCanAccessExecution(execution, requester);

  const steps = await workflowExecutionStepsRepository.findByExecutionId(
    executionId
  );

  return {
    items: steps,
  };
}

module.exports = {
  listWorkflowExecutionSteps,
};
