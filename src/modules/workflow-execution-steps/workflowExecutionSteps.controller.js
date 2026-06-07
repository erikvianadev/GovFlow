const workflowExecutionStepsService = require("./workflowExecutionSteps.service");
const asyncHandler = require("../../utils/asyncHandler");
const { successResponse } = require("../../utils/apiResponse");

const list = asyncHandler(async (req, res) => {
  const result = await workflowExecutionStepsService.listWorkflowExecutionSteps({
    executionId: req.params.executionId,
  });

  return successResponse(res, {
    message: "Workflow execution steps retrieved successfully",
    data: result.items,
  });
});

module.exports = {
  list,
};
