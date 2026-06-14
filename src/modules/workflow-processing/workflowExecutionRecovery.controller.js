const workflowExecutionRecoveryService = require("./workflowExecutionRecovery.service");
const asyncHandler = require("../../utils/asyncHandler");
const { successResponse } = require("../../utils/apiResponse");

const recoverStaleRunning = asyncHandler(async (req, res) => {
  const result =
    await workflowExecutionRecoveryService.recoverStaleRunningExecutions({
      recoveredBy: req.user.id,
      timeoutMinutes: req.body.timeoutMinutes,
      limit: req.body.limit,
    });

  return successResponse(res, {
    message: "Stale running workflow executions recovered successfully",
    data: result,
  });
});

module.exports = {
  recoverStaleRunning,
};
