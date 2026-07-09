const adminQueueService = require("./adminQueue.service");
const asyncHandler = require("../../utils/asyncHandler");
const { successResponse } = require("../../utils/apiResponse");

const getStats = asyncHandler(async (req, res) => {
  const result = await adminQueueService.getQueueStats();

  return successResponse(res, {
    message: "Queue stats retrieved successfully",
    data: result,
  });
});

const listJobs = asyncHandler(async (req, res) => {
  const { state, page, limit } = req.query;

  const result = await adminQueueService.listJobs({ state, page, limit });

  return successResponse(res, {
    message: "Queue jobs retrieved successfully",
    data: result,
  });
});

const retryJob = asyncHandler(async (req, res) => {
  const result = await adminQueueService.retryJob(req.params.jobId);

  return successResponse(res, {
    statusCode: 202,
    message: "Job retry requested successfully",
    data: result,
  });
});

const deleteJob = asyncHandler(async (req, res) => {
  const result = await adminQueueService.deleteJob(req.params.jobId);

  return successResponse(res, {
    message: "Job deleted successfully",
    data: result,
  });
});

module.exports = {
  deleteJob,
  getStats,
  listJobs,
  retryJob,
};
