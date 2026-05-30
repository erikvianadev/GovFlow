const auditLogsService = require("./auditLogs.service");
const asyncHandler = require("../../utils/asyncHandler");

const list = asyncHandler(async (req, res) => {
  const result = await auditLogsService.listAuditLogs({
    page: req.query.page,
    limit: req.query.limit,
  });

  return res.status(200).json(result);
});

const create = asyncHandler(async (req, res) => {
  const auditLog = await auditLogsService.register({
    action: req.body.action,
    entity: req.body.entity,
    entityId: req.body.entityId,
    actorId: req.body.actorId,
    metadata: req.body.metadata,
  });

  return res.status(200).json(auditLog)
})

module.exports = {
  list,
  create,
};