const workflowProcessorService = require("./workflowProcessor.service");
const asyncHandler = require("../../utils/asyncHandler");
const { successResponse } = require("../../utils/apiResponse");

const process = asyncHandler(async (req, res) => {
  const result = await workflowProcessorService.processWorkflowExecution({
    executionId: req.params.id,
    processedBy: req.user.id,
  });

  return successResponse(res, {
    message: "Workflow execution processed successfully",
    data: result,
  });
});

module.exports = {
  process,
};
