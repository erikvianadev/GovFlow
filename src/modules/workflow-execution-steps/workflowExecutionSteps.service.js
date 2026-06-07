const AppError = require("../../errors/AppError");
const workflowExecutionsRepository = require("../workflow-executions/workflowExecutions.repository");
const workflowExecutionStepsRepository = require("./workflowExecutionSteps.repository");
const {
  validateExecutionId,
} = require("../../validators/workflowExecutionSteps.validator");

async function listWorkflowExecutionSteps({ executionId }) {
  const validationErrors = validateExecutionId(executionId);

  if (validationErrors.length > 0) {
    throw new AppError("Validation failed", 400, validationErrors);
  }

  const execution = await workflowExecutionsRepository.findById(executionId);

  if (!execution) {
    throw new AppError("Workflow execution not found", 404);
  }

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
