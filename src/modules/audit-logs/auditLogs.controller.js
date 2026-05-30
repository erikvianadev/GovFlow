const auditLogsService = require("./auditLogs.service");
const asyncHandler = require("../../utils/asyncHandler");
const {
  createdResponse,
  paginatedResponse,
} = require("../../utils/apiResponse");

const list = asyncHandler(async (req, res) => {
  const result = await auditLogsService.listAuditLogs({
    page: req.query.page,
    limit: req.query.limit,
    action: req.query.action,
    entity: req.query.entity,
    startDate: req.query.startDate,
    endDate: req.query.endDate,
  });

  return paginatedResponse(res, {
    message: "Audit logs retrieved successfully",
    data: result.items,
    pagination: result.pagination,
  });
});

const create = asyncHandler(async (req, res) => {
  const auditLog = await auditLogsService.register({
    action: req.body.action,
    entity: req.body.entity,
    entityId: req.body.entityId,
    actorId: req.body.actorId,
    metadata: req.body.metadata,
  });

  return createdResponse(res, {
    message: "Audit log created successfully",
    data: auditLog,
  });
});

module.exports = {
  list,
  create,
};
