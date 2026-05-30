const auditLogsService = require("./auditLogs.service");
const asyncHandler = require("../../utils/asyncHandler");

const list = asyncHandler(async (req, res) => {
  const result = await auditLogsService.listAuditLogs({
    page: req.query.page,
    limit: req.query.limit,
  });

  return res.status(200).json(result);
});

module.exports = {
  list,
};