const healthService = require("./health.service");
const asyncHandler = require("../../utils/asyncHandler");
const { successResponse } = require("../../utils/apiResponse");
const { safeRegisterAuditLog } = require("../../utils/safeAuditLog");

const check = asyncHandler(async (req, res) => {
  const healthStatus = await healthService.getStatus();

  return successResponse(res, {
    message: "Health status retrieved successfully",
    data: healthStatus,
  });
});

const deep = asyncHandler(async (req, res) => {
  const healthStatus = await healthService.getDeepStatus();

  // Audit the controlled diagnostic access. Use the safe wrapper so a failing
  // audit log never takes down the endpoint.
  await safeRegisterAuditLog({
    action: "HEALTH_CHECK_DEEP_EXECUTED",
    entity: "health",
    entityId: "health-endpoint",
    actorId: req.user.id,
    metadata: {
      status: healthStatus.status,
      databaseStatus: healthStatus.services.database.status,
      redisStatus: healthStatus.services.redis.status,
    },
  });

  return successResponse(res, {
    message: "Deep health status retrieved successfully",
    data: healthStatus,
  });
});

module.exports = {
  check,
  deep,
};
