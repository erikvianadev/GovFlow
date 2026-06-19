const workflowProcessingQueueService = require("./workflowProcessingQueue.service");
const asyncHandler = require("../../utils/asyncHandler");
const { successResponse } = require("../../utils/apiResponse");

const enqueue = asyncHandler(async (req, res) => {
  const result =
    await workflowProcessingQueueService.enqueueWorkflowExecutionProcessing({
      executionId: req.params.id,
      processedBy: req.user.id,
      requester: req.user,
    });

  return successResponse(res, {
    statusCode: 202,
    message: "Workflow execution processing job queued successfully",
    data: result,
  });
});

module.exports = {
  enqueue,
};
