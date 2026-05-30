const healthService = require("./health.service");
const asyncHandler = require("../../utils/asyncHandler");

const check = asyncHandler(async (req, res) => {
  const healthStatus = await healthService.getStatus();

  return res.status(200).json(healthStatus);
});

module.exports = {
  check,
};