const workflowProcessingJobService = require("./workflowProcessingJob.service");
const asyncHandler = require("../../utils/asyncHandler");
const { successResponse } = require("../../utils/apiResponse");

const getByExecutionId = asyncHandler(async (req, res) => {
  const result =
    await workflowProcessingJobService.getWorkflowExecutionProcessingJobStatus(
      req.params.id
    );

  return successResponse(res, {
    message: "Workflow execution job status retrieved successfully",
    data: result,
  });
});

module.exports = {
  getByExecutionId,
};
