const healthService = require("./health.service");
const asyncHandler = require("../../utils/asyncHandler");
const { successResponse } = require("../../utils/apiResponse");

const check = asyncHandler(async (req, res) => {
  const healthStatus = await healthService.getStatus();

  return successResponse(res, {
    message: "Health status retrieved successfully",
    data: healthStatus,
  });
});

module.exports = {
  check,
};